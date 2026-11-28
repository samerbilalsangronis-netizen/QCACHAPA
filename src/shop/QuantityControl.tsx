export default function QuantityControl({label,quantity,onChange,disabled=false}:{
  label:string; quantity:number; onChange:(quantity:number)=>void; disabled?:boolean;
}) {
  return <div className="quantity-control" role="group" aria-label={label}>
    <button type="button" aria-label={'Reducir '+label.toLocaleLowerCase('es')} disabled={disabled || quantity<=1} onClick={()=>onChange(quantity-1)}>−</button>
    <output aria-live="polite">{quantity}</output>
    <button type="button" aria-label={'Aumentar '+label.toLocaleLowerCase('es')} disabled={disabled || quantity>=99} onClick={()=>onChange(quantity+1)}>+</button>
  </div>;
}
