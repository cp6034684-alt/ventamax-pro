import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi, facturasApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import type { Cliente, Factura } from '../../api/tipos';

const CAUSALES = [
  'Producto en mal estado',
  'Error en el pedido',
  'Producto no solicitado',
  'Faltante en caja',
  'Precio incorrecto',
  'Cliente rechazó el pedido',
  'Otro',
];

export function DevolucionesPage() {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscaCli, setBuscaCli] = useState('');
  const [factura, setFactura] = useState<Factura | null>(null);
  const [tipo, setTipo] = useState<'TOTAL' | 'PARCIAL'>('TOTAL');
  const [cants, setCants] = useState<Record<string, number>>({});
  const [causal, setCausal] = useState('');
  const [obs, setObs] = useState('');

  const { data: clientes } = useQuery({
    queryKey: ['dev-clientes', buscaCli],
    queryFn: () => clientesApi.listar(buscaCli, 1, 15, {}),
    enabled: buscaCli.length >= 2 && !cliente,
  });
  const { data: facturas } = useQuery({
    queryKey: ['dev-facturas', cliente?.id],
    queryFn: () => facturasApi.listar({ clienteId: cliente!.id, porPagina: '25' }),
    enabled: !!cliente && !factura,
  });

  const reset = () => {
    setCliente(null); setFactura(null); setTipo('TOTAL'); setCants({}); setCausal(''); setObs(''); setBuscaCli('');
  };

  const registrar = useMutation({
    mutationFn: () => {
      const items = tipo === 'PARCIAL'
        ? factura!.items
            .filter(i => (cants[i.productoId] ?? 0) > 0)
            .map(i => ({ productoId: i.productoId, cantidad: Math.min(cants[i.productoId], i.cantidad) }))
        : undefined;
      return facturasApi.devolver(factura!.id, { tipo, causal, obs: obs || undefined, items });
    },
    onSuccess: () => { alert('✅ Devolución registrada'); qc.invalidateQueries(); reset(); },
  });

  const elegibles = (facturas?.datos ?? []).filter(f =>
    f.tipoDoc !== 'DEVOLUCION' && f.estado !== 'ANULADA' && f.devuelta !== 'TOTAL');

  const setCant = (id: string, max: number, v: number) =>
    setCants(c => ({ ...c, [id]: Math.max(0, Math.min(v, max)) }));

  const monto = !factura ? 0
    : tipo === 'TOTAL'
      ? Math.abs(Number(factura.total))
      : factura.items.reduce((s, i) => s + Math.min(cants[i.productoId] ?? 0, i.cantidad) * Number(i.precioUnit), 0);
  const neto = factura ? Math.max(0, Number(factura.total) - monto) : 0;
  const hayItems = tipo === 'TOTAL' || (factura?.items.some(i => (cants[i.productoId] ?? 0) > 0) ?? false);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div className="card" style={{ background: 'rgba(255,64,96,.06)', borderColor: 'rgba(255,64,96,.25)' }}>
        <strong style={{ color: 'var(--red)' }}>↩️ Registrar devolución</strong>
        <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
          Elige la venta del cliente, marca Total o Parcial, el motivo, y el stock vuelve al inventario.
        </p>
      </div>

      {cliente ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{cliente.nombre}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{cliente.barrio ?? ''} {cliente.codigo ? `· ${cliente.codigo}` : ''}</div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={reset}>Cambiar</button>
        </div>
      ) : (
        <div>
          <input placeholder="Buscar cliente…" value={buscaCli} onChange={e => setBuscaCli(e.target.value)} />
          {clientes?.datos.map(c => (
            <div key={c.id} className="card" style={{ padding: '8px 12px', marginTop: 6, cursor: 'pointer' }}
              onClick={() => { setCliente(c); setBuscaCli(''); }}>
              <strong style={{ fontSize: 13 }}>{c.nombre}</strong>
              <span className="muted" style={{ fontSize: 11 }}> · {c.barrio ?? ''}</span>
            </div>
          ))}
        </div>
      )}

      {cliente && !factura && (
        <div>
          <strong style={{ fontSize: 13 }}>Elige la venta a devolver</strong>
          {!elegibles.length && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Este cliente no tiene ventas para devolver.</p>}
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {elegibles.map(f => (
              <div key={f.id} className="card" style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                onClick={() => { setFactura(f); setCants({}); }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>FAC-{String(f.consecutivo).padStart(4, '0')}</strong>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {new Date(f.creadoEn).toLocaleDateString('es-CO')} · {f.items.length} ítem(s){f.devuelta === 'PARCIAL' ? ' · ya tiene dev. parcial' : ''}
                  </div>
                </div>
                <span className="mono green" style={{ fontSize: 13, flexShrink: 0 }}>{fmtMoneda(f.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {factura && (
        <>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <strong>FAC-{String(factura.consecutivo).padStart(4, '0')}</strong>
              <div className="muted" style={{ fontSize: 12 }}>Total venta: {fmtMoneda(factura.total)}</div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setFactura(null); setCants({}); }}>Cambiar</button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['TOTAL', 'PARCIAL'] as const).map(t => (
              <button key={t} className="btn" style={{
                flex: 1,
                background: tipo === t ? 'linear-gradient(135deg, var(--red), #cc2244)' : 'var(--bg3)',
                color: tipo === t ? '#fff' : 'var(--muted)',
              }} onClick={() => setTipo(t)}>
                {t === 'TOTAL' ? 'Devolución total' : 'Devolución parcial'}
              </button>
            ))}
          </div>

          <div className="card" style={{ display: 'grid', gap: 8 }}>
            {factura.items.map(i => {
              const max = i.cantidad;
              const val = tipo === 'TOTAL' ? max : (cants[i.productoId] ?? 0);
              return (
                <div key={i.productoId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.producto?.nombre ?? 'Producto'} <span className="muted">(vendido: {max})</span>
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

          <div className="card" style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>Monto a devolver</span>
              <strong className="mono" style={{ color: 'var(--red)' }}>−{fmtMoneda(monto)}</strong>
            </div>
            {tipo === 'PARCIAL' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 12 }}>Neto de la venta</span>
                <strong className="mono green">{fmtMoneda(neto)}</strong>
              </div>
            )}
          </div>

          <button className="btn" style={{ background: 'linear-gradient(135deg, var(--red), #cc2244)' }}
            disabled={registrar.isPending || !causal || !hayItems}
            onClick={() => {
              const msg = tipo === 'TOTAL'
                ? `¿Devolver TODA la venta FAC-${String(factura.consecutivo).padStart(4, '0')}?`
                : `¿Registrar devolución parcial de FAC-${String(factura.consecutivo).padStart(4, '0')}?`;
              if (confirm(msg)) registrar.mutate();
            }}>
            {registrar.isPending ? 'Registrando…' : 'Registrar devolución'}
          </button>
          {registrar.isError && <div className="error-box">{(registrar.error as Error).message}</div>}
        </>
      )}
    </div>
  );
}
