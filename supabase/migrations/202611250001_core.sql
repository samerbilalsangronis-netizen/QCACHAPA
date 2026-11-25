begin;

create table public.business (
  id boolean primary key default true check (id),
  name text not null default 'Q''Cachapas',
  slogan text not null default '¡Lo mejor del maíz en su mesa!',
  logo_url text, hero_url text, address text, hours text, whatsapp text,
  accepting_orders boolean not null default false,
  timezone text not null default 'America/Caracas'
);
insert into public.business default values;

create table public.staff (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','cashier','kitchen')),
  active boolean not null default true
);
create function public.staff_role() returns text language sql stable security definer
set search_path = '' as $$
  select role from public.staff where id = auth.uid() and active
$$;
revoke all on function public.staff_role() from public;
grant execute on function public.staff_role() to anon, authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(), name text not null unique
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories,
  name text not null, description text not null default '',
  image_url text, price numeric(12,2) not null check (price >= 0),
  available boolean not null default true,
  prep_minutes integer not null default 20 check (prep_minutes between 1 and 1440)
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(), cashier uuid not null references public.staff,
  opened_at timestamptz not null default now(), closed_at timestamptz,
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  counted_cash numeric(12,2) check (counted_cash >= 0),
  expected_cash numeric(12,2)
);
create unique index shifts_one_open on public.shifts(cashier) where closed_at is null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  request_key uuid not null unique, tracking_key uuid not null unique default gen_random_uuid(),
  source text not null check (source in ('web','pos')),
  mode text not null check (mode in ('pickup','table')),
  customer text not null, phone text, table_name text, notes text,
  status text not null default 'received' check (status in ('received','confirmed','preparing','ready','delivered','cancelled')),
  total numeric(12,2) not null default 0,
  prep_minutes integer not null default 1,
  created_at timestamptz not null default now(),
  shift_id uuid references public.shifts,
  delivered_by uuid references public.staff
);
create index orders_status_time on public.orders(status, created_at);
create index orders_web_rate on public.orders(created_at) where source = 'web';
create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders, product_id uuid not null references public.products,
  name text not null, price numeric(12,2) not null,
  quantity integer not null check (quantity between 1 and 99),
  notes text not null default ''
);
create index order_lines_order on public.order_lines(order_id);
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders, status text not null,
  actor uuid, reason text, created_at timestamptz not null default now()
);
create table public.kitchen_tickets (
  id uuid primary key references public.orders, number bigint not null, source text not null,
  mode text not null, table_name text, notes text, created_at timestamptz not null,
  status text not null, prep_minutes integer not null, lines jsonb not null
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders,
  shift_id uuid not null references public.shifts, method text not null check(method in ('cash','terminal','transfer')),
  amount numeric(12,2) not null check(amount >= 0), actor uuid not null, created_at timestamptz not null default now()
);
create index payments_shift on public.payments(shift_id);
create table public.organizer (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references public.staff,
  kind text not null check (kind in ('note','task','event','incident')),
  title text not null check (length(trim(title)) between 1 and 160),
  body text not null default '', due_on date, private boolean not null default true,
  status text not null default 'pending' check (status in ('pending','in_progress','waiting','completed','archived')),
  created_at timestamptz not null default now()
);
create index organizer_due on public.organizer(due_on);

