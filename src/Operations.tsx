import {useCallback,useEffect,useRef,useState,type FormEvent,type MouseEvent} from 'react';
import {Store} from './Store';
import {useOnline,type Catalog} from './data';
import {db,labels,money,rpc,time,type Order,type Shift,type Ticket} from './model';
import {staffRoutes,type CashierView} from './staffRoutes';

const client = () => db!;

function useActions(refresh:()=>Promise<void>) {
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const running = useRef(false);
  async function run(name:string,args:Record<string,unknown>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setNotice('');
    try {await rpc(name,args);await refresh();}
    catch (cause) {setNotice((cause as Error).message);}
    finally {running.current = false;setBusy(false);}
  }
  return {notice,busy,run};
}

const orderFilters = [
  {id:'all',label:'Todos',matches:(_order:Order,_paid:boolean) => true},
  {id:'received',label:'Nuevos',matches:(order:Order) => order.status === 'received'},
  {id:'preparing',label:'En cocina',matches:(order:Order) => ['confirmed','preparing'].includes(order.status)},
  {id:'ready',label:'Listos',matches:(order:Order) => order.status === 'ready'},
  {id:'pending',label:'Por cobrar',matches:(order:Order,paid:boolean) => !paid && order.status !== 'cancelled'},
  {id:'delivered',label:'Entregados',matches:(order:Order) => order.status === 'delivered'},
  {id:'cancelled',label:'Cancelados',matches:(order:Order) => order.status === 'cancelled'},
] as const;

