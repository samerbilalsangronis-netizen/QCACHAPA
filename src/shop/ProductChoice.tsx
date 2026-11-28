import {useEffect,useRef,useState,type FormEvent} from 'react';
import {money,type Product} from '../model';
import {configuredPrice,selectedOptions} from '../productOptions';
import {menuPhoto} from './featuredMenu';
import QuantityControl from './QuantityControl';

export type Choice = {quantity:number;notes:string;option_ids:string[]};

export default function ProductChoice({product,initial,publicChoice=false,onSave,onClose}:{
  product:Product; initial?:Choice; publicChoice?:boolean; onSave:(choice:Choice)=>void; onClose:()=>void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ids,setIds] = useState(() => selectedOptions(product.options,initial?.option_ids).map(option => option.id));
  const [quantity,setQuantity] = useState(initial?.quantity ?? 1);
  const [notes,setNotes] = useState(initial?.notes ?? '');
  const price = configuredPrice(product.price,selectedOptions(product.options,ids));
  const photo = publicChoice && menuPhoto(product);

  useEffect(() => {dialog.current?.showModal();},[]);

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
    onSave({quantity,notes,option_ids:ids});
    dialog.current?.close();
  }

  return <dialog ref={dialog} className={publicChoice ? 'store-dialog product-choice public-choice' : 'store-dialog product-choice'}
    aria-labelledby="choice-title" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget) dialog.current?.close();}}>
    <form onSubmit={submit}>
      <div className="choice-content">
      {photo && <img className="choice-photo" src={photo} alt="" width={560} height={320}/>}
      <div className="row store-dialog-heading">
        <h2 id="choice-title">{product.name}</h2>
        <button type="button" className="secondary" aria-label="Cerrar opciones" onClick={() => dialog.current?.close()}>×</button>
      </div>
      {product.description && <p>{product.description}</p>}
      {publicChoice && <p className="choice-price"><strong>{money(product.price)}</strong></p>}
      {(['extra','remove'] as const).map(kind => {
        const options = (product.options ?? []).filter(option => option.kind === kind);
        return options.length > 0 && <fieldset className="choice-group" key={kind}>
          <legend>{kind === 'extra' ? 'Adicionales' : 'Ingredientes para retirar'}</legend>
          {options.map(option => <label className="choice-option" key={option.id}>
            <input type="checkbox" checked={ids.includes(option.id)} onChange={event => {
              setIds(current => event.target.checked ? [...current,option.id] : current.filter(id => id !== option.id));
            }}/>
            <span>{kind === 'remove' ? 'Sin ' : ''}{option.label}</span>
            {option.price > 0 && <strong>+{money(option.price)}</strong>}
          </label>)}
        </fieldset>;
      })}
      <label>Nota para cocina (opcional)<textarea value={notes} maxLength={300} onChange={event => setNotes(event.target.value)}
        placeholder={publicChoice ? 'Ej. sin cebolla' : undefined}/></label>
      </div>
      <div className="choice-bottom">
        {publicChoice ? <QuantityControl label="Cantidad" quantity={quantity} onChange={setQuantity}/> :
          <label>Cantidad<input type="number" min={1} max={99} value={Number.isNaN(quantity) ? '' : quantity}
            required onChange={event => setQuantity(event.target.valueAsNumber)}/></label>}
        <button>{initial ? 'Guardar cambios' : 'Agregar al pedido'} · {money(price * (quantity || 0))}</button>
      </div>
    </form>
  </dialog>;
}