do $$
declare relation text;
begin
  foreach relation in array array['business','staff','categories','products','orders','order_lines',
    'order_events','kitchen_tickets','payments','shifts','organizer'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
  end loop;
end $$;

grant select on public.business, public.categories, public.products to anon, authenticated;
grant update on public.business to authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;
grant select on public.staff, public.orders, public.order_lines, public.order_events,
  public.kitchen_tickets, public.payments, public.shifts to authenticated;
grant insert(kind,title,body,due_on,private,status), update(title,body,due_on,private,status),
  select on public.organizer to authenticated;

create policy business_read on public.business for select using (true);
create policy business_admin on public.business for update using (public.staff_role() = 'admin');
create policy categories_read on public.categories for select using (true);
create policy categories_admin on public.categories for all using (public.staff_role() = 'admin');
create policy products_read on public.products for select using
  (available or public.staff_role() in ('admin','cashier'));
create policy products_admin on public.products for all using (public.staff_role() = 'admin');
create policy staff_self on public.staff for select using (id = auth.uid() and active);
create policy shifts_read on public.shifts for select using
  (public.staff_role() = 'admin' or (public.staff_role() = 'cashier' and cashier = auth.uid()));
create policy orders_read on public.orders for select using (public.staff_role() in ('admin','cashier'));
create policy lines_read on public.order_lines for select using (public.staff_role() in ('admin','cashier'));
create policy events_read on public.order_events for select using (public.staff_role() in ('admin','cashier'));
create policy kitchen_read on public.kitchen_tickets for select using (public.staff_role() in ('admin','kitchen') or (public.staff_role() = 'cashier' and status in ('confirmed','preparing','ready')));
create policy payments_read on public.payments for select using
  (public.staff_role() = 'admin' or (public.staff_role() = 'cashier' and actor = auth.uid()));
create policy organizer_read on public.organizer for select using
  (public.staff_role() = 'admin' and (author = auth.uid() or not private));
create policy organizer_add on public.organizer for insert with check
  (public.staff_role() = 'admin' and author = auth.uid());
create policy organizer_edit on public.organizer for update using
  (public.staff_role() = 'admin' and author = auth.uid());

create function public.place_order(
  p_key uuid, p_source text, p_mode text, p_customer text, p_phone text,
  p_table text, p_notes text, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sale public.orders;
  item jsonb;
  product public.products;
  units integer;
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
    if (item->>'expected_price')::numeric is distinct from product.price then
      raise exception 'Cambió el precio de un producto. Revisa el total antes de confirmar';
    end if;
    units := (item->>'quantity')::integer;
    if units is null or units not between 1 and 99 or length(item->>'notes') > 300 then
      raise exception 'Revisa las cantidades y observaciones';
    end if;
    insert into public.order_lines(order_id,product_id,name,price,quantity,notes)
      values(sale.id,product.id,product.name,product.price,units,coalesce(item->>'notes',''));
    amount := amount + product.price * units;
    minutes := greatest(minutes, product.prep_minutes);
  end loop;
  update public.orders set total = amount, prep_minutes = minutes where id = sale.id;
  insert into public.order_events(order_id,status,actor) values(sale.id,'received',auth.uid());
  return jsonb_build_object('number',sale.number,'tracking_key',sale.tracking_key,'total',amount);
end $$;

create function public.track_order(p_key uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('number',number,'status',status,'created_at',created_at,'prep_minutes',prep_minutes)
 from public.orders where tracking_key = p_key
$$;

create function public.move_order(p_id uuid, p_status text, p_reason text default null)
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
    insert into public.kitchen_tickets
      select sale.id,sale.number,sale.source,sale.mode,sale.table_name,sale.notes,sale.created_at,p_status,sale.prep_minutes,
        (select jsonb_agg(jsonb_build_object('id',id,'name',name,'quantity',quantity,'notes',notes,'prepared',false) order by id)
         from public.order_lines where order_id = sale.id);
  else
    update public.kitchen_tickets set status = p_status where id = sale.id;
  end if;
end $$;

create function public.prepare_line(p_id uuid, p_line uuid, p_prepared boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare ticket public.kitchen_tickets;
begin
  if coalesce(public.staff_role(),'') not in ('admin','kitchen') then raise exception 'Sin permiso'; end if;
  if p_prepared is null or p_line is null then raise exception 'Producto inválido'; end if;
  select * into ticket from public.kitchen_tickets where id = p_id for update;
  if not found or ticket.status <> 'preparing' then raise exception 'La comanda no está en preparación'; end if;
  if not exists(select 1 from jsonb_array_elements(ticket.lines) line where line->>'id' = p_line::text) then
    raise exception 'El producto no pertenece a la comanda';
  end if;
  update public.kitchen_tickets set lines = (
    select jsonb_agg(case when entry->>'id' = p_line::text then entry || jsonb_build_object('prepared',p_prepared)
      else entry end order by position)
    from jsonb_array_elements(ticket.lines) with ordinality as entries(entry,position)
  ) where id = ticket.id;
end $$;

create function public.change_shift(p_action text,p_cash numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare active_shift public.shifts;
begin
  if coalesce(public.staff_role(),'') not in ('admin','cashier') then raise exception 'Sin permiso'; end if;
  if p_cash is null or p_cash not between 0 and 9999999999.99 then raise exception 'Importe inválido'; end if;
  if p_action = 'open' then
    insert into public.shifts(cashier,opening_cash) values(auth.uid(),p_cash);
  elsif p_action = 'close' then
    select * into active_shift from public.shifts where cashier = auth.uid() and closed_at is null for update;
    if not found then raise exception 'No tienes caja abierta'; end if;
    update public.shifts set closed_at = now(), counted_cash = p_cash,
      expected_cash = active_shift.opening_cash + coalesce(
        (select sum(amount) from public.payments where shift_id = active_shift.id and method = 'cash'),0)
      where id = active_shift.id;
  else raise exception 'Acción inválida';
  end if;
end $$;

create function public.record_payment(p_id uuid,p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare sale public.orders;
declare active_shift uuid;
begin
  if coalesce(public.staff_role(),'') not in ('admin','cashier') then raise exception 'Sin permiso'; end if;
  select * into sale from public.orders where id = p_id for update;
  if not found or sale.status = 'cancelled' then raise exception 'Pedido no cobrable'; end if;
  if exists(select 1 from public.payments where order_id = p_id) then raise exception 'El pedido ya fue cobrado'; end if;
  select id into active_shift from public.shifts where cashier = auth.uid() and closed_at is null for update;
  if not found then raise exception 'Abre un turno de caja'; end if;
  insert into public.payments(order_id,shift_id,method,amount,actor)
    values(sale.id,active_shift,p_method,sale.total,auth.uid());
end $$;

revoke all on function public.place_order(uuid,text,text,text,text,text,text,jsonb),
  public.track_order(uuid), public.prepare_line(uuid,uuid,boolean), public.move_order(uuid,text,text), public.change_shift(text,numeric),
  public.record_payment(uuid,text) from public;
grant execute on function public.place_order(uuid,text,text,text,text,text,text,jsonb), public.track_order(uuid)
  to anon, authenticated;
grant execute on function public.prepare_line(uuid,uuid,boolean), public.move_order(uuid,text,text), public.change_shift(text,numeric),
  public.record_payment(uuid,text) to authenticated;
alter publication supabase_realtime add table public.kitchen_tickets, public.products, public.categories;

commit;
