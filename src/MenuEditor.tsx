import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {Catalog} from './data';
import {db,money,type Category,type Product} from './model';
import ImagePicker from './ImagePicker';
import ProductOptionsEditor from './ProductOptionsEditor';
import type {ProductOption} from './productOptions';
import {saveCatalogImages} from './catalogImages';
import './menu-editor.css';

type Editor =
  | {kind:'product'; item?:Product}
  | {kind:'category'; item?:Category}
  | {kind:'remove'; item:Category};
type Availability = 'all'|'available'|'sold-out';
type Mutation = PromiseLike<{error:{code?:string;message:string}|null}>;

export default function MenuEditor({catalog}:{catalog:Catalog}) {
  const [category,setCategory] = useState('');
  const [query,setQuery] = useState('');
  const [availability,setAvailability] = useState<Availability>('all');
  const [editor,setEditor] = useState<Editor|null>(null);
  const [options,setOptions] = useState<ProductOption[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const {categories,products} = catalog;

  useEffect(() => {
    if (editor && !dialog.current?.open) dialog.current?.showModal();
  },[editor]);

  const grouped = new Map(categories.map(group => [group.id,{name:group.name,count:0}]));
  for (const product of products) {
    const group = grouped.get(product.category_id);
    if (group) group.count++;
  }
  const selected = grouped.has(category) ? category : '';
  const search = query.trim().toLocaleLowerCase('es');
  const visible = products.filter(product => (!selected || product.category_id === selected)
    && (availability === 'all' || product.available === (availability === 'available'))
    && (!search || (product.name + ' ' + product.description).toLocaleLowerCase('es').includes(search)));

  function open(next:Editor) {
    setError('');
    setMessage('');
    setOptions(next.kind === 'product' ? next.item?.options ?? [] : []);
    setEditor(next);
  }

  async function save(request:()=>Mutation, success:string, close=false) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const {error:problem} = await request();
      if (problem?.code === '23503') throw new Error('La categoría contiene productos. Muévelos a otra categoría antes de eliminarla.');
      if (problem?.code === '23505') throw new Error('Ya existe una categoría con ese nombre.');
      if (problem?.code === 'PGRST116') throw new Error('El registro cambió o ya no tienes permiso para modificarlo. Actualiza el menú.');
      if (problem) throw new Error(problem.message);
      if (close) dialog.current?.close();
      await catalog.refresh();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !editor) return;
    const source = db;
    const data = new FormData(event.currentTarget);
    if (editor.kind === 'remove') {
      const {id} = editor.item;
      void save(() => source.from('categories').delete().eq('id',id).select('id').single(), 'Categoría eliminada.', true);
      return;
    }
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      setError('Escribe un nombre.');
      return;
    }
    if (editor.kind === 'category') {
      const id = editor.item?.id;
      void save(() => (id ? source.from('categories').update({name}).eq('id',id) : source.from('categories').insert({name}))
        .select('id').single(),id ? 'Categoría actualizada.' : 'Categoría creada.', true);
      return;
    }

    const id = editor.item?.id;
    if (options.some(option => !option.label.trim())) {
      setError('Escribe un nombre para cada opción.');
      return;
    }
    const row = {
      ...(options.length || editor.item?.options ? {options:options.map(option => ({...option,label:option.label.trim()}))} : {}),
      name,
      category_id:String(data.get('category_id')),
      price:Number(data.get('price')),
      prep_minutes:Number(data.get('prep_minutes')),
      description:String(data.get('description') ?? '').trim(),
      available:data.get('available') === 'on',
    };
    void save(() => saveCatalogImages(source,data,['image_url'],images => {
      const changes = {...row,...images};
      return (id ? source.from('products').update(changes).eq('id',id) : source.from('products').insert(changes))
        .select('id').single();
    }),id ? 'Producto actualizado.' : 'Producto creado.', true);
  }

  const title = editor?.kind === 'product' ? (editor.item ? 'Editar producto' : 'Nuevo producto')
    : editor?.kind === 'remove' ? 'Eliminar categoría'
      : editor?.item ? 'Renombrar categoría' : 'Nueva categoría';

  return <div className="menu-editor">
    <div className="section-head menu-editor-header">
      <h1>Menú</h1>
      <button type="button" disabled={!categories.length || busy} onClick={() => open({kind:'product'})}>Nuevo producto</button>
    </div>
    {catalog.error && <p role="alert" className="notice">{catalog.error}</p>}
    {!editor && error && <p role="alert" className="notice">{error}</p>}
    <div role="status" className={message ? 'menu-editor-feedback' : undefined}>{message}</div>
    <div className="menu-editor-grid">
      <section className="panel menu-categories" aria-label="Categorías del menú">
        <h2>Categorías</h2>
        <button type="button" className="menu-category-filter" aria-pressed={!selected} onClick={() => setCategory('')}>
          <span>Todas las categorías</span><span>{products.length}</span>
        </button>
        <ul>
          {categories.map(item => <li key={item.id}>
            <button type="button" className="menu-category-filter" aria-pressed={selected === item.id} onClick={() => setCategory(item.id)}>
              <span>{item.name}</span><span>{grouped.get(item.id)?.count}</span>
            </button>
            {selected === item.id && <div className="menu-category-actions">
              <button type="button" className="text-button" disabled={busy} onClick={() => open({kind:'category',item})}>Renombrar</button>
              {!grouped.get(item.id)?.count && <button type="button" className="text-button menu-delete" disabled={busy} onClick={() => open({kind:'remove',item})}>Eliminar</button>}
            </div>}
          </li>)}
        </ul>
        <button type="button" className="secondary menu-new-category" disabled={busy} onClick={() => open({kind:'category'})}>Nueva categoría</button>
      </section>
      <section className="menu-product-list" aria-label="Productos del menú">
        <div className="menu-product-filters">
          <label>Buscar productos<input name="buscar_producto" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre o descripción…"/></label>
          <div className="menu-filter-field">
            <label htmlFor="menu-availability">Disponibilidad</label>
            <select id="menu-availability" name="disponibilidad" value={availability} onChange={event => setAvailability(event.target.value as Availability)}>
              <option value="all">Todos</option><option value="available">Disponibles</option><option value="sold-out">Agotados</option>
            </select>
          </div>
        </div>
        {catalog.loading ? <p role="status" className="empty">Cargando productos…</p> : visible.length > 0 ? <ul className="menu-product-rows" key={selected+availability}>
          {visible.map(item => <li className="panel menu-product-row" key={item.id}>
            {item.image_url ? <img src={item.image_url} alt="" width={56} height={56} loading="lazy"/> : <div className="menu-product-initial" aria-hidden="true">{item.name.slice(0,1)}</div>}
            <div className="menu-product-meta">
              <h3>{item.name}</h3>
              <p>{grouped.get(item.category_id)?.name} <span aria-hidden="true">·</span> {money(item.price)}</p>
            </div>
            <div className="menu-product-actions">
              <button type="button" role="switch" aria-checked={item.available} aria-label={'Disponibilidad de '+item.name}
                className="menu-switch" disabled={busy} onClick={() => {
                  if (!db) return;
                  const source = db;
                  void save(() => source.from('products').update({available:!item.available}).eq('id',item.id).select('id').single(),
                    item.name + (item.available ? ' marcado como agotado.' : ' disponible para pedidos.'));
                }}>
                <span className="menu-switch-track" aria-hidden="true"/><span>{item.available ? 'Disponible' : 'Agotado'}</span>
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => open({kind:'product',item})}>Editar</button>
            </div>
          </li>)}
        </ul> : <p className="empty">{!categories.length ? 'Crea una categoría para agregar tu primer producto.'
          : products.length && (selected || search || availability !== 'all') ? 'No hay productos con estos filtros.' : 'Todavía no hay productos. Agrega uno para empezar.'}</p>}
      </section>
    </div>

    <dialog ref={dialog} className="menu-editor-dialog" aria-labelledby="menu-editor-title"
      onCancel={event => {if (busy) event.preventDefault();}}
      onClose={() => {setEditor(null);setError('');}}>
      {editor && <form className="menu-editor-form" onSubmit={submit}>
        <h2 id="menu-editor-title">{title}</h2>
        <fieldset disabled={busy}>
          {editor.kind === 'remove' ? <p>Se eliminará «{editor.item.name}» del menú.</p>
            : <label>Nombre<input name="name" defaultValue={editor.item?.name} maxLength={editor.kind === 'product' ? 120 : 100} required autoFocus/></label>}
          {editor.kind === 'product' && <>
            <label>Categoría<select name="category_id" defaultValue={editor.item?.category_id ?? selected} required>
              <option value="">Elige una categoría</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <div className="form-grid">
              <label>Precio en USD<input type="number" name="price" min="0" max="9999999999.99" step=".01" defaultValue={editor.item?.price} required/></label>
              <label>Preparación en minutos<input type="number" name="prep_minutes" min="1" max="1440" defaultValue={editor.item?.prep_minutes ?? 20} required/></label>
            </div>
            <ProductOptionsEditor options={options} onChange={setOptions}/>
            <ImagePicker name="image_url" label="Foto del producto" current={editor.item?.image_url}/>
            <label>Descripción<textarea name="description" defaultValue={editor.item?.description} maxLength={2000}/></label>
            <label className="check"><input name="available" type="checkbox" defaultChecked={editor.item?.available ?? true}/> Disponible para pedidos</label>
          </>}
        </fieldset>
        {error && <p role="alert" className="notice">{error}</p>}
        <div className="menu-editor-dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</button>
          <button disabled={busy} className={editor.kind === 'remove' ? 'menu-delete-confirm' : undefined}>
            {busy ? 'Guardando…' : editor.kind === 'remove' ? 'Eliminar categoría' : 'Guardar'}
          </button>
        </div>
      </form>}
    </dialog>
  </div>;
}
