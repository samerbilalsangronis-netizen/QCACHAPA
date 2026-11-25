import {useEffect,useState} from 'react';
import Brand from '../Brand';
import {useCatalog} from '../data';
import {labels,rpc} from '../model';

export default function Tracking() {
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
