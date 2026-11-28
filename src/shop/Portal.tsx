import {useRef,useState} from 'react';
import {Store,type StoreActions} from '../Store';
import Brand from '../Brand';
import {useCatalog} from '../data';
import FeaturedDishes from './FeaturedDishes';
import VisitorDialogs,{type VisitorSection} from './VisitorDialogs';
import './featured-dishes.css';
import './carta.css';

export default function Portal() {
  const catalog = useCatalog(true);
  const {business} = catalog;
  const whatsapp = business.whatsapp?.replace(/\D/g,'');
  const hasContact = Boolean(business.address || business.hours || whatsapp);
  const cartDialog = useRef<HTMLDialogElement>(null);
  const store = useRef<StoreActions>(null);
  const [visitor,setVisitor] = useState<VisitorSection|null>(null);

  return <div className="portal">
    <a className="portal-skip" href="#menu">Saltar al menú</a>
    <header className="portal-header storefront-header">
      <div className="shell masthead">
        <Brand business={business}/>
        <nav aria-label="Navegación principal">
          <a href="#menu">Menú</a>
          <button type="button" aria-haspopup="dialog" onClick={() => setVisitor('location')}>Ubicación</button>
          <button type="button" className="storefront-reserve" aria-haspopup="dialog" onClick={() => setVisitor('reserve')}>Reserva</button>
        </nav>
        <button type="button" className="portal-cart-link" aria-haspopup="dialog" onClick={() => cartDialog.current?.showModal()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h16l1 13H3L4 8Z"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>
          </svg>
          <span>Pedido</span>
        </button>
      </div>
    </header>
    <main>
      <FeaturedDishes products={catalog.products} background={business.hero_url}
        ordering={business.accepting_orders && !catalog.loading && !catalog.error}
        onOrder={product => store.current?.orderFeatured(product)}
        onBrowse={(category,categoryId) => store.current?.browseCategory(categoryId ?? catalog.categories.find(item =>
          item.name.trim().toLocaleLowerCase('es') === category.toLocaleLowerCase('es'))?.id ?? '')}/>
      <div className="portal-order-status">
        <div className="shell">
          <p><span className={business.accepting_orders ? 'open' : ''} aria-hidden="true"/>{business.accepting_orders ? 'Pedidos en línea abiertos' : 'Pedidos en línea cerrados'}</p>
          {business.hours && <p>{business.hours}</p>}
        </div>
      </div>
      <Store catalog={catalog} cartDialog={cartDialog} actionsRef={store}/>
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
    {visitor && <VisitorDialogs key={visitor} section={visitor} business={business} onClose={() => setVisitor(null)}/>}
  </div>;
}
