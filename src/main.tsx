import {lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Store} from './Store';
import {useCatalog} from './data';
import {labels,rpc,type Business} from './model';
import './style.css';

const Staff = lazy(() => import('./Staff'));

export function Brand({business}:{business:Business}) {
  return <a className="brand" href="/">
    {business.logo_url ? <img src={business.logo_url} alt={business.name}/> : business.name}
  </a>;
}

function Portal() {
  const catalog = useCatalog();
  const {business} = catalog;
  const whatsapp = business.whatsapp?.replace(/\D/g,'');
  return <>
    <header className="shell masthead"><Brand business={business}/><nav aria-label="Navegación principal">
      <a href="#menu">Menú</a><a href="#contacto">Contacto</a><a className="button" href="#menu">Haz tu pedido ↗</a>
    </nav></header>
    <main>
      <section className="shell hero">
        <div className="hero-copy">
          <p className="eyebrow"><span/> COCINA VENEZOLANA DESDE 2007</p>
          <h1>{business.slogan === '¡Lo mejor del maíz en su mesa!'
            ? <>¡Lo mejor del<br/> <em>maíz</em> en su mesa!</> : business.slogan}</h1>
          <a className="button" href="#menu">Explorar menú <span aria-hidden>↘</span></a>
          <p className="availability"><i className={business.accepting_orders ? 'open' : ''}/>{business.accepting_orders ? 'Pedidos en línea disponibles' : 'Pedidos en línea cerrados'}</p>
        </div>
        <div className="hero-photo"><img src={business.hero_url ?? '/cachapa.webp'} alt="Cachapa dorada con queso venezolano"/></div>
      </section>
      <Store catalog={catalog}/>
    </main>
    <footer id="contacto" className="footer"><div className="shell row">
      <div><Brand business={business}/><p>{business.address}</p><p>{business.hours}</p>
        {whatsapp && <a href={'https://wa.me/'+whatsapp}>WhatsApp</a>}
      </div>
      <a href="/personal/">Acceso del personal ↗</a>
    </div></footer>
  </>;
}

function Tracking() {
  const [status,setStatus] = useState<{number:number; status:string; prep_minutes:number}|null>(null);
  const [error,setError] = useState('');
  const catalog = useCatalog();
  useEffect(() => {
    const key = location.hash.slice(1);
    let active = true;
    const refresh = async () => {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(key)) throw new Error('El enlace de seguimiento no es válido.');
        const data = await rpc('track_order',{p_key:key});
        if (active) {
          setStatus(data);
          setError(data ? '' : 'El pedido no está disponible.');
        }
      } catch (cause) { if (active) setError((cause as Error).message); }
    };
    void refresh();
    const interval = window.setInterval(refresh,5000);
    window.addEventListener('online',refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('online',refresh); };
  },[]);
  const number = catalog.business.whatsapp?.replace(/\D/g,'');
  return <main className="shell narrow">
    <Brand business={catalog.business}/><div className="panel"><h1>Seguimiento</h1>
      {status ? <><h2>Pedido #{status.number}</h2><p aria-live="polite">{labels[status.status]}</p>
        {['received','confirmed','preparing'].includes(status.status) && <p>Preparación estimada · {status.prep_minutes} min</p>}</>
        : !error && <p>Cargando pedido…</p>}
      {error && <p role="alert" className="notice">{error}</p>}
      {number && <a className="button secondary" href={'https://wa.me/'+number}>Contactar por WhatsApp</a>}
    </div>
  </main>;
}

const page = location.pathname.startsWith('/personal') ? <Staff/> : location.pathname.startsWith('/pedido') ? <Tracking/> : <Portal/>;
createRoot(document.getElementById('root')!).render(<Suspense fallback={<main className="shell">Cargando…</main>}>{page}</Suspense>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
