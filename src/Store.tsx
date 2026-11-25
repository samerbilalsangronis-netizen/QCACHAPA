import {useRef,useState,type FormEvent} from 'react';
import {type Catalog} from './data';
import {money,readStored,rpc,saveStored,type Product} from './model';

type CartLine = {product_id:string; quantity:number; notes:string};
type Draft = {key:string; lines:CartLine[]};
const newDraft = ():Draft => ({key:crypto.randomUUID(),lines:[]});

export function Store({catalog,source='web',onPlaced}:{catalog:Catalog; source?:'web'|'pos'; onPlaced?:()=>void}) {
  const storage = 'qc-cart-' + source;
  const {categories,products,business} = catalog;
  const [draft,setDraft] = useState(() => source === 'web' ? readStored(storage,newDraft()) : newDraft());
  const [category,setCategory] = useState('');
  const [query,setQuery] = useState('');
  const [mode,setMode] = useState('pickup');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const sending = useRef(false);
  const cart = useRef<HTMLElement>(null);
  const byId = new Map(products.map(product => [product.id,product]));
  const total = draft.lines.reduce((sum,line) => sum + Number(byId.get(line.product_id)?.price ?? 0) * line.quantity,0);
  const count = draft.lines.reduce((sum,line) => sum + line.quantity,0);
  const visible = products.filter(product => product.available && (!category || product.category_id === category)
    && (product.name + ' ' + product.description).toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));

  function update(lines:CartLine[]) {
    const next = {key:crypto.randomUUID(),lines};
    setDraft(next);
    if (source === 'web') saveStored(storage,next);
  }

  function add(product:Product) {
    const index = draft.lines.findIndex(line => line.product_id === product.id && !line.notes && line.quantity < 99);
    if (index < 0) update([...draft.lines,{product_id:product.id,quantity:1,notes:''}]);
    else update(draft.lines.map((line,i) => i === index ? {...line,quantity:line.quantity+1} : line));
  }

  async function place(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const result = await rpc('place_order',{
        p_key:draft.key,p_source:source,p_mode:mode,p_customer:fields.get('customer'),
        p_phone:fields.get('phone'),p_notes:fields.get('notes'),p_table:fields.get('table'),
        p_lines:draft.lines.map(line => ({...line,expected_price:byId.get(line.product_id)?.price})),
      });
      update([]);
      if (source === 'web') window.location.assign('/pedido/#' + result.tracking_key);
      else {
        form.reset();
        setMode('pickup');
        onPlaced?.();
      }
    } catch (cause) {
      setError((cause as Error).message);
      void catalog.refresh();
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }

  return <section id="menu" className="store shell">
    <div className="section-head">
      <div><p className="eyebrow">EL SABOR DE VENEZUELA</p><h2>{source === 'web' ? 'Nuestro menú' : 'Nueva venta'}</h2></div>
      <button className="secondary" onClick={() => cart.current?.scrollIntoView({behavior:'smooth'})}>Carrito · {count}</button>
    </div>
    <div className="store-grid">
      <div>
        <input aria-label="Buscar productos" placeholder="Buscar en el menú…" value={query} onChange={e => setQuery(e.target.value)}/>
        <div className="chips" aria-label="Categorías">
          <button aria-pressed={!category} onClick={() => setCategory('')}>Todo el menú</button>
          {categories.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}
        </div>
        {catalog.error && <p role="alert" className="notice">{catalog.error}</p>}
        {catalog.loading ? <p>Cargando menú…</p> : visible.length ? <div className="products">
          {visible.map(product => <article className="product" key={product.id}>
            {product.image_url && <img src={product.image_url} alt={product.name} loading="lazy"/>}
            <div><h3>{product.name}</h3><p>{product.description}</p>
              <div className="row"><strong>{money(product.price)}</strong><button disabled={busy || (source === 'web' && !business.accepting_orders)} onClick={() => add(product)}>Agregar</button></div>
            </div>
          </article>)}
        </div> : <div className="empty">{query || category ? 'No encontramos productos con estos filtros.' : 'El menú aún no está disponible.'}</div>}
      </div>
      <aside className="cart panel" ref={cart}>
        <h3>Tu pedido <span>{count}</span></h3>
        {!count ? <p className="muted">Aquí aparecerán los productos que elijas.</p> :
          <form onSubmit={place}>
            <fieldset disabled={busy}>
              {draft.lines.map((line,index) => {
                const product = byId.get(line.product_id);
                return <div className="cart-line" key={index}>
                  <div className="row"><strong>{product?.name ?? 'Producto no disponible'}</strong>
                    <button type="button" className="text-button" onClick={() => update(draft.lines.filter((_,i) => i !== index))}>Quitar</button></div>
                  <label>Cantidad<input type="number" min={1} max={99} value={line.quantity} onChange={e => {
                    const value = e.target.valueAsNumber;
                    if (Number.isInteger(value) && value >= 1 && value <= 99) update(draft.lines.map((item,i) => i === index ? {...item,quantity:value} : item));
                  }}/></label>
                  <label>Indicaciones del producto<input value={line.notes} maxLength={300} onChange={e => update(draft.lines.map((item,i) => i === index ? {...item,notes:e.target.value} : item))}/></label>
                </div>;
              })}
              <div className="row total"><span>Total estimado</span><strong>{money(total)}</strong></div>
              <label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}><option value="pickup">Retiro en local</option><option value="table">Consumo en mesa</option></select></label>
              {mode === 'table' && <label>Mesa<input name="table" required maxLength={40}/></label>}
              <label>Nombre<input name="customer" required maxLength={100} autoComplete="name"/></label>
              <label>Teléfono (opcional)<input name="phone" type="tel" maxLength={40} autoComplete="tel"/></label>
              <label>Observaciones del pedido<textarea name="notes" maxLength={500}/></label>
              {error && <p className="notice" role="alert">{error}</p>}
              <button disabled={source === 'web' && !business.accepting_orders}>{busy ? 'Registrando…' : 'Confirmar pedido'}</button>
            </fieldset>
          </form>}
      </aside>
    </div>
  </section>;
}
