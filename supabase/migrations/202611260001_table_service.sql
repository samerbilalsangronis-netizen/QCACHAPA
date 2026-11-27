begin;

alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('admin','cashier','kitchen','waiter'));
alter table public.orders drop constraint orders_source_check;
alter table public.orders add constraint orders_source_check check (source in ('web','pos','floor'));

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 40),
  active boolean not null default true
);
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.dining_tables,
  waiter uuid not null references public.staff,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.staff
);
create unique index table_one_open on public.table_sessions(table_id) where closed_at is null;
alter table public.orders add column table_session_id uuid references public.table_sessions;
create index orders_table_session on public.orders(table_session_id) where table_session_id is not null;

alter table public.dining_tables enable row level security;
alter table public.table_sessions enable row level security;
revoke all on public.dining_tables, public.table_sessions from public, anon, authenticated;
grant select, insert, update on public.dining_tables to authenticated;
create policy dining_tables_admin on public.dining_tables for all to authenticated
  using (public.staff_role() = 'admin') with check (public.staff_role() = 'admin');

create function public.open_table_session(p_table uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare session_id uuid;
begin
  if coalesce(public.staff_role(),'') not in ('waiter','admin','cashier') then raise exception 'Sin permiso'; end if;
  perform 1 from public.dining_tables where id = p_table and active for update;
  if not found then raise exception 'Mesa no disponible'; end if;

  select id into session_id from public.table_sessions
  where table_id = p_table and closed_at is null and waiter = auth.uid();
  if found then return session_id; end if;
  if exists(select 1 from public.table_sessions where table_id = p_table and closed_at is null) then
    raise exception 'Otro integrante del equipo ya abrió esta mesa';
  end if;
  insert into public.table_sessions(table_id,waiter) values(p_table,auth.uid()) returning id into session_id;
  return session_id;
end $$;

create function public.table_service_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare role_name text := coalesce(public.staff_role(),'');
begin
  if role_name not in ('waiter','cashier','admin') then raise exception 'Sin permiso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', desk.id, 'name',desk.name, 'active',desk.active, 'occupied',session_row.id is not null,
      'session',case when session_row.id is not null and (role_name in ('admin','cashier') or session_row.waiter=auth.uid())
        then jsonb_build_object('id',session_row.id,'orders',coalesce((
          select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'status',o.status,'total',o.total,
            'paid',p.id is not null) order by o.number)
          from public.orders o left join public.payments p on p.order_id=o.id where o.table_session_id=session_row.id
        ),'[]'::jsonb)) end
    ) order by desk.name,desk.id)
    from public.dining_tables desk left join public.table_sessions session_row on session_row.table_id=desk.id and session_row.closed_at is null
    where desk.active or role_name = 'admin' or session_row.id is not null
  ),'[]'::jsonb);
end $$;

create function public.close_table_session(p_session uuid,p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare order_id uuid;
begin
  if coalesce(public.staff_role(),'') not in ('admin','cashier') then raise exception 'Sin permiso'; end if;
  if p_method is null or p_method not in ('cash','terminal','transfer') then raise exception 'Método de pago inválido'; end if;
  perform 1 from public.table_sessions where id=p_session and closed_at is null for update;
  if not found then raise exception 'La cuenta de esta mesa ya está cerrada'; end if;
  perform 1 from public.orders where table_session_id=p_session order by id for update;
  if exists(select 1 from public.orders where table_session_id=p_session and status not in ('delivered','cancelled')) then
    raise exception 'Confirma la entrega o cancela las comandas pendientes antes de cerrar la mesa';
  end if;
  for order_id in select o.id from public.orders o
    where o.table_session_id=p_session and o.status='delivered'
    and not exists(select 1 from public.payments paid where paid.order_id=o.id)
    order by o.id
  loop
    perform public.record_payment(order_id,p_method);
  end loop;
  update public.table_sessions set closed_at=now(),closed_by=auth.uid() where id=p_session;
end $$;

revoke all on function public.open_table_session(uuid), public.table_service_overview(), public.close_table_session(uuid,text) from public;
grant execute on function public.open_table_session(uuid), public.table_service_overview(), public.close_table_session(uuid,text) to authenticated;

-- Shared kitchen projection for both cashier confirmation and direct table service.
create function public.publish_kitchen_ticket(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.kitchen_tickets(id,number,source,mode,table_name,notes,created_at,status,prep_minutes,lines)
  select o.id,o.number,o.source,o.mode,o.table_name,o.notes,o.created_at,o.status,o.prep_minutes,
    (select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'quantity',l.quantity,'notes',l.notes,'prepared',false) order by l.id)
     from public.order_lines l where l.order_id=o.id)
  from public.orders o where o.id=p_id and o.status='confirmed';
