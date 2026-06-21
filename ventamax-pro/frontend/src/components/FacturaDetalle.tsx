import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Factura } from '../api/tipos';
import { facturasApi } from '../api/servicios';
import { fmtMoneda } from '../api/formato';
import { useAuth } from '../auth/AuthContext';
import { Recibo } from './Recibo';
import { FacturaEditar } from './FacturaEditar';

const LABEL_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', CREDITO: 'Crédito',
};

function estadoInfo(f: { estado: string; tipoDoc?: string; devuelta?: string }) {
  if (f.tipoDoc === 'DEVOLUCION') return { label: 'Devolución', color: 'var(--red)' };
  if (f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL') return { label: 'Devolución', color: 'var(--red)' };
  if (f.devuelta === 'PARCIAL') return { label: 'Dev. Parcial', color: 'var(--orange)' };
  switch (f.estado) {
    case 'PENDIENTE': return { label: 'Pendiente', color: '#38bdf8' };
    case 'ENTREGADA': return { label: 'Entregado', color: 'var(--green)' };
    case 'PAGADA':    return { label: 'Pagado', color: 'var(--green)' };
    case 'CREDITO':   return { label: 'Fiado', color: 'var(--orange)' };
    case 'ANULADA':   return { label: 'Anulada', color: 'var(--muted)' };
    default:          return { label: f.estado, color: 'var(--muted)' };
  }
}

/**
 * Modal de detalle de una factura/devolución (réplica del sistema viejo):
 * cliente, ítems, totales, estado y acciones.
 */
export function FacturaDetalle({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const [recibo, setRecibo] = useState(false);
  const [editar, setEditar] = useState(false);

  const refrescar = () => qc.invalidateQueries();
  const entregar = useMutation({
    mutationFn: () => facturasApi.cambiarEstado(factura.id, 'ENTREGADA'),
    onSuccess: () => { refrescar(); onCerrar(); },
  });
  const anular = useMutation({
    mutationFn: () => facturasApi.cambiarEstado(factura.id, 'ANULADA'),
    onSuccess: () => { refrescar(); onCerrar(); },
  });
  const revivir = useMutation({
    mutationFn: () => facturasApi.revivir(factura.id),
    onSuccess: (r) => {
      refrescar();
      alert(r.solicitado ? 'Solicitud de revivir enviada. Un supervisor/admin la autoriza.' : 'Pedido revivido: vuelve a la cola de logística.');
      onCerrar();
    },
  });

  const esDev = factura.tipoDoc === 'DEVOLUCION';
  const esDevuelta = factura.estado === 'DEVUELTA' || factura.devuelta === 'TOTAL';
  const esParcial = factura.devuelta === 'PARCIAL';
  const puedeAprobar = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN' || usuario?.rol === 'SUPERVISOR' || usuario?.rol === 'ENTREGADOR';
  const anulada = factura.estado === 'ANULADA';
  const entregada = factura.estado === 'ENTREGADA' || factura.estado === 'PAGADA';
  const est = estadoInfo(factura);
  const inicial = (factura.cliente?.nombre?.trim().charAt(0) || '?').toUpperCase();
  const fecha = new Date(factura.creadoEn).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const montoDev = Math.abs(Number(factura.total));

  if (recibo) return <Recibo factura={factura} onCerrar={() => setRecibo(false)} />;
  if (editar) return <FacturaEditar factura={factura} onCerrar={onCerrar} />;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100,
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 12 }} onClick={e => e.stopPropagation()}>

        {/* Encabezado */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 10px' }} />
          <div style={{ fontSize: 22 }}>{esDev ? '↩️' : '🧾'}</div>
          <strong style={{ fontSize: 18 }}>FAC-{String(factura.consecutivo).padStart(4, '0')}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {fecha}{factura.metodoPago ? ` · ${LABEL_METODO[factura.metodoPago] ?? factura.metodoPago}` : ''}
          </div>
          <span style={{
            display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 800, color: est.color,
            background: `${est.color}1f`, borderRadius: 14, padding: '3px 12px',
          }}>{est.label}</span>
        </div>

        {/* Cliente */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <span style={{
            width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,200,255,.18)',
            color: 'var(--accent)', fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>{inicial}</span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 14 }}>{factura.cliente?.nombre ?? '—'}</strong>
            <div className="muted" style={{ fontSize: 11 }}>Asesor: {factura.vendedor?.nombre ?? '—'}</div>
          </div>
        </div>

        {/* Ítems */}
        <div className="card" style={{ padding: '8px 12px' }}>
          {factura.items.map((i, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13,
              padding: '6px 0', borderBottom: idx < factura.items.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📦 {i.producto?.nombre ?? 'Producto'} <span className="muted">×{Math.abs(i.cantidad)}</span>
              </span>
              <span className="mono" style={{ flexShrink: 0, color: esDev ? 'var(--red)' : undefined }}>{fmtMoneda(i.total)}</span>
            </div>
          ))}
        </div>

        {/* Documento de devolución */}
        {esDev && (
          <div style={{ background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.25)', borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)', marginBottom: 4 }}>↩️ Devolución</div>
            {factura.causal && <div className="muted" style={{ fontSize: 12 }}>Causal: {factura.causal}</div>}
            {(factura.obsDevolucion || factura.notas) && <div className="muted" style={{ fontSize: 12 }}>Obs: {factura.obsDevolucion ?? factura.notas}</div>}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginTop: 4 }}>Monto devuelto: {fmtMoneda(montoDev)}</div>
          </div>
        )}

        {/* Venta con devolución registrada (parcial o total) */}
        {!esDev && (esDevuelta || esParcial) && (
          <div style={{ background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.25)', borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: esDevuelta ? 'var(--red)' : 'var(--orange)', marginBottom: 4 }}>
              ↩️ {esDevuelta ? 'Devolución Total' : 'Devolución Parcial'}
            </div>
            {factura.causal && <div className="muted" style={{ fontSize: 12 }}>Causal: {factura.causal}</div>}
            {factura.obsDevolucion && <div className="muted" style={{ fontSize: 12 }}>Obs: {factura.obsDevolucion}</div>}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginTop: 4 }}>Monto devuelto: {fmtMoneda(factura.montoDevuelto ?? 0)}</div>
            {factura.revivirSolicitado && <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4 }}>⏳ Revivir solicitado, pendiente de autorización.</div>}
          </div>
        )}

        {/* Totales */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 12px' }}>
          <div className="muted" style={{ fontSize: 11 }}>
            <div>Subtotal: {fmtMoneda(factura.subtotal)}</div>
            {Number(factura.descuento) > 0 && <div>Descuento: −{fmtMoneda(factura.descuento)}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>Total</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: esDev ? 'var(--red)' : 'var(--accent)' }}>{fmtMoneda(factura.total)}</div>
          </div>
        </div>

        {/* Entrega confirmada (solo ventas activas) */}
        {!esDev && !anulada && !esDevuelta && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: entregada ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={entregada} disabled={entregada || entregar.isPending}
              onChange={() => { if (!entregada && confirm('¿Confirmar la entrega de esta factura?')) entregar.mutate(); }} />
            {entregada ? 'Entrega confirmada' : 'Marcar entrega confirmada'}
          </label>
        )}

        {/* Acciones */}
        {esDevuelta ? (
          <button className="btn" style={{ background: 'var(--orange)', color: '#000' }}
            disabled={revivir.isPending || (!!factura.revivirSolicitado && !puedeAprobar)}
            onClick={() => {
              const msg = puedeAprobar
                ? `¿Revivir el pedido #${factura.consecutivo}? Vuelve a la cola de logística.`
                : `¿Solicitar revivir el pedido #${factura.consecutivo}?`;
              if (confirm(msg)) revivir.mutate();
            }}>
            🔁 {puedeAprobar ? 'Revivir pedido' : (factura.revivirSolicitado ? 'Solicitud enviada' : 'Solicitar revivir')}
          </button>
        ) : esDev ? null : (
          <div style={{ display: 'flex', gap: 8 }}>
            {factura.estado === 'PENDIENTE' && (
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditar(true)}>
                ✏️ Editar pedido
              </button>
            )}
            {!anulada && (
              <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--red)' }} disabled={anular.isPending}
                onClick={() => confirm(`¿Eliminar (anular) la factura #${factura.consecutivo}? El stock se repondrá.`) && anular.mutate()}>
                🗑 Eliminar
              </button>
            )}
          </div>
        )}

        <button className="btn" style={{ background: 'var(--green)' }} onClick={() => setRecibo(true)}>📤 Enviar / Imprimir</button>
        <button className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>

        {(entregar.isError || anular.isError || revivir.isError) && (
          <div className="error-box">{((entregar.error || anular.error || revivir.error) as Error)?.message}</div>
        )}
      </div>
    </div>
  );
}
