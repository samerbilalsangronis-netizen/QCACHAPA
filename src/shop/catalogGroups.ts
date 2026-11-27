import type {Category,Product} from '../model';

export type MenuGroup = {id:string; name:string; categoryIds:string[]; products:Product[]};

const cachapaLabels = new Set(['cachapa','cachapas','cachapa tradicional','cachapas tradicionales','cachapas de autor','cachapas especiales']);

export function publicMenuGroups(categories:readonly Category[],products:readonly Product[]):MenuGroup[] {
  const groups = new Map<string,MenuGroup>();
  const byCategory = new Map<string,MenuGroup>();
  for (const category of categories) {
    const cachapas = cachapaLabels.has(category.name.trim().toLocaleLowerCase('es'));
    const id = cachapas ? 'cachapas' : category.id;
    const group = groups.get(id) ?? {id,name:cachapas ? 'Cachapas' : category.name,categoryIds:[],products:[]};
    groups.set(id,group);
    group.categoryIds.push(category.id);
    byCategory.set(category.id,group);
  }
  const other:MenuGroup = {id:'otros',name:'Otros',categoryIds:[],products:[]};
  for (const product of products) {
    if (product.available) (byCategory.get(product.category_id) ?? other).products.push(product);
  }
  return [...groups.values(),other].filter(group => group.products.length > 0);
}
