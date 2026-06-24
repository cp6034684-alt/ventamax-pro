/**
 * Cola de ventas sin conexión (resiliente).
 * - Persistencia en IndexedDB (sobrevive mejor que localStorage, mayor capacidad).
 * - Caché en memoria como fuente de lectura instantánea (la API pública es síncrona).
 * - Migra automáticamente lo que hubiera quedado en localStorage (formato anterior).
 * - El `idLocal` (UUID por venta y por dispositivo) evita facturas duplicadas:
 *   el servidor descarta reintentos repetidos, así nunca se repite el consecutivo.
 *
 * Nota: la cola es POR DISPOSITIVO. Si un vendedor usa dos celulares, cada uno
 * tiene su propia cola; ambos suben sin duplicar gracias al idLocal, pero cada
 * teléfono debe reconectarse para vaciar sus propios pendientes.
 */
import { facturasApi } from './servicios';

type Venta = Parameters<typeof facturasApi.crear>[0];
export interface VentaMeta { cliente: string; unidades: number; total: number; fecha: number; }
export interface VentaPendiente { id: string; venta: Venta; meta: VentaMeta; }

const LS_VIEJA = 'vm_cola_ventas';
const DB_NOMBRE = 'ventamax_offline';
const STORE = 'cola';

// ── Caché en memoria (fuente para lecturas síncronas) ──
let cache: VentaPendiente[] = [];

// ── Pub/sub para que la interfaz se actualice sola ──
type Listener = () => void;
const oyentes = new Set<Listener>();
export function suscribirCola(l: Listener): () => void {
  oyentes.add(l);
  try { l(); } catch { /* noop */ }   // entrega el estado actual al suscribirse
  return () => { oyentes.delete(l); };
}
function notificar() { oyentes.forEach(l => { try { l(); } catch { /* noop */ } }); }

// ── Capa de persistencia (IndexedDB con respaldo a localStorage) ──
const hayIDB = typeof indexedDB !== 'undefined';
let dbp: Promise<IDBDatabase> | null = null;
function abrir(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NOMBRE, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function persistTodos(): Promise<VentaPendiente[]> {
  if (!hayIDB) { try { return JSON.parse(localStorage.getItem(LS_VIEJA) ?? '[]'); } catch { return []; } }
  const d = await abrir();
  return new Promise((res, rej) => {
    const rq = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
  });
}
async function persistGuardar(v: VentaPendiente) {
  if (!hayIDB) { localStorage.setItem(LS_VIEJA, JSON.stringify(cache)); return; }
  const d = await abrir();
  await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function persistBorrar(id: string) {
  if (!hayIDB) { localStorage.setItem(LS_VIEJA, JSON.stringify(cache)); return; }
  const d = await abrir();
  await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

function normalizar(x: any): VentaPendiente {
  // Soporta el formato nuevo {id,venta,meta}, el intermedio {venta,meta} y el viejo (solo venta).
  const venta = x?.venta ?? x;
  const meta = x?.meta ?? { cliente: 'Pedido', unidades: 0, total: 0, fecha: Date.now() };
  const id = x?.id ?? venta?.idLocal ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
  return { id, venta, meta };
}

// ── Hidratación inicial + migración desde localStorage ──
(async () => {
  try {
    const guardados = (await persistTodos()).map(normalizar);
    // Migrar cola vieja de localStorage si existe.
    let viejos: VentaPendiente[] = [];
    try { const raw = localStorage.getItem(LS_VIEJA); if (raw && hayIDB) viejos = (JSON.parse(raw) || []).map(normalizar); } catch { /* noop */ }
    const ids = new Set(guardados.map(g => g.id));
    const aMigrar = viejos.filter(v => !ids.has(v.id));
    cache = [...guardados, ...aMigrar];
    if (hayIDB) { for (const v of aMigrar) await persistGuardar(v); if (viejos.length) localStorage.removeItem(LS_VIEJA); }
    notificar();
    if (navigator.onLine && cache.length) reintentarCola();
  } catch { /* noop */ }
})();

// ── API pública (síncrona para lecturas) ──
export function pendientes(): number { return cache.length; }
export function listaPendientes(): VentaPendiente[] { return cache.slice(); }

export function encolarVenta(venta: Venta, meta: VentaMeta) {
  const item = normalizar({ venta, meta });
  cache = [...cache, item];
  notificar();
  persistGuardar(item).catch(() => { /* noop */ });
}

let sincronizando = false;
/** Reintenta subir toda la cola. Devuelve cuántas ventas se subieron. */
export async function reintentarCola(): Promise<number> {
  if (sincronizando || !navigator.onLine) return 0;
  sincronizando = true;
  try {
    const snapshot = [...cache];
    if (!snapshot.length) return 0;
    const subidos: string[] = [];
    for (const v of snapshot) {
      try { await facturasApi.crear(v.venta); subidos.push(v.id); }
      catch { /* queda en cola */ }
    }
    if (subidos.length) {
      const s = new Set(subidos);
      cache = cache.filter(x => !s.has(x.id));
      for (const id of subidos) await persistBorrar(id).catch(() => { /* noop */ });
      notificar();
    }
    return subidos.length;
  } finally { sincronizando = false; }
}

// ── Reintentos automáticos: al volver la conexión, al volver a la app y cada 30s. ──
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { reintentarCola(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && cache.length) reintentarCola();
  });
  setInterval(() => { if (navigator.onLine && cache.length) reintentarCola(); }, 30_000);
}
