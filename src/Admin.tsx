import {useEffect,useState,type FormEvent} from 'react';
import {type Catalog} from './data';
import {db,labels,money,rpc,type Entry,type Business} from './model';
import MenuEditor from './MenuEditor';
import {staffRoutes,type AdminView} from './staffRoutes';
import ImagePicker from './ImagePicker';
import {saveCatalogImages} from './catalogImages';
import {validDeliveryFee,type CheckoutSettings} from './shop/checkoutModel';

const client = () => db!;
const entryTypes = ['note','task','event','incident'];
const states = ['pending','in_progress','waiting','completed','archived'];
const today = (zone:string) => new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeZone:zone}).format(new Date());

type Summary = {sales:number; paid:number; average:number; active:number; finished:number; cancelled:number; open_shifts:number; methods:Record<string,number>};

export default function Admin({catalog,user,section}:{catalog:Catalog;user:string;section:AdminView}) {
  return <div key={section} className="admin-view">
    {section !== 'menu' && <h1 className="staff-section-title">{staffRoutes[section].label}</h1>}
    {section === 'reports' && <Dashboard timezone={catalog.business.timezone}/>}
    {section === 'menu' && <MenuEditor catalog={catalog}/>}
    {section === 'organizer' && <Organizer user={user} timezone={catalog.business.timezone}/>}
    {section === 'settings' && <Settings catalog={catalog}/>}
  </div>;
}

function Dashboard({timezone}:{timezone:string}) {
  const date = today(timezone);
  const [start,setStart] = useState(date);
  const [end,setEnd] = useState(date);
  const [summary,setSummary] = useState<Summary|null>(null);
  const [error,setError] = useState('');
  useEffect(() => {
    let active = true;
    setSummary(null);
    setError('');
    void rpc('sales_summary',{p_start:start,p_end:end}).then(data => {if (active) setSummary(data);},
      cause => {if (active) setError(cause.message);});
    return () => {active = false;};
  },[start,end]);
  return <section>
    <div className="inline"><label>Desde<input type="date" value={start} required onChange={e => setStart(e.target.value)}/></label>
      <label>Hasta<input type="date" value={end} required onChange={e => setEnd(e.target.value)}/></label></div>
    {error ? <p role="alert" className="notice">{error}</p> : summary ? <>
      <div className="products">
        {[
          ['Cobros en el período',money(summary.sales)],['Ticket promedio',money(summary.average)],['Pedidos cobrados',summary.paid],
          ['Pedidos activos',summary.active],['Pedidos entregados',summary.finished],['Pedidos cancelados',summary.cancelled],
          ['Cajas abiertas',summary.open_shifts],
        ].map(([label,value]) => <article className="panel metric" key={label}><p>{label}</p><strong>{value}</strong></article>)}
      </div>
      <h2>Cobros por método</h2>
      {Object.keys(summary.methods).length ? Object.entries(summary.methods).map(([method,amount]) => <p key={method}>{labels[method]} · {money(amount)}</p>) : <p>No hay cobros en este período.</p>}
    </> : <p>Cargando resumen…</p>}
  </section>;
}

function useSave(refresh:()=>Promise<void>) {
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function save(action:()=>PromiseLike<{error:{message:string}|null}>,after?:()=>void) {
    setBusy(true);
    setMessage('');
    try {
      const {error} = await action();
      if (error) throw new Error(error.message);
      after?.();
      await refresh();
      setMessage('Cambios guardados.');
    } catch (cause) {setMessage((cause as Error).message);}
    finally {setBusy(false);}
  }
  return {message,busy,save};
}

