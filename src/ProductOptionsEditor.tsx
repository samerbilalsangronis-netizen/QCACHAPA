import type {ProductOption} from './productOptions';

export default function ProductOptionsEditor({options,onChange}:{
  options:ProductOption[];onChange:(options:ProductOption[])=>void;
}) {
  const update = (id:string,change:Partial<ProductOption>) => onChange(options.map(item => item.id === id ? {...item,...change} : item));
  return <fieldset className="product-options-editor">
    <legend>Opciones del producto</legend>
    {options.map((item,index) => <div className="product-option-editor-row" key={item.id}>
      <label>Nombre de la opción {index+1}<input value={item.label} maxLength={70} required
        onChange={e => update(item.id,{label:e.target.value})}/></label>
      <label>Tipo<select value={item.kind} onChange={e => {
        const kind = e.target.value === 'remove' ? 'remove' : 'extra';
        update(item.id,{kind,price:kind === 'remove' ? 0 : item.price});
      }}>
        <option value="extra">Adicional</option><option value="remove">Ingrediente para retirar</option>
      </select></label>
      {item.kind === 'extra' && <label>Recargo en USD<input type="number" min={0} max={9999.99} step=".01" required
        value={Number.isNaN(item.price) ? '' : item.price} onChange={e => update(item.id,{price:e.target.valueAsNumber})}/></label>}
      <button type="button" className="text-button" onClick={() => onChange(options.filter(option => option.id !== item.id))}>Quitar opción {index+1}</button>
    </div>)}
    <button type="button" className="secondary" disabled={options.length >= 12}
      onClick={() => onChange([...options,{id:crypto.randomUUID(),label:'',kind:'extra',price:0}])}>Añadir opción</button>
  </fieldset>;
}
