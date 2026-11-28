import type {Product} from '../model';
import {catalogPhoto} from './catalogPhotos';

type DishName = {name:string; aliases?:readonly string[]};

type FeaturedDish = DishName & {
  cover:string;
  mobilePhoto?:string;
  category:string;
  label?:string;
  description:string;
};

const lomo = {name:'Lomo de res',aliases:['Lomo a la plancha','Lomo']};
const cachapa = {name:'Cachapa con queso',aliases:['Cachapa de queso']};

export const featuredDishes:readonly FeaturedDish[] = [
  {...lomo,cover:'lomo',mobilePhoto:'/plato-lomo.webp',category:'Almuerzos',label:'Almuerzos venezolanos',
    description:'Lomo a la plancha acompañado de yuca y ensalada.'},
  {...cachapa,cover:'cachapa',category:'Cachapas',label:'Pide tu cachapa todo el día',
    description:'Cachapa dorada de maíz con queso blanco suave, queso fundido, nata y queso rallado.'},
  {name:'Q’ Hamburguesa',aliases:['Q Hamburguesa'],cover:'hamburguesa',category:'Hamburguesas',
    description:'Con chuleta, jamón, quesos, huevo, tocineta y papas fritas.'},
  {name:'Perro caliente',aliases:['Perro caliente clásico'],cover:'perro',category:'Perros calientes',
    description:'Salchicha frita con jamón, queso, ensalada rallada, pepinillos y papas fritas.'},
  {name:'Patacón mixto',cover:'patacon',category:'Patacones',
    description:'Plátano verde frito con carne, cochino y pollo mechado, jamón y quesos.'},
];

const menuDishes:readonly (DishName & {photo:string})[] = [
  {...lomo,photo:'/plato-lomo.webp'},
  {name:'Pollo guisado',photo:'/plato-pollo.webp'},
  {name:'Pabellón criollo',photo:'/plato-pabellon.webp'},
  {name:'Pescado frito',photo:'/plato-pescado.webp'},
  {...cachapa,photo:'/plato-queso.webp'},
  {name:'Cachapa con queso y chicharrón',photo:'/plato-chicharron.webp'},
  {name:'Cachapa con queso y carne mechada',photo:'/plato-mechada.webp'},
];

const legacyPhotos = new Set([
  '/almuerzo-pabellon.webp','/almuerzo-pollo.webp','/almuerzo-asado.webp',
  '/almuerzo-pescado.webp','/cachapa.webp','/cachapa-portada.webp','/cachapa-portada-movil.webp',
]);

function normalize(name:string) {
  return name.trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[’']/g,'').toLocaleLowerCase('es');
}

export function matchingProduct(dish:DishName,products:readonly Product[]) {
  for (const name of [dish.name,...(dish.aliases ?? [])]) {
    const match = products.find(item => item.available && normalize(item.name) === normalize(name));
    if (match) return match;
  }
}

export function referencePhoto(dish:FeaturedDish, product?:Product, wide=false) {
  const uploaded = product?.image_url;
  if (uploaded && !legacyPhotos.has(uploaded)) return uploaded;
  return wide ? '/portada/'+dish.cover+'.webp' : dish.mobilePhoto ?? '/portada/'+dish.cover+'-movil.webp';
}

export function menuPhoto(product:Product) {
  if (product.image_url && !legacyPhotos.has(product.image_url)) return product.image_url;
  const name = normalize(product.name);
  const dish = menuDishes.find(item => [item.name,...(item.aliases ?? [])].some(label => normalize(label) === name));
  return dish?.photo ?? catalogPhoto(name) ?? product.image_url;
}
