import type {Product} from '../model';
import {catalogPhoto} from './catalogPhotos';

export type FeaturedDish = {
  name:string;
  image:string;
  description:string;
  aliases?:readonly string[];
};

export const lunchDishes:readonly FeaturedDish[] = [
  {name:'Lomo de res',image:'lomo',description:'Lomo a la plancha acompañado de yuca y ensalada.',aliases:['Lomo a la plancha','Lomo']},
  {name:'Pollo guisado',image:'pollo',description:'Pollo guisado con papas, zanahorias y arroz.'},
  {name:'Pabellón criollo',image:'pabellon',description:'Carne mechada, caraotas negras, arroz y tajadas.'},
  {name:'Pescado frito',image:'pescado',description:'Pescado dorado con patacones, limón y ensalada.'},
];

export const cachapaDishes:readonly FeaturedDish[] = [
  {name:'Cachapa con queso',image:'queso',description:'Cachapa dorada de maíz con queso de mano.',aliases:['Cachapa de queso']},
  {name:'Cachapa con queso y chicharrón',image:'chicharron',description:'Queso de mano y el toque crujiente del chicharrón.'},
  {name:'Cachapa con queso y carne mechada',image:'mechada',description:'Queso de mano y carne mechada jugosa.'},
];

const legacyPhotos = new Set([
  '/almuerzo-pabellon.webp','/almuerzo-pollo.webp','/almuerzo-asado.webp',
  '/almuerzo-pescado.webp','/cachapa.webp','/cachapa-portada.webp','/cachapa-portada-movil.webp',
]);

function normalize(name:string) {
  return name.trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es');
}

export function matchingProduct(dish:FeaturedDish,products:readonly Product[]) {
  for (const name of [dish.name,...(dish.aliases ?? [])]) {
    const match = products.find(item => item.available && normalize(item.name) === normalize(name));
    if (match) return match;
  }
}

export function referencePhoto(dish:FeaturedDish, product?:Product) {
  const uploaded = product?.image_url;
  return uploaded && !legacyPhotos.has(uploaded) ? uploaded : '/plato-'+dish.image+'.webp';
}

export function menuPhoto(product:Product) {
  if (product.image_url && !legacyPhotos.has(product.image_url)) return product.image_url;
  const name = normalize(product.name);
  const dish = [...lunchDishes,...cachapaDishes].find(item => [item.name,...(item.aliases ?? [])]
    .some(label => normalize(label) === name));
  return dish ? referencePhoto(dish) : catalogPhoto(name) ?? product.image_url;
}
