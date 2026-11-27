import type {ProductOption} from './productOptions';
import {createClient} from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;

export const money = (value: number) => new Intl.NumberFormat('es-VE', {
  style: 'currency', currency: 'USD',
}).format(value);
export const labels: Record<string, string> = {
  received:'Recibido', confirmed:'Confirmado', preparing:'En preparación', ready:'Listo',
  delivered:'Entregado', cancelled:'Cancelado', pickup:'Retiro en local', table:'Consumo en mesa',
  web:'Web', pos:'Caja', floor:'Salón', cash:'Efectivo', terminal:'Punto de venta', transfer:'Transferencia',
  note:'Apunte', task:'Pendiente', event:'Compromiso', incident:'Novedad', pending:'Pendiente',
  in_progress:'En progreso', waiting:'En espera', completed:'Completado', archived:'Archivado',
};

export type Product = {id:string; category_id:string; name:string; description:string; image_url:string|null; price:number; available:boolean; prep_minutes:number; options?:ProductOption[]};
export type Category = {id:string; name:string};
export type Business = {name:string; slogan:string; logo_url:string|null; hero_url:string|null; address:string|null; hours:string|null; whatsapp:string|null; accepting_orders:boolean; timezone:string};
export const initialBusiness: Business = {
  name:"Q'Cachapas", slogan:'¡Lo mejor del maíz en su mesa!', logo_url:null, hero_url:null,
  address:null, hours:null, whatsapp:null, accepting_orders:false, timezone:'America/Caracas',
};
export type Role = 'admin'|'cashier'|'kitchen'|'waiter';
export type Line = {id:string; name:string; quantity:number; notes:string; price?:number; prepared?:boolean};
export type Ticket = {id:string; number:number; status:string; source:string; mode:string; table_name:string|null; notes:string|null; created_at:string; prep_minutes:number; lines:Line[]};
export type Order = Omit<Ticket,'lines'> & {total:number; customer:string; order_lines:Line[]; payments:{method:string; amount:number}|null};
export type Shift = {id:string; closed_at:string|null; opened_at:string; opening_cash:number; counted_cash:number|null; expected_cash:number|null};
export type Entry = {id:string; author:string; kind:string; title:string; body:string; due_on:string|null; private:boolean; status:string};

export function readStored<T>(key:string, fallback:T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

export function saveStored(key:string, value:unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* The current tab can still finish the active request. */ }
}

export function time(value:string, timezone:string) {
  return new Intl.DateTimeFormat('es-VE',{timeStyle:'short',timeZone:timezone}).format(new Date(value));
}

export async function rpc(name:string, args:Record<string,unknown>) {
  if (!db) throw new Error('Conecta Supabase para continuar.');
  const {data,error} = await db.rpc(name,args);
  if (error) throw new Error(error.message);
  return data;
}