function Settings({catalog}:{catalog:Catalog}) {
  const {business} = catalog;
  const {message,busy,save} = useSave(catalog.refresh);
  const [validation,setValidation] = useState<{field:string;message:string}|null>(null);
  const fields:[keyof Business,string,string?][] = [
    ['name','Nombre comercial'],['slogan','Eslogan'],['address','Dirección'],['whatsapp','WhatsApp','tel'],
  ];
  return <form className="panel business-settings" key={JSON.stringify(business)} onSubmit={event => {
    event.preventDefault();
    setValidation(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(fields.map(([field]) => [field,data.get(field) || null]));
    const numeric = (field:string) => data.get(field) ? Number(data.get(field)) : null;
    let checkout:CheckoutSettings|undefined;
    if (business.checkout) {
      const deliveryEnabled = data.get('delivery_enabled')==='on';
      const deliveryFee = numeric('delivery_fee');
      const latitude = numeric('delivery_latitude');
      const longitude = numeric('delivery_longitude');
      if (deliveryEnabled && !validDeliveryFee(deliveryFee)) {
        setValidation({field:'delivery_fee',message:'Ingresa un costo mayor que cero para habilitar el delivery.'});
        form.querySelector<HTMLInputElement>('[name="delivery_fee"]')?.focus();
        return;
      }
      if ((latitude===null)!==(longitude===null)) {
        const field = latitude===null ? 'delivery_latitude' : 'delivery_longitude';
        setValidation({field,message:'Completa la latitud y la longitud del local.'});
        form.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
        return;
      }
      checkout = {
        delivery_enabled:deliveryEnabled,delivery_fee:deliveryFee ?? 0,
        schedule_enabled:data.get('schedule_enabled')==='on',terminal_enabled:data.get('terminal_enabled')==='on',
        latitude,longitude,ves_rate:numeric('ves_rate'),
        transfer_instructions:String(data.get('transfer_instructions') ?? '').trim(),
        binance_instructions:String(data.get('binance_instructions') ?? '').trim(),
      };
    }
    void save(() => saveCatalogImages(client(), data, ['logo_url','hero_url'], images =>
      client().from('business').update({...payload,...images,...(checkout && {checkout}),hours:data.get('hours') || null,
        accepting_orders:data.get('accepting_orders') === 'on'}).eq('id',true).select('id').single()));
  }}>
    <fieldset disabled={busy}>
      <section className="business-setting-group" aria-labelledby="business-identity-title">
        <h2 id="business-identity-title">Negocio</h2>
        <div className="form-grid">{fields.map(([key,label,type]) => <label key={key}>{label}
          <input name={key} type={type ?? 'text'} required={key === 'name' || key === 'slogan'} defaultValue={String(business[key] ?? '')}/>
        </label>)}</div>
        <div className="business-images">
          <ImagePicker name="logo_url" label="Logo del negocio" current={business.logo_url} fallback="/logo-qcachapas.webp"/>
          <ImagePicker name="hero_url" label="Foto de portada" current={business.hero_url} fallback="/cachapa-portada-movil.webp"/>
        </div>
      </section>
      <section className="business-setting-group" aria-labelledby="business-hours-title">
        <h2 id="business-hours-title">Pedidos y horario</h2>
        <label>Horario visible en la tienda<input name="hours" defaultValue={business.hours ?? ''}/></label>
        <label className="check"><input name="accepting_orders" type="checkbox" defaultChecked={business.accepting_orders}/> Aceptar pedidos en línea</label>
        {business.checkout && <label className="check"><input name="schedule_enabled" type="checkbox" defaultChecked={business.checkout.schedule_enabled}/> Aceptar pedidos programados</label>}
      </section>
      <section className="business-setting-group" aria-labelledby="business-delivery-title">
        <h2 id="business-delivery-title">Delivery</h2>
        {business.checkout ? <>
          <label className="check"><input name="delivery_enabled" type="checkbox" defaultChecked={business.checkout.delivery_enabled}/> Ofrecer delivery</label>
          <div className="form-grid">
            <label>Costo de delivery (USD)<input name="delivery_fee" type="number" min="0" max="9999.99" step=".01" inputMode="decimal"
              defaultValue={business.checkout.delivery_fee || ''} aria-invalid={validation?.field==='delivery_fee'} aria-describedby="delivery-fee-help"/></label>
          </div>
          <p className="muted" id="delivery-fee-help">La tarifa se cobra una vez por pedido con delivery.</p>
          <div className="form-grid">
            <label>Latitud del local (opcional)<input name="delivery_latitude" type="number" min="-90" max="90" step="any" defaultValue={business.checkout.latitude ?? ''} aria-invalid={validation?.field==='delivery_latitude'}/></label>
            <label>Longitud del local (opcional)<input name="delivery_longitude" type="number" min="-180" max="180" step="any" defaultValue={business.checkout.longitude ?? ''} aria-invalid={validation?.field==='delivery_longitude'}/></label>
          </div>
          {validation && <p className="notice" role="alert">{validation.message}</p>}
        </> : !catalog.loading && !catalog.error && <p className="notice">Para configurar delivery, aplica la migración <code>202611280001_web_checkout.sql</code> en Supabase.</p>}
      </section>
      {business.checkout && <section className="business-setting-group" aria-labelledby="business-payments-title">
        <h2 id="business-payments-title">Formas de pago</h2>
        <label>Bolívares por USD (opcional)<input name="ves_rate" type="number" min=".0001" max="100000000" step=".0001" defaultValue={business.checkout.ves_rate ?? ''}/></label>
        <label className="check"><input name="terminal_enabled" type="checkbox" defaultChecked={business.checkout.terminal_enabled}/> Ofrecer punto de venta en el local</label>
        <p className="muted">Los datos de pago se muestran al cliente. Completa solo los métodos que aceptas.</p>
        <label>Instrucciones de pago móvil o transferencia<textarea name="transfer_instructions" maxLength={500} defaultValue={business.checkout.transfer_instructions ?? ''}/></label>
        <label>Instrucciones de Binance Pay<textarea name="binance_instructions" maxLength={500} defaultValue={business.checkout.binance_instructions ?? ''}/></label>
      </section>}
      <button>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
    </fieldset>
    {message && <p className="notice" role="status">{message}</p>}
  </form>;
}

function Organizer({user,timezone}:{user:string;timezone:string}) {
  const [entries,setEntries] = useState<Entry[]>([]);
  const [editing,setEditing] = useState<Entry|null>(null);
  const [kind,setKind] = useState('note');
  const [view,setView] = useState('list');
  const [month,setMonth] = useState(() => today(timezone).slice(0,7));
  const [query,setQuery] = useState('');
  const [showArchived,setShowArchived] = useState(false);
  const [error,setError] = useState('');
  async function refresh() {
    const {data,error} = await client().from('organizer').select('*').order('created_at',{ascending:false});
    setError(error?.message ?? '');
    if (data) setEntries(data);
  }
  useEffect(() => {void refresh();},[]);
  const {save,busy,message} = useSave(refresh);
  const visible = entries.filter(item => item.kind === kind && (showArchived || item.status !== 'archived') &&
    (item.title+' '+item.body).toLowerCase().includes(query.toLowerCase()));
  function entry(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const row = {
      title:fields.get('title'),body:fields.get('body'),due_on:fields.get('due_on') || null,
      private:fields.get('private') === 'on',status:fields.get('status'),
    };
    void save(() => editing ? client().from('organizer').update(row).eq('id',editing.id) :
      client().from('organizer').insert({...row,kind}),() => {setEditing(null);form.reset();});
  }
  function card(item:Entry) {
    return <article key={item.id} className="panel">
      <h3>{item.title}</h3><p className="preline">{item.body}</p>
      <p>{labels[item.status]}{item.due_on && ' · '+item.due_on} · {item.private ? 'Privado' : 'Compartido'}</p>
      {item.author === user && <div className="inline">
        <button className="secondary" onClick={() => setEditing(item)}>Editar</button>
        {(kind === 'note' || kind === 'incident') && <button className="secondary" disabled={busy} onClick={() => save(() =>
          client().from('organizer').insert({kind:'task',title:item.title,body:item.body,private:item.private}))}>Crear tarea a partir de este registro</button>}
        {item.status !== 'archived' && <button className="text-button" disabled={busy} onClick={() => save(() => client().from('organizer').update({status:'archived'}).eq('id',item.id))}>Archivar</button>}
      </div>}
    </article>;
  }
  return <>
    <nav className="chips" aria-label="Organizador">
      {entryTypes.map(item => <button key={item} aria-pressed={item === kind} onClick={() => {setKind(item);setEditing(null);setView('list');}}>{labels[item]}</button>)}
    </nav>
    <form className="panel" key={editing?.id ?? kind} onSubmit={entry}>
      <h2>{editing ? 'Editar registro' : 'Nuevo registro'}</h2>
      <label>Título<input name="title" required maxLength={160} defaultValue={editing?.title}/></label>
      <label>Contenido<textarea name="body" defaultValue={editing?.body}/></label>
      <div className="form-grid">
        <label>Fecha<input name="due_on" type="date" defaultValue={editing?.due_on ?? ''}/></label>
        <label>Estado<select name="status" defaultValue={editing?.status ?? 'pending'}>{states.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
      </div>
      <label className="check"><input name="private" type="checkbox" defaultChecked={editing?.private ?? true}/> Privado</label>
      <div className="inline"><button disabled={busy}>Guardar registro</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cerrar edición</button>}</div>
    </form>
    {(error || message) && <p className="notice" role="status">{error || message}</p>}
    <div className="inline">
      <input aria-label="Buscar registros" placeholder="Buscar registros…" value={query} onChange={e => setQuery(e.target.value)}/>
      <label className="check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/> Ver archivados</label>
      {kind === 'task' && <button className="secondary" aria-pressed={view === 'board'} onClick={() => setView(view === 'board' ? 'list' : 'board')}>Tablero</button>}
      {(kind === 'task' || kind === 'event') && <button className="secondary" aria-pressed={view === 'calendar'} onClick={() => setView(view === 'calendar' ? 'list' : 'calendar')}>Calendario</button>}
    </div>
    {!visible.length && <p className="empty">No hay registros para mostrar.</p>}
    {view === 'calendar' ? <section className="panel">
      <label>Mes<input type="month" min="2000-01" max="2100-12" value={month} onChange={event => {
        if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
      }}/></label>
      <Calendar month={month} entries={visible} onEdit={setEditing} user={user}/>
    </section> : view === 'board' ? <div className="kanban">{states.filter(value => value !== 'archived' || showArchived).map(value => <section key={value}>
      <h3>{labels[value]}</h3>{visible.filter(item => item.status === value).map(card)}</section>)}</div>
      : <div className="products">{visible.map(card)}</div>}
  </>;
}

function Calendar({month,entries,onEdit,user}:{month:string;entries:Entry[];onEdit:(entry:Entry)=>void;user:string}) {
  const [year,number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number-1, 1));
  const leading = (first.getUTCDay()+6)%7;
  const days = new Date(Date.UTC(year,number,0)).getUTCDate();
  const headings = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const grouped = new Map<string,Entry[]>();
  for (const entry of entries) {
    if (!entry.due_on?.startsWith(month+'-')) continue;
    const current = grouped.get(entry.due_on) ?? [];
    current.push(entry);
    grouped.set(entry.due_on,current);
  }
  return <div className="calendar-wrap"><table className="calendar">
    <caption className="muted">{new Intl.DateTimeFormat('es-VE',{month:'long',year:'numeric',timeZone:'UTC'}).format(first)}</caption>
    <thead><tr>{headings.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
    <tbody>{Array.from({length:Math.ceil((leading+days)/7)},(_,week) => <tr key={week}>
      {headings.map((day,column) => {
        const date = week*7+column-leading+1;
        if (date < 1 || date > days) return <td key={day}/>;
        const key = month+'-'+String(date).padStart(2,'0');
        return <td key={day}><span>{date}</span>{grouped.get(key)?.map(entry => entry.author === user
          ? <button key={entry.id} className="text-button" onClick={() => onEdit(entry)}>{entry.title}</button>
          : <p key={entry.id}>{entry.title}</p>)}</td>;
      })}
    </tr>)}</tbody>
  </table></div>;
}
