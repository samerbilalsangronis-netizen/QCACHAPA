import {useRef} from 'react';
import {gsap} from 'gsap';
import {useGSAP} from '@gsap/react';
import {Store} from '../Store';
import Brand from '../Brand';
import {useCatalog} from '../data';

gsap.registerPlugin(useGSAP);

export default function Portal() {
  const catalog = useCatalog(true);
  const {business} = catalog;
  const whatsapp = business.whatsapp?.replace(/\D/g,'');
  const hasContact = Boolean(business.address || business.hours || whatsapp);
  const hero = useRef<HTMLElement>(null);
  const cartDialog = useRef<HTMLDialogElement>(null);

  useGSAP(() => {
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({defaults:{ease:'power3.out'}})
        .from('.portal-visual img',{scale:1.09,duration:1.4},0)
        .from('.portal-heading',{y:24,opacity:0,duration:.7},.1)
        .from('.portal-intro',{y:12,opacity:0,duration:.55},.28);
    },hero);
    return () => motion.revert();
  },{scope:hero});

  return <div className="portal">
    <a className="portal-skip" href="#menu">Saltar al menú</a>
    <header className="portal-header">
      <div className="shell masthead">
        <Brand business={business}/>
        <nav aria-label="Navegación principal">
          <a href="#menu">Menú</a>
          {hasContact && <a href="#contacto">Contacto</a>}
        </nav>
        <button type="button" className="portal-cart-link" aria-haspopup="dialog" onClick={() => cartDialog.current?.showModal()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h16l1 13H3L4 8Z"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>
          </svg>
          <span>Mi pedido</span>
        </button>
      </div>
    </header>
    <main>
      <section className="portal-stage" ref={hero}>
        <div className="portal-visual">
          <img src={business.hero_url ?? '/cachapa-portada.webp'} srcSet={business.hero_url ? undefined : '/cachapa-portada-movil.webp 750w, /cachapa-portada.webp 1500w'}
            sizes={business.hero_url ? undefined : '(max-width: 760px) 100vw, 75vw'} alt="Cachapa de maíz dorada con queso de mano" width={1500} height={1000} fetchPriority="high"/>
        </div>
        <div className="shell portal-stage-content">
          <p className="portal-origin">Desde 2007</p>
          <h1 className="portal-heading">Cachapas <br/>venezolanas</h1>
          <div className="portal-intro">
            <p>{business.slogan}</p>
            <a className="button portal-primary" href="#menu">Explorar el menú <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>
      <div className="portal-order-status">
        <div className="shell">
          <p><span className={business.accepting_orders ? 'open' : ''} aria-hidden="true"/>{business.accepting_orders ? 'Pedidos en línea abiertos' : 'Pedidos en línea cerrados'}</p>
          {business.hours && <p>{business.hours}</p>}
        </div>
      </div>
      <Store catalog={catalog} cartDialog={cartDialog}/>
    </main>
    <footer id="contacto" className="footer">
      <div className="shell portal-footer">
        <Brand business={business}/>
        {hasContact && <div className="portal-contact">
          {business.address && <p>{business.address}</p>}
          {whatsapp && <a href={'https://wa.me/'+whatsapp}>WhatsApp</a>}
        </div>}
        <a href="/personal/">Acceso del personal</a>
      </div>
    </footer>
  </div>;
}
