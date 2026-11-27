export type ProductOption = {id:string;label:string;kind:'extra'|'remove';price:number};

export function selectedOptions(options:ProductOption[]|undefined, ids:readonly string[] = []) {
  return (options ?? []).filter(option => ids.includes(option.id));
}

export function optionLabel(option:ProductOption) {
  return (option.kind === 'remove' ? 'Sin ' : 'Extra: ') + option.label;
}

export function configuredPrice(price:number, options:readonly ProductOption[]) {
  return (Math.round(Number(price)*100) + options.reduce((sum,option) => sum + Math.round(Number(option.price)*100),0))/100;
}
