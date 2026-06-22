import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productosApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';

// Vista de SOLO LECTURA para el vendedor: muestra la existencia disponible
// en la bodega de SU región (el backend ya devuelve el stock por bodega).
export function MiInventarioPage() {
  const [busqueda, setBusqueda] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['mi-inventario', busqueda],
    queryFn: () => productosApi.listar(busqueda),
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div>
        <strong style={{ fontSize: 16 }}>Inventario de mi bodega</strong>
        <div className="muted" style={{ fontSize: 12 }}>Existencia disponible en la bodega de tu región.</div>
      </div>
      <input placeholder="Buscar producto o código…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />

      {isLoading && <p className="muted">Cargando…</p>}
      {!isLoading && !data?.datos.length && (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>
          No hay productos con este filtro.
        </div>
      )}
      {data?.datos.map(p => {
        const sinStock = p.stock <= 0;
        const bajo = !sinStock && p.stock <= (p.stockMinimo ?? 0);
        return (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{p.nombre}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {p.categoria ?? 'Sin categoría'}{p.codigo ? ` · ${p.codigo}` : ''}{p.unidad ? ` · ${p.unidad}` : ''}
              </div>
              <div className="mono accent" style={{ fontSize: 12 }}>{fmtMoneda(p.precioVenta)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: sinStock ? 'var(--red)' : bajo ? 'var(--orange)' : 'var(--green)' }}>
                {p.stock}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>{sinStock ? 'agotado' : 'unidades'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
