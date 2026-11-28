import {lazy,Suspense,useMemo,useState,type FormEvent,type ReactNode} from 'react';
import {labels,money,type Business} from '../model';
import {bolivares,localDateTime,validDeliveryFee,type Coordinates,type CustomerOrder,type Fulfillment,type PaymentMethod} from './checkoutModel';

const DeliveryMap = lazy(()=>import('./DeliveryMap'));

export default function OrderCheckout({business,subtotal,count,basket,busy,blocked,error,onPlace}:{
  business:Business; subtotal:number; count:number; basket:ReactNode; busy:boolean; blocked:boolean;
  error:string; onPlace:(order:CustomerOrder)=>void;
}) {
  const settings = business.checkout;
  const [mode,setMode] = useState<Fulfillment>('pickup');
  const [schedule,setSchedule] = useState(false);
  const [payment,setPayment] = useState<PaymentMethod>('cash');
  const [currency,setCurrency] = useState<'USD'|'VES'>('USD');
  const [tender,setTender] = useState('');
  const [location,setLocation] = useState<Coordinates|null>(null);
  const [validation,setValidation] = useState('');
  const latitude = settings?.latitude;
  const longitude = settings?.longitude;
  const mapOrigin = useMemo(()=>typeof latitude==='number' && typeof longitude==='number' ? {latitude,longitude} : null,[latitude,longitude]);
  const configuredFee = Number(settings?.delivery_fee);
  const deliveryRate = settings?.delivery_enabled && validDeliveryFee(configuredFee) ? configuredFee : null;
  const delivery = mode==='delivery';
  const deliveryUnavailable = delivery && deliveryRate===null;
  const canSchedule = Boolean(settings?.schedule_enabled && mode!=='table');
  const fee = delivery ? deliveryRate ?? 0 : 0;
  const total = Math.round((subtotal+fee)*100)/100;
  const rate = settings?.ves_rate ? Number(settings.ves_rate) : null;
  const cashCurrency = rate && currency==='VES' ? 'VES' : 'USD';
  const options:PaymentMethod[] = ['cash'];
  if (settings?.terminal_enabled && !delivery) options.push('terminal');
  if (settings?.transfer_instructions?.trim()) options.push('transfer');
  if (settings?.binance_instructions?.trim()) options.push('binance');
  const method = options.includes(payment) ? payment : 'cash';
  const instructions = method==='transfer' ? settings?.transfer_instructions : method==='binance' ? settings?.binance_instructions : null;
  const cashTotal = cashCurrency==='VES' && rate ? Math.round(total*rate*100)/100 : total;
  const cashFormat = cashCurrency==='VES' ? bolivares : money;

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked || deliveryUnavailable) return;
    setValidation('');
    const fields = new FormData(event.currentTarget);
    const text = (name:string) => String(fields.get(name) ?? '').trim();
    const customer = text('customer');
    const phone = text('phone');
    const address = text('address');
    const digits = phone.replace(/\D/g,'').length;
    if (!customer || digits<10 || digits>15) {setValidation('Revisa tu nombre y número de WhatsApp.');return;}
    if (delivery && address.length<5) {setValidation('Escribe la dirección de entrega completa.');return;}
    if (mode==='table' && !text('table')) {setValidation('Indica el número o nombre de tu mesa.');return;}
    if (settings && method==='cash' && tender && Number(tender)<cashTotal) {
      setValidation('El efectivo indicado debe cubrir el total.');return;
    }
    onPlace({mode,customer,phone,table:mode==='table' ? text('table') : null,notes:text('notes'),details:{
      expected_fee:fee, expected_rate:rate, payment:method,
      ...(delivery && {address,landmark:text('landmark'),...location}),
      ...(canSchedule && schedule && {schedule_local:text('schedule')}),
      ...(method==='cash' && {cash_currency:cashCurrency,...(tender && {cash_amount:Number(tender)})}),
    }});
  }

  if (!count) return <div className="checkout-empty"><h2>Tu pedido está vacío</h2><p>Elige algo de la carta para comenzar.</p>
    <a className="button portal-primary" href="/#menu">Ver la carta</a></div>;

  return <form className="checkout-flow" onSubmit={submit}>
    <aside className="checkout-summary">
      <div className="row"><h2>Tu pedido <span className="order-item-count">{count}</span></h2>{!busy && <a href="/#menu">Añadir más</a>}</div>
      {basket}
      <dl className="order-prices">
        <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
        {delivery && deliveryRate!==null && <div><dt>Costo de delivery</dt><dd>{money(fee)}</dd></div>}
        <div className="order-price-total"><dt>Total</dt><dd>{money(total)}</dd></div>
        {rate && <div><dt>Equivalente en bolívares</dt><dd>{bolivares(total*rate)}</dd></div>}
      </dl>
    </aside>
    <fieldset className="checkout-fields" disabled={busy}>
      <section className="checkout-card">
        <h2><span aria-hidden="true">1</span>Tus datos</h2>
        <div className="checkout-field-pair">
          <label>Nombre<input name="customer" required maxLength={100} autoComplete="name" placeholder="¿A nombre de quién?"/></label>
          <label>Teléfono (WhatsApp)<input name="phone" type="tel" required maxLength={40} autoComplete="tel" placeholder="Ej. 0412 123 4567"/></label>
        </div>
      </section>
      <section className="checkout-card">
        <h2><span aria-hidden="true">2</span>Entrega</h2>
        <div className="checkout-options" role="group" aria-label="Modalidad de entrega">
          <label className="checkout-option"><input type="radio" name="mode" checked={mode==='pickup'} onChange={()=>setMode('pickup')}/>
            <span><strong>Retiro en el local</strong>{business.address && <small>{business.address}</small>}</span></label>
          <label className="checkout-option" data-unavailable={deliveryRate===null}>
            <input type="radio" name="mode" checked={delivery} disabled={deliveryRate===null} onChange={()=>setMode('delivery')}/>
            <span><strong>Delivery a domicilio</strong><small>{deliveryRate===null ? 'No disponible por ahora' : money(deliveryRate)}</small></span></label>
          <label className="checkout-option"><input type="radio" name="mode" checked={mode==='table'} onChange={()=>setMode('table')}/>
            <span><strong>Consumo en mesa</strong><small>Si ya estás en el local</small></span></label>
        </div>
        {delivery && !deliveryUnavailable && <div className="checkout-detail">
          <label>Dirección<input name="address" autoComplete="street-address" required minLength={5} maxLength={240} placeholder="Calle, sector y número de casa"/></label>
          <label>Punto de referencia (opcional)<input name="landmark" maxLength={160} placeholder="Ej. portón negro frente a la plaza"/></label>
          <Suspense fallback={<p role="status">Cargando mapa…</p>}><DeliveryMap initial={mapOrigin} value={location} onChange={setLocation}/></Suspense>
        </div>}
        {mode==='table' && <label>Mesa<input name="table" required maxLength={40}/></label>}
      </section>
      {canSchedule && <section className="checkout-card">
        <h2><span aria-hidden="true">3</span>¿Para cuándo?</h2>
        <div className="checkout-options" role="group" aria-label="Horario del pedido">
          <label className="checkout-option"><input type="radio" name="schedule_mode" checked={!schedule} onChange={()=>setSchedule(false)}/><strong>Lo antes posible</strong></label>
          <label className="checkout-option"><input type="radio" name="schedule_mode" checked={schedule} onChange={()=>setSchedule(true)}/><strong>Programar</strong></label>
        </div>
        {schedule && <label>Fecha y hora del local
          <input type="datetime-local" name="schedule" required min={localDateTime(new Date(Date.now()+15*60000),business.timezone)}
            max={localDateTime(new Date(Date.now()+7*86400000),business.timezone)}/>
          <small>El local confirmará la hora solicitada.</small>
        </label>}
      </section>}
      {settings && <section className="checkout-card">
        <h2><span aria-hidden="true">{canSchedule ? 4 : 3}</span>Forma de pago</h2>
        <div className="checkout-options" role="group" aria-label="Método de pago">
          {options.map(option=><label className="checkout-option" key={option}>
            <input type="radio" name="method" checked={method===option} onChange={()=>setPayment(option)}/>
            <strong>{labels[option]}</strong>
          </label>)}
        </div>
        {instructions && <p className="checkout-instructions">{instructions}</p>}
        {method==='cash' && <>
          <div className="checkout-field-pair">
            {rate && <label>Moneda<select value={cashCurrency} onChange={event=>{setCurrency(event.target.value as 'USD'|'VES');setTender('');}}>
              <option value="USD">Dólares (USD)</option><option value="VES">Bolívares (Bs)</option></select></label>}
            <label>¿Con cuánto pagas? (opcional)
              <input type="number" inputMode="decimal" min={cashTotal} max={999999999999.99} step=".01" value={tender}
                onChange={event=>setTender(event.target.value)} placeholder={cashFormat(cashTotal)}/>
            </label>
          </div>
          {tender && Number(tender)>=cashTotal && <p className="web-basket-note">Cambio estimado · {cashFormat(Number(tender)-cashTotal)}</p>}
        </>}
        <p className="web-basket-note">El local verifica el pago.</p>
      </section>}
      <section className="checkout-card">
        <label>Comentarios del pedido (opcional)<textarea name="notes" maxLength={500} placeholder="Algo más que debamos saber"/></label>
      </section>
    </fieldset>
    <div className="checkout-submit">
      {deliveryUnavailable && <p className="notice" role="alert">El delivery dejó de estar disponible. Elige retiro en el local o consumo en mesa.</p>}
      {(validation || error) && <p className="notice" role="alert">{validation || error}</p>}
      <button className="button portal-primary" disabled={busy || blocked || deliveryUnavailable}>
        <span>{busy ? 'Enviando pedido…' : 'Confirmar pedido'}</span><strong>{money(total)}</strong>
      </button>
    </div>
  </form>;
}
