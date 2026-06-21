// Listas de precio. Cada producto tiene un precio por lista y
// el vendedor cobra con la lista que tenga asignada/seleccionada.
export const LISTAS = ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS', 'TAT_VIAJEROS', 'ENTRE_SEDE'] as const;
export type Lista = typeof LISTAS[number];

export const COLUMNA_LISTA: Record<Lista, string> = {
  GENERAL: 'precioGeneral',
  MAYORISTA: 'precioMayorista',
  TAT: 'precioTat',
  DROGUERIAS: 'precioDroguerias',
  TAT_VIAJEROS: 'precioTatViajeros',
  ENTRE_SEDE: 'precioEntreSede',
};

// Precio del producto según la lista; si no hay, cae al precioVenta por defecto.
export function precioDeLista(producto: any, lista?: string | null): number {
  const col = lista ? (COLUMNA_LISTA as any)[lista] : null;
  const v = col ? Number(producto[col]) : 0;
  return v > 0 ? v : Number(producto.precioVenta);
}
