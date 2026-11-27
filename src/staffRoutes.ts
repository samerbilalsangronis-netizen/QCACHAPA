import type {Role} from './model';

export const staffRoutes = {
  orders:{label:'Pedidos',path:'/personal/pedidos/',panel:'cashier'},
  manual:{label:'Pedido manual',path:'/personal/pedidos/nuevo/',panel:'cashier'},
  till:{label:'Caja',path:'/personal/caja/',panel:'cashier'},
  tables:{label:'Mesas',path:'/personal/mesas/',panel:'waiter'},
  kitchen:{label:'Cocina',path:'/personal/cocina/',panel:'kitchen'},
  menu:{label:'Menú',path:'/personal/menu/',panel:'admin'},
  reports:{label:'Reportes',path:'/personal/reportes/',panel:'admin'},
  settings:{label:'Ajustes',path:'/personal/ajustes/',panel:'admin'},
  organizer:{label:'Organizador',path:'/personal/organizador/',panel:'admin'},
} as const;

export type StaffRoute = keyof typeof staffRoutes;
export type CashierView = 'orders'|'till'|'manual';
export type AdminView = 'menu'|'reports'|'settings'|'organizer';

const allowed:Record<Role,readonly StaffRoute[]> = {
  admin:['tables','orders','manual','till','kitchen','menu','reports','organizer','settings'],
  cashier:['orders','manual','till','tables'],
  kitchen:['kitchen'],
  waiter:['tables'],
};

export function staffRoute(role:Role, pathname:string): StaffRoute {
  const path = pathname.replace(/\/+$/, '')+'/';
  return allowed[role].find(route => staffRoutes[route].path === path) ?? allowed[role][0];
}

export function staffNavigation(role:Role) {
  return allowed[role].filter(route => route !== 'manual');
}

export function isCashierView(route:StaffRoute): route is CashierView {
  return staffRoutes[route].panel === 'cashier';
}

export function isAdminView(route:StaffRoute): route is AdminView {
  return staffRoutes[route].panel === 'admin';
}
