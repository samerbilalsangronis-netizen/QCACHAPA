import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {db,labels,money,rpc,type Role} from './model';
import {useOnline,type Catalog} from './data';
import {Store} from './Store';

type TableOrder = {id:string;number:number;status:string;total:number;paid:boolean};
type Table = {id:string;name:string;active:boolean;occupied:boolean;session:{id:string;orders:TableOrder[]}|null};

export default function TableService({catalog,role}:{catalog:Catalog;role:Role}) {
  const [tables,setTables] = useState<Table[]>([]);
  const [selected,setSelected] = useState('');
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  const [actionError,setActionError] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const online = useOnline();
  const running = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const rows = await rpc('table_service_overview',{});
      if (version !== request.current) return;
      setTables(rows);
      setLoadError('');
    } catch (cause) {
      if (version === request.current) setLoadError((cause as Error).message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  },[]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {if (!document.hidden && navigator.onLine) void refresh();},5000);
    window.addEventListener('online',refresh);
    return () => {request.current++;window.clearInterval(timer);window.removeEventListener('online',refresh);};
  },[refresh]);

  async function act(action:()=>Promise<unknown>,success:string) {
    if (!online || running.current) return;
    running.current = true;
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const table = tables.find(item => item.id === selected);
  const session = table?.session;
  const liveOrders = session?.orders.filter(order => order.status !== 'cancelled') ?? [];
  const balance = liveOrders.filter(order => !order.paid).reduce((sum,order) => sum + Number(order.total),0);
  const unfinished = liveOrders.some(order => order.status !== 'delivered');

  function addTable(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name || !db) return;
    void act(async () => {
      const {error} = await db!.from('dining_tables').insert({name});
      if (error) throw new Error(error.code === '23505' ? 'Ya existe una mesa con ese nombre.' : error.message);
      form.reset();
    },'Mesa creada.');
  }

  return <section className="table-service">
    <div className="section-head"><h1>Mesas</h1><button type="button" className="secondary" onClick={refresh}>Actualizar mesas</button></div>
    {loadError && <p role="alert" className="notice">{loadError}</p>}
    {actionError && <p role="alert" className="notice">{actionError}</p>}
    <p role="status" className="muted">{message}</p>
    {!online && <p className="notice">Sin conexión. Conéctate antes de enviar una comanda o cobrar.</p>}
    {loading ? <p role="status">Cargando mesas…</p> : tables.length > 0 ?
      <div className="table-service-grid" aria-label="Mesas del salón">
        {tables.map(item => <button className="secondary table-service-card" type="button" key={item.id} aria-pressed={selected === item.id}
          onClick={() => {setSelected(item.id);setActionError('');setMessage('');}}>
          <strong>{item.name}</strong><span>{item.occupied ? item.session ? 'Cuenta abierta' : 'Ocupada por otro mozo' : item.active ? 'Libre' : 'Deshabilitada'}</span>
        </button>)}
      </div> : <p className="empty">{role === 'admin' ? 'Agrega las mesas del local para empezar.' : 'El local todavía no tiene mesas habilitadas.'}</p>}
    {role === 'admin' && <form className="panel inline" onSubmit={addTable}>
      <label>Nombre de la mesa<input name="name" required maxLength={40} placeholder="Ej. Mesa 4"/></label>
      <button disabled={busy || !online}>Agregar mesa</button>
    </form>}

    {table && <section className="table-account panel" aria-label={'Cuenta de '+table.name}>
      <div className="section-head">
        <h2>{table.name}</h2>
        {role === 'admin' && !table.occupied && <button type="button" className="secondary" disabled={busy || !online} onClick={() => act(async () => {
          const {error} = await db!.from('dining_tables').update({active:!table.active}).eq('id',table.id).select('id').single();
          if (error) throw new Error(error.message);
        },table.active ? 'Mesa deshabilitada.' : 'Mesa habilitada.')}>{table.active ? 'Deshabilitar mesa' : 'Habilitar mesa'}</button>}
      </div>
      {session ? <>
        <div className="row table-balance"><strong>Saldo por cobrar</strong><strong>{money(balance)}</strong></div>
        {session.orders.length > 0 ? <ul className="table-orders">
          {session.orders.map(order => <li className="row" key={order.id}>
            <div><strong>Comanda #{order.number}</strong><p>{labels[order.status]}{order.paid && ' · Pagada'}</p></div>
            <span>{money(order.total)}</span>
            {order.status === 'ready' && role !== 'waiter' && <button type="button" disabled={busy || !online}
              onClick={() => act(() => rpc('move_order',{p_id:order.id,p_status:'delivered'}),'Entrega confirmada.')}>Confirmar entrega</button>}
          </li>)}
        </ul> : <p className="muted">Todavía no hay comandas en esta cuenta.</p>}
        {role !== 'waiter' && (unfinished
          ? <p className="muted">Completa las comandas antes de cerrar la cuenta.</p>
          : <form className="inline" onSubmit={event => {
            event.preventDefault();
            const method = new FormData(event.currentTarget).get('method');
            void act(() => rpc('close_table_session',{p_session:session.id,p_method:method}),'Cuenta cerrada.');
          }}>
            <label>Método de pago<select name="method"><option value="cash">Efectivo</option><option value="terminal">Punto de venta</option><option value="transfer">Transferencia verificada</option></select></label>
            <button disabled={busy || !online}>{balance ? 'Cobrar y cerrar cuenta' : 'Cerrar cuenta'}</button>
          </form>)}
      </> : table.occupied ? <p>Esta mesa está asignada a otro mozo.</p> : table.active &&
        <button disabled={busy || !online} onClick={() => act(() => rpc('open_table_session',{p_table:table.id}),'Cuenta abierta.')}>Abrir cuenta</button>}
    </section>}
    {session && online && <Store key={session.id} catalog={catalog} tableSession={session.id}
      onPlaced={() => {setMessage('Comanda enviada a cocina.');void refresh();}}/>}
  </section>;
}
