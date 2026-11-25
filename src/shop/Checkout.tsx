import Brand from '../Brand';
import {useCatalog} from '../data';
import {Store} from '../Store';

export default function Checkout() {
  const catalog = useCatalog(true);
  return <div className="portal checkout-page">
    <header className="portal-header">
      <div className="shell masthead"><Brand business={catalog.business}/><a href="/#menu">Volver al menú</a></div>
    </header>
    <main className="shell">
      <h1>Confirmar pedido</h1>
      <Store catalog={catalog} checkout/>
    </main>
  </div>;
}
