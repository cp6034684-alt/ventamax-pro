import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listaPendientes, reintentarCola, suscribirCola, pendientes } from '../api/colaOffline';
import { fmtMoneda } from '../api/formato';

const hora = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/**
 * Aviso permanente (en todas las pantallas) cuando hay ventas guardadas sin subir.
 * Muestra CUÁNTAS y CUÁLES, el estado de conexión y un botón para sincronizar.
 */
export function SyncBanner() {
  const qc = useQueryClient();
  const [cola, setCola] = useState(listaPendientes());
  const [abierto, setAbierto] = useState(false);
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const refrescar = () => setCola(listaPendientes());
    const off = suscribirCola(refrescar);
    const on = () => setEnLinea(true); const offl = () => setEnLinea(false);
    window.addEventListener('online', on); window.addEventListener('offline', offl);
    return () => { off(); window.removeEventListener('online', on); window.removeEventListener('offline', offl); };
  }, []);

  if (!cola.length) return null;

  const total = cola.reduce((s, v) => s + (v.meta?.total || 0), 0);

  const sincronizar = async () => {
    setSincronizando(true); setMsg('');
    const subidas = await reintentarCola();
    setSincronizando(false);
    const quedan = pendientes();
    setMsg(subidas > 0 ? `✓ ${subidas} subida(s).` : (enLinea ? 'No se pudo subir, reintenta en un momento.' : 'Sin conexión.'));
    if (subidas > 0) { qc.invalidateQueries(); }
    if (quedan === 0) setAbierto(false);
  };

  return (
    <div style={{ background: enLinea ? 'rgba(255,170,0,.12)' : 'rgba(255,64,96,.12)', borderBottom: `1px solid ${enLinea ? 'var(--orange)' : 'var(--red)'}` }}>
      <button onClick={() => setAbierto(a => !a)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
      }}>
        <span style={{ fontSize: 16 }}>{enLinea ? '⚠️' : '📴'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13, color: enLinea ? 'var(--orange)' : 'var(--red)' }}>
            {cola.length} pedido{cola.length !== 1 ? 's' : ''} sin subir
          </strong>
          <span className="muted" style={{ fontSize: 11 }}> · {fmtMoneda(total)} · {enLinea ? 'toca para revisar y sincronizar' : 'sin conexión'}</span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{abierto ? '▾' : '▸'}</span>
      </button>

      {abierto && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
            {cola.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg3)', borderRadius: 8 }}>
                <span className="muted mono" style={{ fontSize: 10, width: 18 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.meta?.cliente || 'Pedido'}</div>
                  <div className="muted" style={{ fontSize: 10 }}>{v.meta?.unidades || 0} und · {hora(v.meta?.fecha || Date.now())}</div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--orange)' }}>{fmtMoneda(v.meta?.total || 0)}</span>
              </div>
            ))}
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={sincronizando || !enLinea} onClick={sincronizar}>
            {sincronizando ? 'Subiendo…' : enLinea ? '⟳ Sincronizar ahora' : 'Sin conexión — se subirá al volver la señal'}
          </button>
          {msg && <div className="muted" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