$$;
revoke all on function public.publish_kitchen_ticket(uuid) from public;

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
  service_session uuid;
  service_name text;
  actor_role text := coalesce(public.staff_role(),'');
begin
  if p_key is null or p_source is null or p_source not in ('web','pos','floor') then
    raise exception 'Solicitud inválida';
  end if;
  if p_source = 'pos' then
    if coalesce(public.staff_role(), '') not in ('admin','cashier') then raise exception 'Sin permiso'; end if;
  end if;
  if p_source = 'floor' then
    if actor_role not in ('waiter','cashier','admin') then raise exception 'Sin permiso'; end if;
    if p_table is null or p_table !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then
      raise exception 'Selecciona una cuenta de mesa válida';
    end if;
    select s.id,d.name into service_session,service_name
    from public.table_sessions s join public.dining_tables d on d.id=s.table_id
    where s.id=p_table::uuid and (s.waiter=auth.uid() or actor_role in ('admin','cashier')) for update of s;
    if not found then raise exception 'Sin permiso sobre esta cuenta de mesa'; end if;
    p_mode := 'table'; p_customer := service_name; p_table := service_name; p_phone := null;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text, 0));
  select * into sale from public.orders where request_key = p_key and source = p_source
    and (p_source <> 'floor' or table_session_id=service_session);
  if found then
    return jsonb_build_object('number',sale.number,'tracking_key',sale.tracking_key,'total',sale.total);
  end if;
  if p_source = 'pos' then
    select id into active_shift from public.shifts where cashier = auth.uid() and closed_at is null for update;
    if not found then raise exception 'Abre un turno de caja'; end if;
  elsif p_source = 'floor' then
    if not exists(select 1 from public.table_sessions where id=service_session and closed_at is null) then
      raise exception 'La cuenta de esta mesa está cerrada';
    end if;
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

  insert into public.orders(request_key,source,mode,customer,phone,table_name,notes,shift_id,table_session_id)
    values(p_key,p_source,p_mode,trim(p_customer),p_phone,p_table,p_notes,active_shift,service_session)
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
  if p_source='floor' then
    update public.orders set status='confirmed' where id=sale.id;
    insert into public.order_events(order_id,status,actor) values(sale.id,'confirmed',auth.uid());
    perform public.publish_kitchen_ticket(sale.id);
  end if;
  return jsonb_build_object('number',sale.number,'tracking_key',sale.tracking_key,'total',amount);
end $$;

create or replace function public.move_order(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  sale public.orders;
  actor_role text := coalesce(public.staff_role(), '');
begin
  if actor_role not in ('admin','cashier','kitchen') then raise exception 'Sin permiso'; end if;
  select * into sale from public.orders where id = p_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if p_status is null or not (
    (actor_role in ('admin','cashier') and (
      (sale.status = 'received' and p_status = 'confirmed') or
      (sale.status = 'ready' and p_status = 'delivered')
    )) or
    (actor_role in ('admin','kitchen') and (
      (sale.status = 'confirmed' and p_status = 'preparing') or
      (sale.status = 'preparing' and p_status = 'ready')
    )) or
    (actor_role = 'admin' and p_status = 'cancelled' and sale.status not in ('delivered','cancelled')
      and coalesce(length(trim(p_reason)),0) between 1 and 500
      and not exists(select 1 from public.payments where order_id = sale.id))
  ) then raise exception 'Cambio de estado no permitido'; end if;
  update public.orders set status = p_status,
    delivered_by = case when p_status = 'delivered' then auth.uid() else delivered_by end
    where id = sale.id;
  insert into public.order_events(order_id,status,actor,reason) values(sale.id,p_status,auth.uid(),p_reason);
  if p_status = 'confirmed' then
    perform public.publish_kitchen_ticket(sale.id);
  else
    update public.kitchen_tickets set status = p_status where id = sale.id;
  end if;
end $$;

commit;
