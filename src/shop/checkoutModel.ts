export type CheckoutSettings = {
  delivery_enabled:boolean;
  delivery_fee:number;
  latitude?:number|null;
  longitude?:number|null;
  schedule_enabled:boolean;
  terminal_enabled:boolean;
  transfer_instructions?:string|null;
  binance_instructions?:string|null;
  ves_rate?:number|null;
};

export type PaymentMethod = 'cash'|'terminal'|'transfer'|'binance';
export type Fulfillment = 'pickup'|'delivery'|'table';
export type Coordinates = {latitude:number;longitude:number};
export type CheckoutDetails = {
  address?:string;
  landmark?:string;
  latitude?:number;
  longitude?:number;
  expected_fee:number;
  expected_rate?:number|null;
  schedule_local?:string;
  payment:PaymentMethod;
  cash_currency?:'USD'|'VES';
  cash_amount?:number;
};
export type CustomerOrder = {
  mode:Fulfillment;
  customer:string;
  phone:string;
  table:string|null;
  notes:string;
  details:CheckoutDetails;
};
export type SavedCheckoutDetails = Omit<CheckoutDetails,'expected_fee'|'expected_rate'|'schedule_local'> & {
  delivery_fee?:number;
  scheduled_at?:string;
  dispatched_at?:string;
  ves_rate?:number;
};

export const bolivares = (amount:number) => new Intl.NumberFormat('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)+' Bs';
export function dateAndTime(iso:string,timezone:string) {
  return new Intl.DateTimeFormat('es-VE',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(iso));
}
export function localDateTime(date:Date,timezone:string) {
  const parts = new Intl.DateTimeFormat('sv-SE',{
    timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(date);
  const part = (type:string) => parts.find(p => p.type === type)?.value ?? '';
  return part('year')+'-'+part('month')+'-'+part('day')+'T'+part('hour')+':'+part('minute');
}
