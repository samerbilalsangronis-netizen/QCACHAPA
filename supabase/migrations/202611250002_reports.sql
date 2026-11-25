begin;

alter publication supabase_realtime add table public.business;

-- Keep active orders visible to the team while limiting historical access.
alter policy orders_read on public.orders using (
  public.staff_role() = 'admin' or (public.staff_role() = 'cashier' and (
    status in ('received','confirmed','preparing','ready')
    or delivered_by = auth.uid()
    or exists (select 1 from public.shifts where shifts.id = orders.shift_id and cashier = auth.uid())
    or exists (select 1 from public.payments where payments.order_id = orders.id and actor = auth.uid())
  ))
);
alter policy lines_read on public.order_lines using (
  exists (select 1 from public.orders where orders.id = order_lines.order_id)
);
alter policy events_read on public.order_events using (
  exists (select 1 from public.orders where orders.id = order_events.order_id)
);

-- Payments exposed to other cashiers are limited to the fact that an order was paid.
create function public.paid_order_ids(p_ids uuid[]) returns table(order_id uuid)
language sql stable security definer set search_path = '' as $$
  select payment.order_id from public.payments payment
  where public.staff_role() in ('cashier','admin')
    and cardinality(p_ids) <= 80 and payment.order_id = any(p_ids)
    and exists (select 1 from public.orders sale where sale.id = payment.order_id
      and (public.staff_role() = 'admin' or sale.status in ('received','confirmed','preparing','ready')
        or payment.actor = auth.uid()))
$$;
revoke all on function public.paid_order_ids(uuid[]) from public;
grant execute on function public.paid_order_ids(uuid[]) to authenticated;

create function public.sales_summary(p_start date, p_end date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare zone text;
declare start_at timestamptz;
declare end_at timestamptz;
begin
  if coalesce(public.staff_role(),'') <> 'admin' then raise exception 'Sin permiso'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Rango inválido'; end if;
  select timezone into zone from public.business;
  start_at := p_start::timestamp at time zone zone;
  end_at := (p_end + 1)::timestamp at time zone zone;
  return (
    select jsonb_build_object(
      'sales',coalesce(sum(payment.amount),0),'paid',count(payment.id),
      'average',coalesce(round(avg(payment.amount),2),0),
      'active',(select count(*) from public.orders where status in ('received','confirmed','preparing','ready')),
      'finished',(select count(*) from public.orders where status = 'delivered' and created_at >= start_at and created_at < end_at),
      'cancelled',(select count(*) from public.orders where status = 'cancelled' and created_at >= start_at and created_at < end_at),
      'open_shifts',(select count(*) from public.shifts where closed_at is null),
      'methods',coalesce((select jsonb_object_agg(method,amount) from
        (select method,sum(amount) amount from public.payments where created_at >= start_at and created_at < end_at group by method) grouped),'{}'::jsonb)
    )
    from public.payments payment where payment.created_at >= start_at and payment.created_at < end_at
  );
end $$;
create index payments_created_at on public.payments(created_at);
revoke all on function public.sales_summary(date,date) from public;
grant execute on function public.sales_summary(date,date) to authenticated;

commit;
