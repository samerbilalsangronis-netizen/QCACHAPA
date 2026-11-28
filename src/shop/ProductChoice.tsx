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
  const action = initial ? 'Guardar cambios' : 'Agregar al pedido';
  const total = money(price * (quantity || 0));
  const heading = <h2 id="choice-title">{product.name}</h2>;
  const close = <button type="button" className={publicChoice ? 'choice-close' : 'secondary'}
    aria-label="Cerrar opciones" onClick={() => dialog.current?.close()}>×</button>;
  const note = <textarea value={notes} maxLength={300} onChange={event => setNotes(event.target.value)}
    aria-label={publicChoice ? 'Nota para cocina (opcional)' : undefined}
    placeholder={publicChoice ? 'Ej. sin cebolla' : undefined}/>;

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
      {publicChoice && close}
      <div className="choice-content">
        {photo && <div className="choice-media">
          <img className="choice-photo-backdrop" src={photo} alt="" aria-hidden="true"/>
          <img className="choice-photo" src={photo} alt=""/>
        </div>}
        <div className="choice-details">
          {publicChoice ? <header className="choice-intro">
            <div className="choice-title-row">{heading}<strong className="choice-price">{money(product.price)}</strong></div>
            {product.description && <p>{product.description}</p>}
          </header> : <>
            <div className="row store-dialog-heading">{heading}{close}</div>
            {product.description && <p>{product.description}</p>}
          </>}
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
          {publicChoice ? <details className="choice-note" open={initial?.notes ? true : undefined}>
            <summary>{notes ? 'Nota para cocina' : 'Añadir nota para cocina'}</summary>{note}
          </details> : <label>Nota para cocina (opcional){note}</label>}
        </div>
      </div>
      <div className="choice-bottom">
        {publicChoice ? <QuantityControl label="Cantidad" quantity={quantity} onChange={setQuantity}/> :
          <label>Cantidad<input type="number" min={1} max={99} value={Number.isNaN(quantity) ? '' : quantity}
            required onChange={event => setQuantity(event.target.valueAsNumber)}/></label>}
        <button>{publicChoice ? <><span>{action}</span><strong>{total}</strong></> : action+' · '+total}</button>
      </div>
    </form>
  </dialog>;
}