export function Cashier({catalog,user,admin,view,navigate}:{
  catalog:Catalog;user:string;admin:boolean;view:CashierView;
  navigate:(route:CashierView,event?:MouseEvent<HTMLAnchorElement>)=>void;
}) {
  const [filter,setFilter] = useState<(typeof orderFilters)[number]['id']>('all');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(true);
  const [orders,setOrders] = useState<Order[]>([]);
  const [paid,setPaid] = useState<Set<string>>(new Set());
  const [shifts,setShifts] = useState<Shift[]>([]);
  const [error,setError] = useState('');
  const [receipt,setReceipt] = useState<Order|null>(null);
  const [paper,setPaper] = useState('58');
  const online = useOnline();
  const refresh = useCallback(async () => {
    const [sales,turns] = await Promise.all([
      client().from('orders').select('id,number,status,source,mode,table_name,notes,created_at,prep_minutes,total,customer,order_lines(id,name,quantity,notes,price),payments(method,amount)')
        .order('created_at',{ascending:false}).limit(80).overrideTypes<Order[],{merge:false}>(),
      client().from('shifts').select('*').eq('cashier',user).order('opened_at',{ascending:false}).limit(20),
    ]);
    setError((sales.error || turns.error)?.message ?? '');
    if (sales.data) {
      const paymentStatus = await client().rpc('paid_order_ids',{p_ids:sales.data.map(order => order.id)});
      if (paymentStatus.error) setError(paymentStatus.error.message);
      else setPaid(new Set((paymentStatus.data as {order_id:string}[]).map(payment => payment.order_id)));
      setOrders(sales.data);
    }
    if (turns.data) setShifts(turns.data);
    setLoading(false);
  },[user]);
  useEffect(() => {
    void refresh();
    const channel = client().channel('cashier-kitchen')
      .on('postgres_changes',{event:'*',schema:'public',table:'kitchen_tickets'},refresh)
      .subscribe(status => {if (status === 'SUBSCRIBED') void refresh();});
    const timer = window.setInterval(refresh,6000);
    window.addEventListener('online',refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online',refresh);
      void client().removeChannel(channel);
    };
  },[refresh]);
  const {busy,notice,run} = useActions(refresh);
  const opened = shifts.find(shift => !shift.closed_at);
  const lastClosed = shifts.find(shift => shift.closed_at);
  const disabled = !online || busy;
  const query = search.trim().toLocaleLowerCase('es');
  const activeFilter = orderFilters.find(item => item.id === filter) ?? orderFilters[0];
  const visible = orders.filter(order => activeFilter.matches(order,paid.has(order.id))
    && (!query || order.customer.toLocaleLowerCase('es').includes(query) || String(order.number).includes(query.replace(/^#/,''))));
  const title = staffRoutes[view].label;
  return <>
    <div className="section-head">
      <div><h1>{title}</h1>{view === 'orders' && <p className="muted">Hasta 80 pedidos recientes</p>}</div>
      <div className="inline">
        {view === 'orders' && <>
          <button className="secondary" onClick={refresh}>Actualizar pedidos</button>
          <a className="button" href={staffRoutes.manual.path} onClick={event => navigate('manual',event)}>Nuevo pedido manual</a>
        </>}
        {view !== 'orders' && <a className="button secondary" href={staffRoutes.orders.path} onClick={event => navigate('orders',event)}>Volver a pedidos</a>}
      </div>
    </div>
    {(error || notice) && <p className="notice" role="alert">{error || notice}</p>}
    {!online && <p className="notice" role="status">Usa comandas manuales durante la interrupción. La caja no registra nuevas operaciones sin conexión.</p>}
    {view === 'till' && <section className={opened ? 'panel shift-panel is-open' : 'panel shift-panel'}>
      <h2>{opened ? 'Turno abierto' : 'Turno cerrado'}</h2>
      {opened && <p>Fondo inicial · {money(opened.opening_cash)}</p>}
      <form className="inline" key={opened?.id ?? 'closed'} onSubmit={async event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        await run('change_shift',{p_action:opened ? 'close' : 'open',p_cash:Number(fields.get('cash'))});
      }}>
        <label>{opened ? 'Efectivo contado en USD' : 'Fondo inicial en USD'}<input name="cash" type="number" min="0" step=".01" required/></label>
        <button disabled={disabled}>{opened ? 'Cerrar turno' : 'Abrir turno'}</button>
      </form>
      {lastClosed && <p>Último cierre · Esperado {money(lastClosed.expected_cash ?? 0)} · Contado {money(lastClosed.counted_cash ?? 0)} · Diferencia {money(Number(lastClosed.counted_cash) - Number(lastClosed.expected_cash))}</p>}
    </section>}
    {view === 'manual' && !loading && !opened && <div className="panel">
      <h2>Abre un turno para registrar el pedido</h2>
      <a className="button" href={staffRoutes.till.path} onClick={event => navigate('till',event)}>Ir a caja</a>
    </div>}
    {opened && online && <div hidden={view !== 'manual'}>
      <Store catalog={catalog} source="pos" onPlaced={() => {void refresh();setFilter('all');setSearch('');navigate('orders');}}/>
    </div>}
    {view === 'orders' && <section aria-label="Lista de pedidos">
      <div className="order-board-tools">
        <label>Buscar pedido<input name="pedido" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o número de pedido…"/></label>
        <div className="chips" aria-label="Estados de pedidos">
          {orderFilters.map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label} <span>{orders.filter(order => item.matches(order,paid.has(order.id))).length}</span>
          </button>)}
        </div>
      </div>
      <div className="products order-board">
      {visible.map(order => <article key={order.id} className={'panel order '+(order.status === 'ready' ? 'ready' : '')}>
        <div className="row"><h3>#{order.number} · {order.customer}</h3><strong>{money(order.total)}</strong></div>
        <p>{labels[order.status]} · {labels[order.source]} · {labels[order.mode]} {order.table_name}</p>
        {order.order_lines.map(line => <p key={line.id}>{line.quantity} × {line.name}{line.notes && ' · '+line.notes}</p>)}
        {order.notes && <p>{order.notes}</p>}
        <div className="inline">
          {order.status === 'received' && <button disabled={disabled} onClick={() => run('move_order',{p_id:order.id,p_status:'confirmed'})}>Enviar a cocina</button>}
          {order.status === 'ready' && <button disabled={disabled} onClick={() => run('move_order',{p_id:order.id,p_status:'delivered'})}>Confirmar entrega</button>}
          {admin && !paid.has(order.id) && !['delivered','cancelled'].includes(order.status) &&
            <details className="order-cancel">
              <summary>Cancelar pedido</summary>
              <form className="inline" onSubmit={event => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                void run('move_order',{p_id:order.id,p_status:'cancelled',p_reason:fields.get('reason')});
              }}>
                <label>Motivo<input name="reason" maxLength={500} required/></label>
                <button className="secondary" disabled={disabled}>Confirmar cancelación</button>
              </form>
            </details>}
        </div>
        {paid.has(order.id) ? <div className="inline"><p>Pagado {order.payments && '· '+labels[order.payments.method]}</p>{order.payments && <button className="secondary" onClick={() => setReceipt(order)}>Ver comprobante</button>}</div>
          : opened && order.status !== 'cancelled' && <form className="inline" onSubmit={event => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            void run('record_payment',{p_id:order.id,p_method:fields.get('method')});
          }}>
            <label>Método<select name="method"><option value="cash">Efectivo</option><option value="terminal">Punto de venta</option><option value="transfer">Transferencia verificada</option></select></label>
            <button disabled={disabled}>Registrar cobro</button>
          </form>}
      </article>)}
    </div>
    {loading ? <p role="status">Cargando pedidos…</p> : !visible.length && <p className="empty">No hay pedidos para mostrar.</p>}
    </section>}
    {receipt && <dialog open className={'panel receipt paper-'+paper}>
      <h2>{catalog.business.name}</h2><p>Comprobante de compra · #{receipt.number}</p>
      {receipt.order_lines.map(line => <p key={line.id}>{line.quantity} × {line.name} · {money(Number(line.price)*line.quantity)}</p>)}
      <strong>Total · {money(receipt.total)}</strong><p>Comprobante interno. Sin validez fiscal.</p>
      <div className="inline no-print">
        <label>Formato<select value={paper} onChange={event => setPaper(event.target.value)}>
          <option value="58">58 mm</option><option value="80">80 mm</option>
        </select></label>
        <button onClick={() => window.print()}>Imprimir</button><button className="secondary" onClick={() => setReceipt(null)}>Cerrar</button>
      </div>
    </dialog>}
  </>;
}

