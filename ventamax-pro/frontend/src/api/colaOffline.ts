/**
 * Venta TAT = vendedores en la calle con señal intermitente.
 * Si una venta falla por red, se encola y se reintenta al volver
 * la conexión. El campo `idLocal` (UUID generado aquí) hace que el
 * backend ignore reintentos duplicados.
 */
import { facturasApi } from './servicios';

type VentaPendiente = Parameters<typeof facturasApi.crear>[0];
const CLAVE = 'vm_cola_ventas';

function leer(): VentaPendiente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}
function guardar(cola: VentaPendiente[]) {
  localStorage.setItem(CLAVE, JSON.stringify(cola));
}

export function encolarVenta(venta: VentaPendiente) {
  guardar([...leer(), venta]);
}

export function pendientes(): number { return leer().length; }

export async function reintentarCola(): Promise<number> {
  const cola = leer();
  if (!cola.length) return 0;
  const fallidas: VentaPendiente[] = [];
  for (const v of cola) {
    try { await facturasApi.crear(v); }
    catch { fallidas.push(v); }
  }
  guardar(fallidas);
  return cola.length - fallidas.length;
}

// Reintenta automáticamente cuando vuelve la conexión
window.addEventListener('online', () => { reintentarCola(); });
