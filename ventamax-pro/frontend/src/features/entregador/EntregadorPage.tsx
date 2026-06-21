import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { facturasApi } from '../../api/servicios';
import { Mapa } from '../../components/Mapa';
import { Recibo } from '../../components/Recibo';
import { DevolucionModal } from '../../components/DevolucionModal';
import { fmtMoneda, fmtFecha } from '../../api/formato';
import type { FacturaEntrega } from '../../api/tipos';

export function EntregadorPage() {
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista');
  const [recibo, setRecibo] = useState<FacturaEntrega | null>(null);
  const [devolver, setDevolver] = useState<FacturaEntrega | null>(null);
  const qc = useQueryClient();

  const { data: cola, isLoading } = useQuery({
    queryKey: ['cola-entrega'],
    queryFn: facturasApi.colaEntrega,
    refetchInterval: 30_000, // la cola se refresca sola cada 30 s
  });

  const entregar = useMutation({
    mutationFn: (f: FacturaEntrega) => facturasApi.cambiarEstado(f.id, 'ENTREGADA'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cola-entrega'] }),
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={`btn ${vista === 'lista' ? '' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setVista('lista')}>
          📋 Lista ({cola?.length ?? 0})
        </button>
        <button className={`btn ${vista === 'mapa' ? '' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setVista('mapa')}>
          🗺 Mapa
        </button>
      </div>

      {isLoading && <p className="muted">Cargando cola de entregas…</p>}
      {!isLoading && !cola?.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 28 }}>✅</p>
          <p>No hay entregas pendientes.</p>
        </div>
      )}

      {vista === 'mapa' && !!cola?.length && (
        <Mapa puntos={cola.filter(f => f.cliente.lat && f.cliente.lng).map(f => ({
          id: f.id, lat: f.cliente.lat!, lng: f.cliente.lng!,
          titulo: `#${f.consecutivo} · ${f.cliente.nombre}`,
          descripcion: `${fmtMoneda(f.total)} · ${f.cliente.direccion ?? f.cliente.barrio ?? ''}`,
          color: '#ffaa00',
        }))} />
      )}

      {vista === 'lista' && cola?.map(f => (
        <div key={f.id} className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong>#{f.consecutivo} · {f.cliente.nombre}</strong>
            <span className="mono accent">{fmtMoneda(f.total)}</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {[f.cliente.direccion, f.cliente.barrio].filter(Boolean).join(' · ')}
            <br />Vendió: {f.vendedor?.nombre} · {fmtFecha(f.creadoEn)}
          </div>
          <details style={{ fontSize: 12, margin: '8px 0' }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Ver productos ({f.items.length})</summary>
            {f.items.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>{i.producto?.nombre} × {i.cantidad}</span>
                <span className="mono">{fmtMoneda(i.total)}</span>
              </div>
            ))}
          </details>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {f.cliente.lat && f.cliente.lng && (
              <a className="btn btn-ghost" style={{ flex: '1 1 30%', textAlign: 'center', textDecoration: 'none', fontSize: 13 }}
                href={`https://www.google.com/maps/dir/?api=1&destination=${f.cliente.lat},${f.cliente.lng}`}
                target="_blank" rel="noreferrer">🧭 Cómo llegar</a>
            )}
            {f.cliente.telefono && (
              <a className="btn btn-ghost" style={{ flex: '1 1 30%', textAlign: 'center', textDecoration: 'none', fontSize: 13 }}
                href={`tel:${f.cliente.telefono}`}>📞 Llamar</a>
            )}
            <button className="btn btn-ghost" style={{ flex: '1 1 30%', fontSize: 13 }} onClick={() => setRecibo(f)}>🧾 Recibo</button>
            <button className="btn btn-ghost" style={{ flex: '1 1 30%', fontSize: 13, color: 'var(--red)' }} onClick={() => setDevolver(f)}>↩️ Devolución</button>
            <button className="btn" style={{ flex: '1 1 30%', fontSize: 13 }}
              disabled={entregar.isPending}
              onClick={() => entregar.mutate(f)}>
              ✓ Entregada
            </button>
          </div>
        </div>
      ))}

      {recibo && <Recibo factura={recibo} onCerrar={() => setRecibo(null)} />}
      {devolver && <DevolucionModal factura={devolver} onCerrar={() => setDevolver(null)} />}
    </div>
  );
}
