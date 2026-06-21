import type { Producto } from './tipos';

// Listas de precio. El vendedor cobra con la lista seleccionada.
export const LISTAS = ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS', 'TAT_VIAJEROS', 'ENTRE_SEDE'] as const;
export type Lista = typeof LISTAS[number];

export const LISTA_LABEL: Record<Lista, string> = {
  GENERAL: 'General', MAYORISTA: 'Mayorista', TAT: 'TAT', DROGUERIAS: 'Droguerías',
  TAT_VIAJEROS: 'TAT Viajeros', ENTRE_SEDE: 'Entre Sede',
};

const CAMPO: Record<Lista, keyof Producto> = {
  GENERAL: 'precioGeneral', MAYORISTA: 'precioMayorista', TAT: 'precioTat', DROGUERIAS: 'precioDroguerias',
  TAT_VIAJEROS: 'precioTatViajeros', ENTRE_SEDE: 'precioEntreSede',
};

// Precio del producto según la lista; cae al precioVenta por defecto.
export function precioLista(p: Producto, lista?: string): number {
  const campo = lista ? (CAMPO as any)[lista] : null;
  const v = campo ? Number((p as any)[campo]) : 0;
  return v > 0 ? v : Number(p.precioVenta);
}