export function Kitchen({timezone}:{timezone:string}) {
  const [tickets,setTickets] = useState<Ticket[]>([]);
  const [error,setError] = useState('');
  const [live,setLive] = useState(false);
  const [sound,setSound] = useState(false);
  const [now,setNow] = useState(Date.now());
  const online = useOnline();
  const audio = useRef<AudioContext|null>(null);
  const board = useRef<HTMLElement>(null);
  const seen = useRef<Set<string>|null>(null);
  const play = useCallback(async () => {
    const context = audio.current ?? new AudioContext();
    audio.current = context;
    if (context.state === 'suspended') await context.resume();
    const tone = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = .08;
    tone.frequency.value = 660;
    tone.connect(gain).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + .32);
  },[]);
  const refresh = useCallback(async () => {
    const {data,error:problem} = await client().from('kitchen_tickets').select('*')
      .in('status',['confirmed','preparing','ready']).order('created_at');
    if (problem) {setError(problem.message);return;}
    setError('');
    setTickets(data);
  },[]);
  useEffect(() => {
    if (!online) {setLive(false);return;}
    void refresh();
    const channel = client().channel('kds').on('postgres_changes',{event:'*',schema:'public',table:'kitchen_tickets'},refresh)
      .subscribe(status => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') void refresh();
      });
    const timer = window.setInterval(refresh,12000);
    return () => {void client().removeChannel(channel);window.clearInterval(timer);};
  },[online,refresh]);
  useEffect(() => {
    if (seen.current && sound && tickets.some(ticket => ticket.status === 'confirmed' && !seen.current!.has(ticket.id))) {
      void play().catch(() => setSound(false));
    }
    seen.current = new Set(tickets.map(ticket => ticket.id));
  },[tickets,sound,play]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()),15000);
    return () => window.clearInterval(timer);
  },[]);
  const {notice,busy,run} = useActions(refresh);
  return <section ref={board} className="kitchen">
    <div className="section-head"><div><h1>Cocina</h1><p role="status">{live && online ? 'Actualización en tiempo real' : 'Sin conexión en tiempo real. Podría haber pedidos nuevos sin recibir.'}</p></div>
      <div className="inline"><button className="secondary" onClick={() => {
        void play().then(() => setSound(true),() => setError('El navegador no pudo reproducir el sonido.'));
      }}>{sound ? 'Probar sonido' : 'Habilitar sonido'}</button>
      <button className="secondary" onClick={() => {
        const action = document.fullscreenElement ? document.exitFullscreen() : board.current?.requestFullscreen?.();
        if (action) void action.catch(() => setError('No se pudo activar la pantalla completa.'));
        else setError('Pantalla completa no disponible en este navegador.');
      }}>Pantalla completa</button></div>
    </div>
    {(notice || error) && <p role="alert" className="notice">{notice || error}</p>}
    <div className="kanban">{['confirmed','preparing','ready'].map(status => {
      const column = tickets.filter(ticket => ticket.status === status);
      return <section key={status}>
        <div className="kitchen-column-title">
          <h2>{status === 'confirmed' ? 'Nuevos pedidos' : labels[status]}</h2>
          <span aria-label={column.length === 1 ? '1 pedido' : column.length + ' pedidos'}>{column.length}</span>
        </div>
        {!column.length && <p className="kitchen-empty">Sin pedidos</p>}
        {column.map(ticket => {
          const elapsed = Math.max(0,Math.floor((now-Date.parse(ticket.created_at))/60000));
          const urgency = elapsed >= ticket.prep_minutes ? 'late' : elapsed >= ticket.prep_minutes*.75 ? 'soon' : 'normal';
          return <article className={'panel ticket '+urgency} key={ticket.id}>
            <div className="row"><h3>#{ticket.number}</h3><strong>{elapsed} min</strong></div>
            <p>{time(ticket.created_at,timezone)} · {labels[ticket.source]} · {labels[ticket.mode]} {ticket.table_name}</p>
            <ul>{ticket.lines.map(line => <li key={line.id}><strong>{line.quantity} × {line.name}</strong>
              {line.notes && <div className="notice">{line.notes}</div>}
              {status === 'preparing' && <label className="check">
                <input type="checkbox" checked={Boolean(line.prepared)} disabled={busy || !online}
                  onChange={event => run('prepare_line',{p_id:ticket.id,p_line:line.id,p_prepared:event.target.checked})}/>
                {line.prepared ? 'Preparado' : 'Marcar producto preparado'}
              </label>}</li>)}</ul>
            {ticket.notes && <p className="notice">{ticket.notes}</p>}
            {status !== 'ready' && <button disabled={busy || !online} onClick={() => run('move_order',{
              p_id:ticket.id,p_status:status === 'confirmed' ? 'preparing' : 'ready',
            })}>{status === 'confirmed' ? 'Iniciar preparación' : 'Marcar listo'}</button>}
          </article>;
        })}
      </section>;
    })}</div>
  </section>;
}
