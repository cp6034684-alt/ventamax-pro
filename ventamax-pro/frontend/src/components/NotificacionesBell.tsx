import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionesApi } from '../api/servicios';

const hace = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Campana de notificaciones (supervisores/admin): inicio de ruta auditado, etc. */
export function NotificacionesBell() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const { data } = useQuery({ queryKey: ['notificaciones'], queryFn: notificacionesApi.listar, refetchInterval: 60_000 });
  const noLeidas = data?.noLeidas ?? 0;
  const items = data?.items ?? [];

  const abrir = async () => {
    setAbierto(v => !v);
    if (!abierto && noLeidas > 0) {
      await notificacionesApi.marcarTodas().catch(() => {});
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={abrir} title="Notificaciones" aria-label="Notificaciones"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, position: 'relative' }}>
        🔔
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px',
            background: 'var(--red)', color: '#fff', borderRadius: 9, fontSize: 10, fontWeight: 800,
            display: 'grid', placeItems: 'center',
          }}>{noLeidas > 9 ? '9+' : noLeidas}</span>
        )}
      </button>

      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200 }} />
          <div style={{
            position: 'absolute', right: 0, top: 28, width: 300, maxHeight: '70vh', overflowY: 'auto', zIndex: 1300,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.55)', padding: 8,
          }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, padding: '4px 6px' }}>Notificaciones</div>
            {!items.length && <div className="muted" style={{ fontSize: 12, padding: 12, textAlign: 'center' }}>Sin notificaciones.</div>}
            {items.map(n => (
              <div key={n.id} style={{ padding: '8px 8px', borderTop: '1px solid var(--border)', background: n.leida ? 'transparent' : 'rgba(0,200,255,.06)', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{n.titulo}</div>
                {n.detalle && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{n.detalle}</div>}
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{hace(n.creadoEn)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
