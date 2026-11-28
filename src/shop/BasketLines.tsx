import {money,type Product} from '../model';
import {optionLabel,type ProductOption} from '../productOptions';
import {menuPhoto} from './featuredMenu';
import QuantityControl from './QuantityControl';

export type BasketItem = {
  product?:Product; quantity:number; unitPrice:number; notes:string;
  options:ProductOption[]; optionsChanged:boolean;
};

export default function BasketLines({items,checked,disabled,onEdit,onRemove,onQuantity}:{
  items:BasketItem[]; checked:boolean; disabled:boolean;
  onEdit:(index:number)=>void; onRemove:(index:number)=>void; onQuantity:(index:number,quantity:number)=>void;
}) {
  return <ul className="web-basket-lines" aria-label="Productos del pedido">
    {items.map((item,index)=>{
      const product = item.product;
      const name = product?.name ?? 'Producto no disponible';
      const photo = product && menuPhoto(product);
      return <li className="web-basket-line" key={index}>
        {photo && <img src={photo} alt="" width={64} height={64}/>}
        <div className="web-basket-item">
          <div className="row"><strong>{name}</strong><strong>{money(item.unitPrice*item.quantity)}</strong></div>
          {item.options.length > 0 && <p className="web-basket-note">{item.options.map(optionLabel).join(' · ')}</p>}
          {item.notes && <p className="web-basket-note">{item.notes}</p>}
          {checked && !product?.available && <p className="notice">Agotado. Retira este producto para continuar.</p>}
          {checked && item.optionsChanged && <p className="notice">Las opciones cambiaron. Edita el producto para continuar.</p>}
          <div className="web-basket-actions">
            <QuantityControl label={'Cantidad de '+name} quantity={item.quantity} disabled={disabled} onChange={quantity=>onQuantity(index,quantity)}/>
            {product?.available && <button type="button" className="text-button" disabled={disabled} onClick={()=>onEdit(index)}>Editar</button>}
            <button type="button" className="text-button" disabled={disabled} aria-label={'Quitar '+name} onClick={()=>onRemove(index)}>Quitar</button>
          </div>
        </div>
      </li>;
    })}
  </ul>;
}
