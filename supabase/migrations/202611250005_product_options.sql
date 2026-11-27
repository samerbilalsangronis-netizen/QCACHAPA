begin;

create function public.valid_product_options(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  option_row jsonb;
  ids text[] := '{}';
  option_id text;
  amount numeric;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) > 12 then return false; end if;
  for option_row in select * from jsonb_array_elements(value) loop
    option_id := option_row->>'id';
    if jsonb_typeof(option_row) is distinct from 'object'
      or option_id is null or option_id !~ '^[a-zA-Z0-9-]{1,64}$' or option_id = any(ids)
      or jsonb_typeof(option_row->'label') is distinct from 'string'
      or length(trim(option_row->>'label')) not between 1 and 70
      or coalesce(option_row->>'kind','') not in ('extra','remove')
      or jsonb_typeof(option_row->'price') is distinct from 'number'
    then return false; end if;
    amount := (option_row->>'price')::numeric;
    if amount not between 0 and 9999.99 or amount <> round(amount,2)
      or (option_row->>'kind'='remove' and amount <> 0) then return false; end if;
    ids := array_append(ids,option_id);
  end loop;
  return true;
end $$;

alter table public.products add column options jsonb not null default '[]'::jsonb
  check (public.valid_product_options(options));
alter table public.order_lines add column options jsonb not null default '[]'::jsonb;

create or replace function public.place_order(
  p_key uuid, p_source text, p_mode text, p_customer text, p_phone text,
  p_table text, p_notes text, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sale public.orders;
  item jsonb;
  product public.products;
  units integer;
  chosen_ids jsonb;
  chosen_options jsonb;
  line_price numeric;
  option_notes text;
  amount numeric(12,2) := 0;
  minutes integer := 1;
  active_shift uuid;
begin
  if p_key is null or p_source is null or p_source not in ('web','pos') then
    raise exception 'Solicitud inválida';
  end if;
  if p_source = 'pos' then
    if coalesce(public.staff_role(), '') not in ('admin','cashier') then raise exception 'Sin permiso'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text, 0));
  select * into sale from public.orders where request_key = p_key and source = p_source;
  if found then
    return jsonb_build_object('number',sale.number,'tracking_key',sale.tracking_key,'total',sale.total);
  end if;
  if p_source = 'pos' then
    select id into active_shift from public.shifts where cashier = auth.uid() and closed_at is null for update;
    if not found then raise exception 'Abre un turno de caja'; end if;
  elsif not exists(select 1 from public.business where accepting_orders) then
    raise exception 'Los pedidos en línea están cerrados';
  end if;
  if p_source = 'web' then
    perform pg_catalog.pg_advisory_xact_lock(101891, 1);
    if (select count(*) from public.orders where source = 'web' and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'Hay muchos pedidos en este momento. Intenta nuevamente en un minuto';
    end if;
  end if;
  if p_mode is null or p_mode not in ('pickup','table') or
     (p_mode = 'table' and coalesce(length(trim(p_table)),0) = 0) or
     coalesce(length(trim(p_customer)),0) not between 1 and 100 or
     length(p_phone) > 40 or length(p_table) > 40 or length(p_notes) > 500 or
     jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Revisa los datos del pedido';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 40 then raise exception 'Revisa los productos del pedido'; end if;

  insert into public.orders(request_key,source,mode,customer,phone,table_name,notes,shift_id)
    values(p_key,p_source,p_mode,trim(p_customer),p_phone,p_table,p_notes,active_shift)
    returning * into sale;
  for item in select value from jsonb_array_elements(p_lines) loop
    select * into product from public.products where id = (item->>'product_id')::uuid and available for share;
    if not found then raise exception 'Un producto ya no está disponible'; end if;
    chosen_ids := coalesce(item->'option_ids','[]'::jsonb);
    if jsonb_typeof(chosen_ids) is distinct from 'array' then
      raise exception 'Revisa las opciones del producto';
    end if;
    if jsonb_array_length(chosen_ids) > 12 then raise exception 'Revisa las opciones del producto'; end if;

    -- Resolve choices against the currently published catalog. Preserve their
    -- labels and prices in the order even if staff later edit the product.
    select coalesce(jsonb_agg(entry order by position),'[]'::jsonb),
      product.price + coalesce(sum((entry->>'price')::numeric),0),
      string_agg(case entry->>'kind' when 'remove' then 'Sin ' else 'Extra: ' end || (entry->>'label'), ', ' order by position)
      into chosen_options,line_price,option_notes
      from jsonb_array_elements(product.options) with ordinality as choices(entry,position)
      where chosen_ids ? (entry->>'id');
    if jsonb_array_length(chosen_options) <> jsonb_array_length(chosen_ids) then
      raise exception 'Las opciones del producto cambiaron. Revisa tu pedido';
    end if;
    if (item->>'expected_price')::numeric is distinct from line_price then
      raise exception 'Cambió el precio de un producto. Revisa el total antes de confirmar';
    end if;
    units := (item->>'quantity')::integer;
    if units is null or units not between 1 and 99 or length(item->>'notes') > 300 then
      raise exception 'Revisa las cantidades y observaciones';
    end if;
    insert into public.order_lines(order_id,product_id,name,price,quantity,notes,options)
      values(sale.id,product.id,product.name,line_price,units,
        concat_ws(E'\n',option_notes,nullif(item->>'notes','')),chosen_options);
    amount := amount + line_price * units;
    minutes := greatest(minutes, product.prep_minutes);
  end loop;
  update public.orders set total = amount, prep_minutes = minutes where id = sale.id;
  insert into public.order_events(order_id,status,actor) values(sale.id,'received',auth.uid());
  return jsonb_build_object('number',sale.number,'tracking_key',sale.tracking_key,'total',amount);
end $$;

commit;
