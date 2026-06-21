import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { facturasApi, productosApi } from '../api/servicios';
import { fmtMoneda } from '../api/formato';
import type { Factura, Producto } from '../api/tipos';

interface Linea { productoId: string; nombre: string; precioUnit: number; cantidad: number; }

/**
 * Editar un pedido pendiente: ítems, descuento, método de pago y notas.
 * El servidor recalcula los precios según la lista de la factura.
 */
export function FacturaEditar({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [lineas, setLineas] = useState<Linea[]>(
    factura.items.map(i => ({
      productoId: i.productoId, nombre: i.producto?.nombre ?? 'Producto',
      precioUnit: Number(i.precioUnit), cantidad: i.cantidad,
    })),
  );
  const [descuento, setDescuento] = useState(Number(factura.descuento));
  const [metodoPago, setMetodoPago] = useState(factura.metodoPago ?? 'EFECTIVO');
  const [notas, setNotas] = useState(factura.notas ?? '');
  const [busca, setBusca] = useState('');

  const { data: productos } = useQuery({
    queryKey: ['edit-prod', busca],
    queryFn: () => productosApi.listar(busca),
    enabled: busca.length >= 2,
  });

  const guardar = useMutation({
    mutationFn: () => facturasApi.editar(factura.id, {
      items: lineas.filter(l => l.cantidad > 0).map(l => ({ productoId: l.productoId, cantidad: l.cantidad })),
      descuento, metodoPago, notas: notas || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries(); onCerrar(); },
  });

  const setCant = (id: string, v: number) =>
    setLineas(ls => ls.map(l => l.productoId === id ? { ...l, cantidad: Math.max(0, v) } : l));
  const quitar = (id: string) => setLineas(ls => ls.filter(l => l.productoId !== id));
  const agregar = (p: Producto) => {
    setBusca('');
    setLineas(ls => ls.some(l => l.productoId === p.id)
      ? ls.map(l => l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)
      : [...ls, { productoId: p.id, nombre: p.nombre, precioUnit: Number(p.precioTat ?? p.precioVenta), cantidad: 1 }]);
  };

  const subtotal = lineas.reduce((s, l) => s + l.precioUnit * l.cantidad, 0);
  const total = Math.max(0, subtotal - descuento);
  const hayItems = lineas.some(l => l.cantidad > 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 120,
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 440, display: 'grid', gap: 10, maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <strong>✏️ Editar pedido · FAC-{String(factura.consecutivo).padStart(4, '0')}</strong>

        {/* Ítems */}
        <div className="card" style={{ display: 'grid', gap: 8, padding: '8px 12px' }}>
          {!lineas.length && <span className="muted" style={{ fontSize: 12 }}>Agrega al menos un producto.</span>}
          {lineas.map(l => (
            <div key={l.productoId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.nombre} <span className="muted">{fmtMoneda(l.precioUnit)}</span>
              </span>
              <input type="number" min={1} value={l.cantidad}
                onChange={e => setCant(l.productoId, Number(e.target.value))}
                style={{ width: 58, padding: '4px 6px' }} />
              <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--red)' }} onClick={() => quitar(l.productoId)}>✕</button>
            </div>
          ))}
        </div>

        {/* Agregar producto */}
        <div>
          <input placeholder="Agregar producto…" value={busca} onChange={e => setBusca(e.target.value)} />
          {busca.length >= 2 && productos?.datos.slice(0, 6).map(p => (
            <div key={p.id} className="card" style={{ padding: '8px 12px', marginTop: 6, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => agregar(p)}>
              <span style={{ fontSize: 13 }}>{p.nombre}</span>
              <span className="mono accent" style={{ fontSize: 12 }}>{fmtMoneda(p.precioTat ?? p.precioVenta)}</span>
            </div>
          ))}
        </div>

        {/* Descuento / método / notas */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" min={0} value={descuento} onChange={e => setDescuento(Math.max(0, Number(e.target.value)))}
            placeholder="Descuento" style={{ flex: 1 }} />
          <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ flex: 1 }}>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="CREDITO">Crédito (fiado)</option>
          </select>
        </div>
        <input placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />

        {/* Totales (estimado; el servidor recalcula con la lista de la venta) */}
        <div className="card" style={{ display: 'grid', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted">
            <span>Subtotal</span><span className="mono">{fmtMoneda(subtotal)}</span>
          </div>
          {descuento > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted">
              <span>Descuento</span><span className="mono">−{fmtMoneda(descuento)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
            <span>Total</span><span className="mono green">{fmtMoneda(total)}</span>
          </div>
        </div>

        <button className="btn" disabled={guardar.isPending || !hayItems} onClick={() => guardar.mutate()}>
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {guardar.isError && <div className="error-box">{(guardar.error as Error).message}</div>}
        <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}
