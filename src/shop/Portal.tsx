import {useRef} from 'react';
import {Store} from '../Store';
import Brand from '../Brand';
import {useCatalog} from '../data';
import LunchWheel from './LunchWheel';
import './lunch-wheel.css';

export default function Portal() {
  const catalog = useCatalog(true);
  const {business} = catalog;
  const whatsapp = business.whatsapp?.replace(/\D/g,'');
  const hasContact = Boolean(business.address || business.hours || whatsapp);
  const cartDialog = useRef<HTMLDialogElement>(null);

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
      <LunchWheel background={business.hero_url} slogan={business.slogan}/>
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
