/**
 * Venta TAT = vendedores en la calle con señal intermitente.
 * Si una venta no puede subir, se guarda en una cola local (con los datos
 * del pedido) y se reintenta automáticamente. El campo `idLocal` (UUID)
 * hace que el backend ignore reintentos duplicados, así nunca se crea
 * factura doble ni número repetido.
 */
import { facturasApi } from './servicios';

type Venta = Parameters<typeof facturasApi.crear>[0];
export interface VentaMeta { cliente: string; unidades: number; total: number; fecha: number; }
export interface VentaPendiente { venta: Venta; meta: VentaMeta; }

const CLAVE = 'vm_cola_ventas';

// ── Pub/sub para que la interfaz se actualice sola ──
type Listener = () => void;
const oyentes = new Set<Listener>();
export function suscribirCola(l: Listener): () => void { oyentes.add(l); return () => { oyentes.delete(l); }; }
function notificar() { oyentes.forEach(l => { try { l(); } catch { /* noop */ } }); }

function leer(): VentaPendiente[] {
  try {
    const arr = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
    if (!Array.isArray(arr)) return [];
    // Compatibilidad con el formato viejo (solo la venta, sin meta)
    return arr.map((x: any) => x && x.venta ? x : { venta: x, meta: { cliente: 'Pedido', unidades: 0, total: 0, fecha: Date.now() } });
  } catch { return []; }
}
function guardar(cola: VentaPendiente[]) { localStorage.setItem(CLAVE, JSON.stringify(cola)); notificar(); }

export function encolarVenta(venta: Venta, meta: VentaMeta) { guardar([...leer(), { venta, meta }]); }
export function pendientes(): number { return leer().length; }
export function listaPendientes(): VentaPendiente[] { return leer(); }

let sincronizando = false;
/** Reintenta subir toda la cola. Devuelve cuántas ventas se subieron. */
export async function reintentarCola(): Promise<number> {
  if (sincronizando || !navigator.onLine) return 0;
  sincronizando = true;
  try {
    const cola = leer();
    if (!cola.length) return 0;
    const fallidas: VentaPendiente[] = [];
    let subidas = 0;
    for (const v of cola) {
      try { await facturasApi.crear(v.venta); subidas++; }
      catch { fallidas.push(v); }
    }
    guardar(fallidas);
    return subidas;
  } finally { sincronizando = false; }
}

// Reintentos automáticos: al volver la conexión, al volver a la app y cada 30s.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { reintentarCola(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && pendientes() > 0) reintentarCola();
  });
  setInterval(() => { if (navigator.onLine && pendientes() > 0) reintentarCola(); }, 30_000);
}
