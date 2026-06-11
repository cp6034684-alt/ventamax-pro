import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventarioApi, productosApi } from '../../api/servicios';
import { fmtFecha } from '../../api/formato';

export function InventarioPage() {
  const [vista, setVista] = useState<'bajo' | 'movimientos' | 'registrar'>('bajo');
  const qc = useQueryClient();

  const { data: bajoStock } = useQuery({ queryKey: ['bajo-stock'], queryFn: inventarioApi.bajoStock });
  const { data: movimientos } = useQuery({
    queryKey: ['movimientos'], queryFn: () => inventarioApi.movimientos(),
    enabled: vista === 'movimientos',
  });
  const { data: productos } = useQuery({ queryKey: ['productos', ''], queryFn: () => productosApi.listar() });

  const registrar = useMutation({
    mutationFn: inventarioApi.registrar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bajo-stock'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      alert('Movimiento registrado');
    },
  });

  const tabs = [['bajo', 'Bajo stock'], ['movimientos', 'Movimientos'], ['registrar', 'Registrar']] as const;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {tabs.map(([id, etiqueta]) => (
          <button key={id} className={`btn ${vista === id ? '' : 'btn-ghost'}`}
            style={{ flex: 1, fontSize: 12, padding: '8px 4px' }} onClick={() => setVista(id)}>
            {etiqueta}
          </button>
        ))}
      </div>

      {vista === 'bajo' && (
        <>
          {!bajoStock?.length && <p className="muted">Ningún producto está bajo el stock mínimo. 👌</p>}
          {bajoStock?.map((p: any) => (
            <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px' }}>
              <div>
                <strong style={{ fontSize: 14 }}>{p.nombre}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{p.categoria ?? 'Sin categoría'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--red)', fontWeight: 700 }}>{p.stock} uds</div>
                <div className="muted" style={{ fontSize: 11 }}>mínimo: {p.stockMinimo}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {vista === 'movimientos' && movimientos?.datos.map(m => (
        <div key={m.id} className="card" style={{ padding: '10px 14px', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{m.producto?.nombre}</strong>
            <span className="mono" style={{ color: m.cantidad >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {m.cantidad >= 0 ? '+' : ''}{m.cantidad}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {m.tipo} · {fmtFecha(m.creadoEn)}{m.motivo ? ` · ${m.motivo}` : ''}
          </div>
        </div>
      ))}

      {vista === 'registrar' && (
        <form className="card" style={{ display: 'grid', gap: 10 }}
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            registrar.mutate({
              productoId: String(fd.get('productoId')),
              tipo: fd.get('tipo') as any,
              cantidad: Number(fd.get('cantidad')),
              motivo: String(fd.get('motivo') || '') || undefined,
            });
            e.currentTarget.reset();
          }}>
          <select name="productoId" required>
            <option value="">— Producto —</option>
            {productos?.datos.map(p => <option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock})</option>)}
          </select>
          <select name="tipo" required>
            <option value="ENTRADA">Entrada (llegó mercancía)</option>
            <option value="AJUSTE">Ajuste (conteo físico — el stock queda en este valor)</option>
            <option value="DEVOLUCION">Devolución</option>
          </select>
          <input name="cantidad" type="number" placeholder="Cantidad" required min={0} />
          <input name="motivo" placeholder="Motivo (opcional)" />
          <button className="btn" disabled={registrar.isPending}>
            {registrar.isPending ? 'Guardando…' : 'Registrar movimiento'}
          </button>
          {registrar.isError && <div className="error-box">{(registrar.error as Error).message}</div>}
        </form>
      )}
    </div>
  );
}
