begin;

alter table public.business add column checkout jsonb not null default
  '{"delivery_enabled":false,"delivery_fee":0,"schedule_enabled":true,"terminal_enabled":true}'::jsonb
  check (jsonb_typeof(checkout) = 'object');
alter table public.orders drop constraint orders_mode_check;
alter table public.orders add constraint orders_mode_check check (mode in ('pickup','table','delivery'));
alter table public.orders add column checkout_details jsonb not null default '{}'::jsonb;
alter table public.kitchen_tickets add column scheduled_at timestamptz;

-- Keep the catalog validation, price calculation, rate limit and kitchen rules
-- in place_order. The web wrapper adds validated fulfillment and payment details
-- to the same transaction.
create function public.place_web_order(
  p_key uuid, p_mode text, p_customer text, p_phone text, p_table text,
  p_notes text, p_lines jsonb, p_details jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sale public.orders;
  business_row public.business;
  result jsonb;
  address text := nullif(trim(p_details->>'address'),'');
  landmark text := nullif(trim(p_details->>'landmark'),'');
  latitude numeric;
  longitude numeric;
  local_slot text := nullif(p_details->>'schedule_local','');
  scheduled timestamptz;
  payment text := p_details->>'payment';
  payment_instructions text;
  tender_currency text;
  tender_amount numeric;
  rate numeric;
  fee numeric := 0;
  total_due numeric;
begin
  if p_key is null or p_mode is null or p_mode not in ('pickup','table','delivery')
    or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Revisa los datos del pedido';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  select * into sale from public.orders where request_key=p_key and source='web';
  if found then
    return jsonb_build_object('number',sale.number,'tracking_key',sale.tracking_key,'total',sale.total);
  end if;

  select * into strict business_row from public.business where id for share;
  if length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 10 and 15 then
    raise exception 'Escribe un número de WhatsApp válido';
  end if;
  if p_mode='delivery' then
    if (business_row.checkout->>'delivery_enabled')::boolean is distinct from true then
      raise exception 'El delivery ya no está disponible';
    end if;
    if coalesce(length(address),0) not between 5 and 240 or length(landmark) > 160 then
      raise exception 'Revisa la dirección y el punto de referencia';
    end if;
    fee := coalesce((business_row.checkout->>'delivery_fee')::numeric,0);
    if fee not between 0 and 9999.99 or fee <> round(fee,2) then
      raise exception 'El delivery no está disponible en este momento';
    end if;
    latitude := (p_details->>'latitude')::numeric;
    longitude := (p_details->>'longitude')::numeric;
    if (latitude is null) <> (longitude is null) or latitude not between -90 and 90
       or longitude not between -180 and 180 then
      raise exception 'Ubicación inválida';
    end if;
  else
    address := null; landmark := null;
  end if;
  if (p_details->>'expected_fee')::numeric is distinct from fee then
    raise exception 'Cambió el costo de entrega. Revisa el total antes de confirmar';
  end if;

  if local_slot is not null then
    if (business_row.checkout->>'schedule_enabled')::boolean is distinct from true or p_mode='table' then
      raise exception 'Esta modalidad no admite pedidos programados';
    end if;
    if local_slot !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then
      raise exception 'Elige una fecha y hora válidas';
    end if;
    begin
      scheduled := local_slot::timestamp at time zone business_row.timezone;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Elige una fecha y hora válidas';
    end;
    if scheduled < now()+interval '10 minutes' or scheduled > now()+interval '7 days' then
      raise exception 'Programa el pedido entre 10 minutos y 7 días desde ahora';
    end if;
  end if;

  if payment is null or not (
    payment='cash' or
    (payment='terminal' and p_mode<>'delivery' and coalesce((business_row.checkout->>'terminal_enabled')::boolean,false)) or
    (payment='transfer' and coalesce(length(trim(business_row.checkout->>'transfer_instructions')),0)>0) or
    (payment='binance' and coalesce(length(trim(business_row.checkout->>'binance_instructions')),0)>0)
  ) then
    raise exception 'Selecciona un método de pago disponible';
  end if;
  rate := (business_row.checkout->>'ves_rate')::numeric;
  if rate is not null and rate not between 0.0001 and 100000000 then rate := null; end if;
  payment_instructions := case payment
    when 'transfer' then left(business_row.checkout->>'transfer_instructions',500)
    when 'binance' then left(business_row.checkout->>'binance_instructions',500)
  end;

  if payment='cash' then
    tender_currency := p_details->>'cash_currency';
    if tender_currency is null or tender_currency not in ('USD','VES') or (tender_currency='VES' and rate is null) then
      raise exception 'Selecciona una moneda válida para el efectivo';
    end if;
    tender_amount := (p_details->>'cash_amount')::numeric;
    if tender_amount is not null and (tender_amount not between 0 and 999999999999.99 or tender_amount <> round(tender_amount,2)) then
      raise exception 'Revisa el monto del efectivo';
    end if;
  end if;
  if (payment='transfer' or tender_currency='VES') and (p_details->>'expected_rate')::numeric is distinct from rate then
    raise exception 'Cambió la tasa en bolívares. Revisa el total antes de confirmar';
  end if;

  result := public.place_order(p_key,'web',case when p_mode='delivery' then 'pickup' else p_mode end,
    p_customer,trim(p_phone),case when p_mode='table' then p_table else null end,p_notes,p_lines);
  total_due := (result->>'total')::numeric + fee;
  if tender_amount < round(total_due * case when tender_currency='VES' then rate else 1 end,2) then
    raise exception 'El efectivo indicado debe cubrir el total del pedido';
  end if;
  update public.orders set mode=p_mode,total=total_due,checkout_details=jsonb_strip_nulls(jsonb_build_object(
    'address',address,'landmark',landmark,'latitude',latitude,'longitude',longitude,'delivery_fee',fee,
    'scheduled_at',scheduled,'payment',payment,'payment_instructions',payment_instructions,
    'cash_currency',tender_currency,'cash_amount',tender_amount,'ves_rate',rate
  )) where request_key=p_key;
  return result || jsonb_build_object('total',total_due);
end $$;
revoke all on function public.place_web_order(uuid,text,text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.place_web_order(uuid,text,text,text,text,text,jsonb,jsonb) to anon, authenticated;

create or replace function public.publish_kitchen_ticket(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.kitchen_tickets(id,number,source,mode,table_name,notes,created_at,status,prep_minutes,lines,scheduled_at)
  select o.id,o.number,o.source,o.mode,o.table_name,o.notes,o.created_at,o.status,o.prep_minutes,
    (select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'quantity',l.quantity,'notes',l.notes,'prepared',false) order by l.id)
     from public.order_lines l where l.order_id=o.id), (o.checkout_details->>'scheduled_at')::timestamptz
  from public.orders o where o.id=p_id and o.status='confirmed';
$$;

-- A dispatch is a milestone within an operationally ready order. Existing
-- closing, payment and reporting rules continue to use the order status.
create function public.dispatch_web_order(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.staff_role(),'') not in ('admin','cashier') then raise exception 'Sin permiso'; end if;
  update public.orders set checkout_details=checkout_details || jsonb_build_object('dispatched_at',now())
    where id=p_id and mode='delivery' and status='ready' and not checkout_details ? 'dispatched_at';
  if not found then raise exception 'El pedido no está listo para salir'; end if;
  insert into public.order_events(order_id,status,actor) values(p_id,'out_for_delivery',auth.uid());
  update public.kitchen_tickets set status='out_for_delivery' where id=p_id;
end $$;
revoke all on function public.dispatch_web_order(uuid) from public;
grant execute on function public.dispatch_web_order(uuid) to authenticated;

create or replace function public.track_order(p_key uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number',o.number,'status',case when o.status='ready' and o.checkout_details ? 'dispatched_at'
      then 'out_for_delivery' else o.status end,
    'created_at',o.created_at,'prep_minutes',o.prep_minutes,'mode',o.mode,'total',o.total,
    'scheduled_at',o.checkout_details->>'scheduled_at','payment',o.checkout_details->>'payment',
    'payment_instructions',o.checkout_details->>'payment_instructions','ves_rate',o.checkout_details->'ves_rate',
    'delivery_fee',coalesce(o.checkout_details->'delivery_fee','0'::jsonb),
    'paid',exists(select 1 from public.payments p where p.order_id=o.id),
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,'unit_price',l.price,'notes',l.notes)
      order by l.id) from public.order_lines l where l.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_object_agg(e.status,e.occurred) from (
      select status,min(created_at) occurred from public.order_events where order_id=o.id group by status
    ) e),'{}'::jsonb)
  )
  from public.orders o where o.tracking_key=p_key
$$;

commit;
