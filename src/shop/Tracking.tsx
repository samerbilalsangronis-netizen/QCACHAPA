import {useEffect,useState} from 'react';
import Brand from '../Brand';
import {useCatalog} from '../data';
import {labels,money,rpc,time} from '../model';
import {bolivares,dateAndTime,type PaymentMethod} from './checkoutModel';

type TrackingOrder = {
  number:number; status:string; prep_minutes:number; mode?:string; total?:number;
  scheduled_at?:string|null; delivery_fee?:number; payment?:PaymentMethod|null; paid?:boolean;
  payment_instructions?:string|null; ves_rate?:number|null;
  events?:Record<string,string>; items?:{name:string;quantity:number;unit_price:number;notes:string}[];
};

const statusTitle:Record<string,string> = {
  received:'Pedido recibido',confirmed:'Tu pedido está confirmado',preparing:'Estamos preparando tu pedido',
  ready:'Tu pedido está listo',out_for_delivery:'Tu pedido va en camino',delivered:'Pedido entregado',cancelled:'Pedido cancelado',
};

export default function Tracking() {
  const [order,setOrder] = useState<TrackingOrder|null>(null);
  const [error,setError] = useState('');
  const [copied,setCopied] = useState(false);
  const {business} = useCatalog();
  useEffect(()=>{
    const key = location.hash.slice(1);
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) {
      setError('El enlace de seguimiento no es válido.');
      return;
    }
    let active = true;
    let loading = false;
    const refresh = async ()=>{
      if (loading) return;
      loading = true;
      try {
        const data:TrackingOrder|null = await rpc('track_order',{p_key:key});
        if (active) {setOrder(data);setError(data ? '' : 'El pedido no está disponible.');}
      } catch {
        if (active) setError('No pudimos actualizar el pedido. Reintentaremos en unos segundos.');
      } finally {loading=false;}
    };
    void refresh();
    const interval = window.setInterval(refresh,5000);
    window.addEventListener('online',refresh);
    return ()=>{active=false;window.clearInterval(interval);window.removeEventListener('online',refresh);};
  },[]);

  const number = business.whatsapp?.replace(/\D/g,'');
  const publicNumber = order ? 'QC-'+String(order.number).padStart(4,'0') : '';
  const steps = ['received','confirmed','preparing','ready',...(order?.mode==='delivery' ? ['out_for_delivery'] : []),'delivered'];
  const current = order ? steps.indexOf(order.status) : -1;
  const whatsappText = order ? [
    'Hola, este es mi pedido '+publicNumber+' en '+business.name+'.',
    ...(order.items ?? []).map(item=>item.quantity+' × '+item.name),
    ...(order.total===undefined ? [] : ['Total: '+money(order.total)]),
    location.href,
  ].join('\n') : '';
  return <div className="portal tracking-page">
    <header className="portal-header order-page-header">
      <div className="shell masthead"><Brand business={business}/><a href="/#menu">← Volver al menú</a></div>
    </header>
    <main className="shell tracking-layout">
      {order ? <>
        <section className="tracking-confirmation">
          <p className="tracking-kicker">{order.status==='received' ? '¡Recibimos tu pedido!' : 'Seguimiento de tu pedido'}</p>
          <h1>{publicNumber}</h1>
          <p>Guarda este enlace para ver el estado de tu pedido.</p>
          <div className="tracking-actions">
            {number && <a className="button portal-primary" href={'https://wa.me/'+number+'?text='+encodeURIComponent(whatsappText)}
              target="_blank" rel="noopener noreferrer">Enviar copia por WhatsApp</a>}
            {navigator.clipboard && <button type="button" className="secondary" onClick={async()=>{
              try {await navigator.clipboard.writeText(location.href);setCopied(true);} catch {setCopied(false);}
            }}>{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>}
          </div>
        </section>
        <div className="tracking-details">
          <section className="tracking-card">
            <div className="row tracking-card-heading"><h2>Estado</h2>{!error && order.status!=='cancelled' && order.status!=='delivered' && <span className="tracking-live">Actualización automática</span>}</div>
            <p className="tracking-status" aria-live="polite">{statusTitle[order.status] ?? labels[order.status]}</p>
            {order.scheduled_at ? <p>Programado para {dateAndTime(order.scheduled_at,business.timezone)}</p>
              : ['received','confirmed','preparing'].includes(order.status) && <p>Preparación estimada · {order.prep_minutes} min</p>}
            <ol className="tracking-timeline">
              {steps.map((step,index)=>{
                const at = order.events?.[step];
                return <li key={step} data-complete={Boolean(at) || (current>=0 && index<=current)}
                  aria-current={step===order.status ? 'step' : undefined}>
                  <span>{labels[step]}</span>{at && <small>{time(at,business.timezone)}</small>}
                </li>;
              })}
            </ol>
          </section>
          {(order.items?.length || order.total!==undefined) && <section className="tracking-card">
            <h2>Detalle del pedido</h2>
            {order.mode && <p className="web-basket-note">{labels[order.mode]}</p>}
            <ul className="tracking-items">
              {(order.items ?? []).map((item,index)=><li key={index}>
                <div className="row"><strong>{item.quantity} × {item.name}</strong><span>{money(item.unit_price*item.quantity)}</span></div>
                {item.notes && <p className="web-basket-note preline">{item.notes}</p>}
              </li>)}
            </ul>
            {order.total!==undefined && <dl className="order-prices">
              {order.mode==='delivery' && <div><dt>Delivery</dt><dd>{order.delivery_fee ? money(order.delivery_fee) : 'Gratis'}</dd></div>}
              <div className="order-price-total"><dt>Total</dt><dd>{money(order.total)}</dd></div>
              {order.ves_rate && <div><dt>Equivalente en bolívares</dt><dd>{bolivares(order.total*order.ves_rate)}</dd></div>}
            </dl>}
            {order.payment && <p>{labels[order.payment]} · {order.paid ? 'Pago verificado' : 'Pago por verificar'}</p>}
            {!order.paid && order.status!=='cancelled' && order.payment_instructions && <p className="checkout-instructions">{order.payment_instructions}</p>}
          </section>}
        </div>
      </> : !error && <p role="status">Cargando pedido…</p>}
      {error && <p role="alert" className="notice">{error}</p>}
    </main>
  </div>;
}
