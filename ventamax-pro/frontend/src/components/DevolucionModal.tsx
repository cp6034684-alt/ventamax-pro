import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { facturasApi } from '../api/servicios';
import { fmtMoneda } from '../api/formato';
import type { Factura } from '../api/tipos';

const CAUSALES = [
  'Producto en mal estado',
  'Error en el pedido',
  'Producto no solicitado',
  'Faltante en caja',
  'Precio incorrecto',
  'Cliente rechazó el pedido',
  'Otro',
];

/**
 * Modal para registrar la devolución (total o parcial) de una venta en la
 * entrega. Repone stock y recalcula el neto (vía el endpoint /devolver).
 */
export function DevolucionModal({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<'TOTAL' | 'PARCIAL'>('TOTAL');
  const [cants, setCants] = useState<Record<string, number>>({});
  const [causal, setCausal] = useState('');
  const [obs, setObs] = useState('');

  const registrar = useMutation({
    mutationFn: () => {
      const items = tipo === 'PARCIAL'
        ? factura.items
            .filter(i => (cants[i.productoId] ?? 0) > 0)
            .map(i => ({ productoId: i.productoId, cantidad: Math.min(cants[i.productoId], i.cantidad) }))
        : undefined;
      return facturasApi.devolver(factura.id, { tipo, causal, obs: obs || undefined, items });
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar(); },
  });

  const setCant = (id: string, max: number, v: number) =>
    setCants(c => ({ ...c, [id]: Math.max(0, Math.min(v, max)) }));

  const monto = tipo === 'TOTAL'
    ? Math.abs(Number(factura.total))
    : factura.items.reduce((s, i) => s + Math.min(cants[i.productoId] ?? 0, i.cantidad) * Number(i.precioUnit), 0);
  const hayItems = tipo === 'TOTAL' || factura.items.some(i => (cants[i.productoId] ?? 0) > 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 120,
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 10, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <strong style={{ color: 'var(--red)' }}>↩️ Devolución · FAC-{String(factura.consecutivo).padStart(4, '0')}</strong>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['TOTAL', 'PARCIAL'] as const).map(t => (
            <button key={t} className="btn" style={{
              flex: 1,
              background: tipo === t ? 'linear-gradient(135deg, var(--red), #cc2244)' : 'var(--bg3)',
              color: tipo === t ? '#fff' : 'var(--muted)',
            }} onClick={() => setTipo(t)}>
              {t === 'TOTAL' ? 'Total' : 'Parcial'}
            </button>
          ))}
        </div>

        <div className="card" style={{ display: 'grid', gap: 8, padding: '8px 12px' }}>
          {factura.items.map(i => {
            const max = i.cantidad;
            const val = tipo === 'TOTAL' ? max : (cants[i.productoId] ?? 0);
            return (
              <div key={i.productoId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.producto?.nombre ?? 'Producto'} <span className="muted">(de {max})</span>
                </span>
                <input type="number" min={0} max={max} value={val} disabled={tipo === 'TOTAL'}
                  onChange={e => setCant(i.productoId, max, Number(e.target.value))}
                  style={{ width: 64, padding: '4px 6px' }} />
              </div>
            );
          })}
        </div>

        <select value={causal} onChange={e => setCausal(e.target.value)}>
          <option value="">Causal de devolución…</option>
          {CAUSALES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Observación (opcional)" value={obs} onChange={e => setObs(e.target.value)} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>Monto a devolver</span>
          <strong className="mono" style={{ color: 'var(--red)' }}>−{fmtMoneda(monto)}</strong>
        </div>

        <button className="btn" style={{ background: 'linear-gradient(135deg, var(--red), #cc2244)' }}
          disabled={registrar.isPending || !causal || !hayItems}
          onClick={() => registrar.mutate()}>
          {registrar.isPending ? 'Registrando…' : 'Registrar devolución'}
        </button>
        {registrar.isError && <div className="error-box">{(registrar.error as Error).message}</div>}
        <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}
