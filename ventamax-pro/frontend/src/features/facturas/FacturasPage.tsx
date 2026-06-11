import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { facturasApi } from '../../api/servicios';
import { fmtMoneda, fmtFecha, COLOR_ESTADO } from '../../api/formato';
import { Recibo } from '../../components/Recibo';
import { useAuth } from '../../auth/AuthContext';
import type { Factura } from '../../api/tipos';

export function FacturasPage() {
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [recibo, setRecibo] = useState<Factura | null>(null);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN';
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['facturas', estado, pagina],
    queryFn: () => facturasApi.listar({ estado, pagina: String(pagina), porPagina: '25' }),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['facturas'] });
  const anular = useMutation({ mutationFn: (id: string) => facturasApi.cambiarEstado(id, 'ANULADA'), onSuccess: invalidar });
  const abonar = useMutation({
    mutationFn: ({ id, monto }: { id: string; monto: number }) => facturasApi.abonar(id, monto),
    onSuccess: invalidar,
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); }}>
        <option value="">Todos los estados</option>
        {['PENDIENTE', 'ENTREGADA', 'PAGADA', 'CREDITO', 'ANULADA'].map(s => <option key={s}>{s}</option>)}
      </select>

      {data?.datos.map(f => {
        const saldo = Number(f.total) - Number(f.pagado);
        return (
          <div key={f.id} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>#{f.consecutivo} · {f.cliente?.nombre}</strong>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, color: COLOR_ESTADO[f.estado], border: `1px solid ${COLOR_ESTADO[f.estado]}` }}>
                {f.estado}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 11, margin: '4px 0' }}>
              {fmtFecha(f.creadoEn)} · {f.vendedor?.nombre} · {f.items.length} producto(s)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span className="mono green">{fmtMoneda(f.total)}</span>
              {saldo > 0 && f.estado !== 'ANULADA' && (
                <span className="mono" style={{ color: 'var(--orange)' }}>Debe {fmtMoneda(saldo)}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '7px 4px' }} onClick={() => setRecibo(f)}>
                🧾 Recibo
              </button>
              {saldo > 0 && f.estado === 'CREDITO' && (
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '7px 4px', color: 'var(--green)' }}
                  onClick={() => {
                    const m = prompt(`Saldo: ${fmtMoneda(saldo)}. ¿Cuánto abona?`);
                    if (m && Number(m) > 0) abonar.mutate({ id: f.id, monto: Number(m) });
                  }}>💵 Abonar</button>
              )}
              {esAdmin && f.estado !== 'ANULADA' && (
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '7px 4px', color: 'var(--red)' }}
                  onClick={() => confirm(`¿Anular la factura #${f.consecutivo}? El stock se repondrá.`) && anular.mutate(f.id)}>
                  ✕ Anular
                </button>
              )}
            </div>
          </div>
        );
      })}

      {data && data.paginacion.totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>←</button>
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
            {pagina} / {data.paginacion.totalPaginas} ({data.paginacion.total})
          </span>
          <button className="btn btn-ghost" disabled={pagina >= data.paginacion.totalPaginas} onClick={() => setPagina(p => p + 1)}>→</button>
        </div>
      )}

      {recibo && <Recibo factura={recibo} onCerrar={() => setRecibo(null)} />}
    </div>
  );
}
