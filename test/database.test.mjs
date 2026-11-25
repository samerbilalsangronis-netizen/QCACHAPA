import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const admin = '77fa6c1a-1283-436b-ab70-f87fd51b7e15';
const cashier = '77fa6c1a-1283-436b-ab70-f87fd51b7e16';
const kitchen = '77fa6c1a-1283-436b-ab70-f87fd51b7e17';
const secondAdmin = '77fa6c1a-1283-436b-ab70-f87fd51b7e18';
const group = 'd5ce2fa7-259d-49da-af8b-31df7784648d';
const product = 'd5ce2fa7-259d-49da-af8b-31df7784648e';

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to authenticated, anon;
    create publication supabase_realtime;
  `);
  for (const file of ['202611250001_core.sql','202611250002_reports.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  for (const [id,role] of [[admin,'admin'],[cashier,'cashier'],[kitchen,'kitchen'],[secondAdmin,'admin']]) {
    await db.query('insert into auth.users values($1)',[id]);
    await db.query('insert into staff(id,role) values($1,$2)',[id,role]);
  }
  await db.query('insert into categories(id,name) values($1,$2)',[group,'Categoría de prueba']);
  await db.query('insert into products(id,category_id,name,price) values($1,$2,$3,5.55)',[product,group,'Producto de prueba']);
});
after(() => db.close());

async function acting(user) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
}
async function value(query,params = []) {
  return (await db.query(query,params)).rows[0]?.value;
}
function place(key,source='web',expectedPrice=5.55) {
  return value("select place_order($1,$2,'pickup','Cliente de prueba',null,null,'Sin cubiertos',$3) value",
    [key,source,JSON.stringify([{product_id:product,quantity:2,expected_price:expectedPrice,notes:'Sin mantequilla'}])]);
}

test('pedido público, caja, cocina, cobro y cierre con permisos e idempotencia', async () => {
  const key = crypto.randomUUID();
  await acting(null);
  await assert.rejects(place(key),/cerrados/);
  await assert.rejects(db.query('select * from orders'),/permission denied/);
  await assert.rejects(place(key,'pos'),/Sin permiso/);
  await acting(admin);
  await db.exec('update business set accepting_orders = true');
  await acting(null);
  await assert.rejects(place(key,'web',1),/Cambió el precio/);
  const placed = await place(key);
  assert.equal(placed.total,11.1);
  assert.deepEqual(await place(key),placed);
  assert.equal(await value('select track_order($1) value',[crypto.randomUUID()]),null);
  assert.equal((await value('select track_order($1) value',[placed.tracking_key])).status,'received');

  await acting(cashier);
  const order = await value('select id value from orders where number = $1',[placed.number]);
  await assert.rejects(place(crypto.randomUUID(),'pos'),/Abre un turno/);
  assert.equal((await db.query('update products set price = 1 where id = $1',[product])).affectedRows,0);
  await assert.rejects(db.query("select sales_summary('2000-01-01','2100-01-01')"),/Sin permiso/);
  await db.query("select change_shift('open',20)");
  await db.query("select move_order($1,'confirmed')",[order]);
  await assert.rejects(db.query("select move_order($1,'ready')",[order]),/no permitido/);
  await acting(kitchen);
  assert.equal(await value('select count(*) value from orders'),0);
  const ticket = await value('select to_jsonb(kitchen_tickets) value from kitchen_tickets where id=$1',[order]);
  assert.equal(ticket.lines[0].notes,'Sin mantequilla');
  assert.equal('customer' in ticket,false);
  assert.equal('total' in ticket,false);
  await db.query("select move_order($1,'preparing')",[order]);
  await db.query("select prepare_line($1,$2,true)",[order,ticket.lines[0].id]);
  assert.equal(await value("select lines->0->'prepared' value from kitchen_tickets where id=$1",[order]),true);
  await db.query("select move_order($1,'ready')",[order]);
  await assert.rejects(db.query("select move_order($1,'delivered')",[order]),/no permitido/);
  await acting(null);
  assert.equal((await value('select track_order($1) value',[placed.tracking_key])).status,'ready');

  await acting(cashier);
  await db.query("select move_order($1,'delivered')",[order]);
  assert.equal(await value('select status value from orders where id=$1',[order]),'delivered');
  await db.query("select record_payment($1,'cash')",[order]);
  await assert.rejects(db.query("select record_payment($1,'cash')",[order]),/ya fue cobrado/);
  await db.exec('reset role');
  await db.exec("update shifts set opened_at = now() - interval '2 days'");
  await acting(cashier);
  await db.query("select change_shift('close',31.10)");
  assert.equal(Number(await value('select expected_cash value from shifts')),31.1);
  assert.equal(Number(await value('select counted_cash value from shifts')),31.1);
  await acting(admin);
  const summary = await value("select sales_summary('2000-01-01','2100-01-01') value");
  assert.equal(summary.sales,11.1);
  assert.equal(summary.finished,1);
  assert.equal((await db.query('select status from order_events where order_id=$1 order by id',[order])).rows.length,5);
});

test('anulación conserva motivo; los apuntes privados se aíslan por autor', async () => {
  await acting(null);
  const placed = await place(crypto.randomUUID());
  await acting(admin);
  const order = await value('select id value from orders where number=$1',[placed.number]);
  await db.query("select move_order($1,'cancelled','Solicitud del cliente')",[order]);
  assert.equal(await value("select reason value from order_events where order_id=$1 and status='cancelled'",[order]),'Solicitud del cliente');
  await db.exec(`
    insert into organizer(kind,title) values('note','Privado');
    insert into organizer(kind,title,private) values('task','Compartido',false);
    insert into organizer(kind,title,due_on) values('event','Agenda','2026-11-25');
    insert into organizer(kind,title) values('incident','Incidencia');
  `);
  assert.equal(await value("select due_on::text value from organizer where kind='event'"),'2026-11-25');
  assert.equal(await value("select title value from organizer where kind='incident'"),'Incidencia');
  await acting(secondAdmin);
  assert.deepEqual((await db.query('select title from organizer')).rows,[{title:'Compartido'}]);
  assert.equal((await db.exec("update organizer set status='completed'"))[0].affectedRows,0);
  await acting(kitchen);
  assert.equal(await value('select count(*) value from organizer'),0);
});

test('el consolidado agrega más de mil cobros en la base de datos', async () => {
  await db.exec('reset role');
  const shift = await value('select id value from shifts where cashier=$1',[cashier]);
  await db.query(`
    with inserted as (
      insert into orders(request_key,source,mode,customer,status,total)
        select gen_random_uuid(),'web','pickup','Prueba de volumen','delivered',2.25 from generate_series(1,1001)
        returning id,total
    )
    insert into payments(order_id,shift_id,method,amount,actor)
      select id,$1,'transfer',total,$2 from inserted
  `,[shift,cashier]);
  await acting(admin);
  const summary = await value("select sales_summary('2000-01-01','2100-01-01') value");
  assert.equal(summary.paid,1002);
  assert.equal(summary.methods.transfer,2252.25);
});
