import {useEffect,useImperativeHandle,useRef,useState,type FormEvent,type RefObject} from 'react';
import ProductChoice,{type Choice} from './shop/ProductChoice';
import {menuPhoto} from './shop/featuredMenu';
import {publicMenuGroups} from './shop/catalogGroups';
import BasketLines from './shop/BasketLines';
import OrderCheckout from './shop/OrderCheckout';
import type {CheckoutDetails} from './shop/checkoutModel';
import {configuredPrice,optionLabel,selectedOptions} from './productOptions';
import './shop/store-dialogs.css';
import './shop/order-flow.css';
import {type Catalog} from './data';
import {money,readStored,rpc,saveStored,type Product} from './model';

type CartLine = {product_id:string; quantity:number; notes:string; option_ids?:string[]};
type Draft = {key:string; lines:CartLine[]};
export type StoreActions = {orderFeatured:(product:Product)=>void; browseCategory:(category:string)=>void};

const newDraft = ():Draft => ({key:crypto.randomUUID(),lines:[]});

export function Store({catalog,source:channel='web',onPlaced,cartDialog,checkout=false,tableSession,actionsRef}:{catalog:Catalog; source?:'web'|'pos'; onPlaced?:()=>void; cartDialog?:RefObject<HTMLDialogElement|null>; checkout?:boolean; tableSession?:string; actionsRef?:RefObject<StoreActions|null>}) {
  const source = tableSession ? 'floor' : channel;
  const keepDraft = source !== 'pos';
  const canConfirm = !catalog.loading && !catalog.error;
  const storage = 'qc-cart-' + (tableSession ?? source);
  const {categories,products,business} = catalog;
  const [draft,setDraft] = useState(() => keepDraft ? readStored(storage,newDraft()) : newDraft());
  const [category,setCategory] = useState('');
  const [query,setQuery] = useState('');
  const [mode,setMode] = useState('pickup');
  const [customizing,setCustomizing] = useState<{product:Product;index?:number;fromFeature?:boolean}|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const sending = useRef(false);
  const cart = useRef<HTMLElement>(null);
  const menu = useRef<HTMLElement>(null);
  const byId = new Map(products.map(product => [product.id,product]));
  const optionsFor = (line:CartLine) => selectedOptions(byId.get(line.product_id)?.options,line.option_ids);
  const priceFor = (line:CartLine) => configuredPrice(byId.get(line.product_id)?.price ?? 0,optionsFor(line));
  const optionsChanged = (line:CartLine) => optionsFor(line).length !== (line.option_ids?.length ?? 0);
  const total = draft.lines.reduce((sum,line) => sum + priceFor(line) * line.quantity,0);
  const hasUnavailable = draft.lines.some(line => !byId.get(line.product_id)?.available || optionsChanged(line));
  const count = draft.lines.reduce((sum,line) => sum + line.quantity,0);
  const groups = source === 'web' ? publicMenuGroups(categories,products) : [];
  const selectedGroup = groups.find(group => group.id === category) ?? groups.find(group => group.id === 'cachapas') ?? groups[0];
  const search = query.toLocaleLowerCase('es').trim();
  const visible = (source === 'web' ? selectedGroup?.products ?? [] : products.filter(product =>
    product.available && (!category || product.category_id === category)))
    .filter(product => (product.name + ' ' + product.description).toLocaleLowerCase('es').includes(search));

  const productCard = (product:Product, grouped=false) => {
    const photo = source === 'web' ? menuPhoto(product) : product.image_url;
    return <article className="product" data-menu-reveal={source === 'web' ? '' : undefined} key={product.id}>
      {photo && <img src={photo} alt="" width={800} height={500} loading="lazy"/>}
      <div>{grouped ? <h4>{product.name}</h4> : <h3>{product.name}</h3>}{product.description && <p>{product.description}</p>}
        <div className="row"><strong>{money(product.price)}</strong><button className={source==='web' ? 'public-product-button' : undefined}
          aria-label={source==='web' ? 'Elegir '+product.name : undefined} disabled={busy || (source === 'web' && !business.accepting_orders)}
          onClick={() => source==='web' || product.options?.length ? setCustomizing({product}) : add(product)}>{product.options?.length ? 'Personalizar' : 'Agregar'}</button></div>
      </div>
    </article>;
  };

  function update(lines:CartLine[]) {
    const next = {key:crypto.randomUUID(),lines};
    setDraft(next);
    if (keepDraft) saveStored(storage,next);
  }

  function add(product:Product) {
    const index = draft.lines.findIndex(line => line.product_id === product.id && !line.notes && !line.option_ids?.length && line.quantity < 99);
    if (index < 0) update([...draft.lines,{product_id:product.id,quantity:1,notes:''}]);
    else update(draft.lines.map((line,i) => i === index ? {...line,quantity:line.quantity+1} : line));
  }

  async function place(order:{mode:string;customer:FormDataEntryValue|null;phone:FormDataEntryValue|null;
    table:FormDataEntryValue|null;notes:FormDataEntryValue|null;details?:CheckoutDetails}, onSuccess?:()=>void) {
    if (sending.current || !count || hasUnavailable || (source === 'web' && (!canConfirm || !business.accepting_orders || !checkout))) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const args = {
        p_key:draft.key,p_mode:order.mode,p_customer:order.customer,
        p_phone:order.phone,p_notes:order.notes,p_table:order.table,
        p_lines:draft.lines.map(line => ({...line,expected_price:priceFor(line)})),
      };
      const result = source==='web' && business.checkout && order.details
        ? await rpc('place_web_order',{...args,p_details:order.details})
        : await rpc('place_order',{...args,p_source:source});
      update([]);
      if (source === 'web') window.location.assign('/pedido/#' + result.tracking_key);
      else onSuccess?.();
    } catch (cause) {
      setError((cause as Error).message);
      void catalog.refresh();
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }

  function placeInPerson(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void place({mode:tableSession ? 'table' : mode,customer:fields.get('customer'),phone:fields.get('phone'),
      table:tableSession ?? fields.get('table'),notes:fields.get('notes')},()=>{
      form.reset();
      setMode('pickup');
      onPlaced?.();
    });
  }

  function showCart() {
    if (cartDialog?.current) {if (!cartDialog.current.open) cartDialog.current.showModal();}
    else cart.current?.scrollIntoView();
  }

  useImperativeHandle(actionsRef,() => ({
    browseCategory(next) {
      setQuery('');
      setCategory(source === 'web' ? groups.find(group => group.categoryIds.includes(next))?.id ?? '' : next);
    },
    orderFeatured(product) {
      if (!product.available || !business.accepting_orders || !canConfirm || busy) return;
      setCustomizing({product,fromFeature:true});
    },
  }));

  useEffect(() => {
    if (source !== 'web' || checkout || !menu.current) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('menu-revealed');
        observer.unobserve(entry.target);
      }
    },{threshold:.16});
    menu.current.querySelectorAll('[data-menu-reveal]:not(.menu-revealed)').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  },[source,checkout,category,query,products,categories]);

  function chooseCategory(next:string) {
    setCategory(next);
    if (source === 'web') setQuery('');
    if (source === 'web' && menu.current && menu.current.getBoundingClientRect().top < -100) {
      menu.current.scrollIntoView({block:'start'});
    }
  }

  const webBasket = source==='web' && <BasketLines items={draft.lines.map(line=>({product:byId.get(line.product_id),
    quantity:line.quantity,unitPrice:priceFor(line),notes:line.notes,options:optionsFor(line),optionsChanged:optionsChanged(line)
  }))} checked={canConfirm} disabled={busy}
    onEdit={index=>{const product=byId.get(draft.lines[index].product_id); if (product?.available) setCustomizing({product,index});}}
    onRemove={index=>update(draft.lines.filter((_,i)=>i!==index))}
    onQuantity={(index,quantity)=>update(draft.lines.map((line,i)=>i===index ? {...line,quantity} : line))}/>;

  const basket = <>
    <div className="row cart-heading">
      <h3>Tu pedido <span>{count}</span></h3>
    </div>
    {!count ? <div className="cart-empty">
      <p className="muted">Aquí aparecerán los productos que elijas.</p>
    </div> :
      <form onSubmit={placeInPerson}>
        <fieldset disabled={busy}>
          {draft.lines.map((line,index) => {
            const product = byId.get(line.product_id);
            return <div className="cart-line" key={index}>
              <div className="row"><strong>{product?.name ?? 'Producto no disponible'}</strong>
                <button type="button" className="text-button" onClick={() => update(draft.lines.filter((_,i) => i !== index))}>Quitar</button></div>
              {!catalog.loading && !catalog.error && !product?.available && <p className="notice">Agotado. Quita este producto para continuar.</p>}
              {optionsChanged(line) && <p className="notice">Las opciones cambiaron. Edita la personalización para continuar.</p>}
              {optionsFor(line).length > 0 && <ul className="cart-options">
                {optionsFor(line).map(option => <li key={option.id}>{optionLabel(option)}{option.price > 0 && ' · +' + money(option.price)}</li>)}
              </ul>}
              {product?.available && (product.options?.length || line.option_ids?.length) ? <button type="button"
                className="secondary" onClick={() => setCustomizing({product,index})}>Editar opciones</button> : null}
              <label>Cantidad<input type="number" min={1} max={99} value={line.quantity} onChange={e => {
                const value = e.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 1 && value <= 99) update(draft.lines.map((item,i) => i === index ? {...item,quantity:value} : item));
              }}/></label>
              <label>Indicaciones del producto<input value={line.notes} maxLength={300} onChange={e => update(draft.lines.map((item,i) => i === index ? {...item,notes:e.target.value} : item))}/></label>
            </div>;
          })}
          <div className="row total"><span>Total estimado</span><strong>{money(total)}</strong></div>
            {!tableSession && <>
            <label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}><option value="pickup">Retiro en local</option><option value="table">Consumo en mesa</option></select></label>
            {mode === 'table' && <label>Mesa<input name="table" required maxLength={40}/></label>}
            <label>Nombre<input name="customer" required maxLength={100} autoComplete="name"/></label>
            <label>Teléfono (opcional)<input name="phone" type="tel" maxLength={40} autoComplete="tel"/></label>
            </>}
            <label>Observaciones del pedido<textarea name="notes" maxLength={500}/></label>
            {error && <p className="notice" role="alert">{error}</p>}
            <button disabled={hasUnavailable}>{busy ? 'Registrando…' : tableSession ? 'Enviar comanda a cocina' : 'Confirmar pedido'}</button>
        </fieldset>
      </form>}
  </>;

  const customization = customizing && <ProductChoice product={customizing.product} publicChoice={source==='web'}
    initial={customizing.index === undefined ? undefined : {...draft.lines[customizing.index],option_ids:draft.lines[customizing.index].option_ids ?? []}}
    onClose={() => setCustomizing(null)} onSave={(choice:Choice) => {
      const line = {product_id:customizing.product.id,...choice};
      const index = customizing.index;
      update(index === undefined ? [...draft.lines,line] : draft.lines.map((item,i) => i === index ? line : item));
      if (customizing.fromFeature) requestAnimationFrame(showCart);
    }}/>;

  if (checkout) return <section className="checkout-basket" aria-label="Detalles del pedido">
    {catalog.loading && <p role="status">Comprobando el menú…</p>}
    {catalog.error && <p role="alert" className="notice">No se pudo comprobar la disponibilidad. Intenta recargar.</p>}
    {canConfirm && !business.accepting_orders && <p className="notice">Los pedidos en línea están cerrados.</p>}
    <OrderCheckout business={business} subtotal={total} count={count} basket={webBasket} busy={busy}
      blocked={hasUnavailable || !canConfirm || !business.accepting_orders} error={error} onPlace={order=>void place(order)}/>
    {customization}
  </section>;

  return <section ref={menu} id="menu" className={source === 'web' ? 'store shell storefront-carta' : 'store shell'} tabIndex={source === 'web' ? -1 : undefined}>
    <div className="section-head">
      <div><h2>{source === 'web' ? 'La carta' : tableSession ? 'Nueva comanda' : 'Nueva venta'}</h2></div>
      <button className="secondary store-cart-button" onClick={showCart} aria-haspopup={cartDialog ? 'dialog' : undefined}>Carrito <span aria-live="polite"><span key={count}>{count}</span></span></button>
    </div>
    <div className="store-grid">
      <div className="catalog-layout">
        <div className="menu-controls" data-menu-reveal={source === 'web' ? '' : undefined}>
          <input type="search" name="productos" aria-label={source === 'web' ? 'Buscar productos en esta categoría' : 'Buscar productos'}
            placeholder={source === 'web' ? 'Buscar producto…' : 'Buscar en el menú…'} value={query} onChange={e => setQuery(e.target.value)}/>
          {source === 'web' && <p className="catalog-index-label">Categorías</p>}
          <div className="chips" role="group" aria-label="Categorías">
            {source === 'web' ? groups.map(group => <button type="button" key={group.id}
              aria-pressed={selectedGroup?.id === group.id} onClick={() => chooseCategory(group.id)}>{group.name}</button>) : <>
              <button type="button" aria-pressed={!category} onClick={() => chooseCategory('')}>Todo el menú</button>
              {categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id}
                onClick={() => chooseCategory(item.id)}>{item.name}</button>)}
            </>}
          </div>
        </div>
        <div className="catalog-results">
          {catalog.error && <p role="alert" className="notice">{catalog.error}</p>}
          {catalog.loading ? <p role="status">Cargando menú…</p> : visible.length ? <div className="catalog-sections">
            {source === 'web' && selectedGroup ? <section className="catalog-section" key={selectedGroup.id} aria-label={selectedGroup.name}>
              <h3 data-menu-reveal="">{selectedGroup.name}</h3>
              <div className="products">{visible.map(product => productCard(product,true))}</div>
            </section> : <div className="products">{visible.map(product => productCard(product))}</div>}
          </div> : <div className="empty">{search || (source !== 'web' && category) ? 'No encontramos productos con estos filtros.' : 'El menú todavía no está disponible.'}</div>}
        </div>
      </div>
      {cartDialog ? <dialog className="portal-cart public-basket" ref={cartDialog} aria-labelledby="portal-cart-title" onClick={event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}>
        <div className="portal-cart-inner">
          <div className="row cart-heading"><h3 id="portal-cart-title">Tu pedido <span>{count}</span></h3>
            <button type="button" className="cart-close secondary" aria-label="Cerrar pedido" onClick={()=>cartDialog.current?.close()}>×</button></div>
          {count ? <>{webBasket}<div className="public-basket-footer">
            <div className="row"><strong>Subtotal</strong><strong>{money(total)}</strong></div>
            {hasUnavailable || !canConfirm || !business.accepting_orders
              ? <p className="notice">Revisa la disponibilidad para continuar.</p>
              : <a className="button portal-primary" href="/checkout/">Continuar</a>}
          </div></> : <div className="cart-empty"><p className="muted">Aquí aparecerán los productos que elijas.</p>
            <button type="button" className="secondary" onClick={()=>{cartDialog.current?.close();menu.current?.focus();}}>Volver al menú</button>
          </div>}
        </div>
      </dialog> : <aside className="cart panel" ref={cart}>{basket}</aside>}
    </div>
    {cartDialog && count>0 && <button className="floating-basket" type="button" aria-haspopup="dialog" onClick={showCart}>
      <span className="floating-basket-count">{count}</span><span>Ver pedido</span><strong>{money(total)}</strong>
    </button>}
    {customization}
  </section>;
}
