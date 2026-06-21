import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productosApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';
import { fmtMoneda } from '../../api/formato';
import type { Producto } from '../../api/tipos';

export function ProductosPage() {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Producto | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN';
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['productos', busqueda],
    queryFn: () => productosApi.listar(busqueda),
  });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['productos'] }); setMostrarForm(false); setEditando(null); };
  const crear = useMutation({ mutationFn: productosApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, ...d }: any) => productosApi.actualizar(id, d), onSuccess: invalidar,
  });
  const eliminar = useMutation({ mutationFn: productosApi.eliminar, onSuccess: invalidar });

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const datos: any = {
      nombre: String(fd.get('nombre')),
      codigo: String(fd.get('codigo') || '') || undefined,
      categoria: String(fd.get('categoria') || '') || undefined,
      marca: String(fd.get('marca') || '') || undefined,
      linea: String(fd.get('linea') || '') || undefined,
      segmento: String(fd.get('segmento') || '') || undefined,
      subsegmento: String(fd.get('subsegmento') || '') || undefined,
      unidad: String(fd.get('unidad') || '') || undefined,
      iva: Number(fd.get('iva') || 0) || undefined,
      precioCompra: Number(fd.get('precioCompra') || 0),
      precioGeneral: Number(fd.get('precioGeneral') || 0) || undefined,
      precioMayorista: Number(fd.get('precioMayorista') || 0) || undefined,
      precioTat: Number(fd.get('precioTat') || 0) || undefined,
      precioDroguerias: Number(fd.get('precioDroguerias') || 0) || undefined,
      precioTatViajeros: Number(fd.get('precioTatViajeros') || 0) || undefined,
      precioEntreSede: Number(fd.get('precioEntreSede') || 0) || undefined,
      // Precio por defecto: el que pongan, o el de la lista TAT
      precioVenta: Number(fd.get('precioVenta') || 0) || Number(fd.get('precioTat') || 0) || 0,
      stockMinimo: Number(fd.get('stockMinimo') || 0),
    };
    if (!editando) datos.stock = Number(fd.get('stock') || 0);
    editando ? actualizar.mutate({ id: editando.id, ...datos }) : crear.mutate(datos);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Buscar producto o código…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {esAdmin && <button className="btn" onClick={() => { setEditando(null); setMostrarForm(v => !v); }}>＋</button>}
      </div>

      {esAdmin && (mostrarForm || editando) && (
        <form key={editando?.id ?? 'nuevo'} className="card" style={{ display: 'grid', gap: 10 }} onSubmit={guardar}>
          <strong style={{ fontSize: 13 }}>{editando ? `Editar: ${editando.nombre}` : 'Nuevo producto'}</strong>
          <input name="nombre" placeholder="Nombre *" defaultValue={editando?.nombre} required />
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="codigo" placeholder="Código / SKU" defaultValue={editando?.codigo} />
            <input name="marca" placeholder="Marca" defaultValue={editando?.marca ?? ''} />
            <input name="categoria" placeholder="Categoría" defaultValue={editando?.categoria} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="linea" placeholder="Línea" defaultValue={editando?.linea ?? ''} />
            <input name="segmento" placeholder="Segmento" defaultValue={editando?.segmento ?? ''} />
            <input name="subsegmento" placeholder="Subsegmento" defaultValue={editando?.subsegmento ?? ''} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="unidad" placeholder="Unidad" defaultValue={editando?.unidad} />
            <input name="iva" type="number" placeholder="% IVA" defaultValue={editando?.iva} min={0} max={100} style={{ maxWidth: 110 }} />
          </div>
          <input name="precioCompra" type="number" placeholder="Costo (precio compra)" defaultValue={editando?.precioCompra} min={0} />
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Listas de precio</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input name="precioGeneral" type="number" placeholder="General" defaultValue={editando?.precioGeneral} min={0} />
            <input name="precioMayorista" type="number" placeholder="Mayorista" defaultValue={editando?.precioMayorista} min={0} />
            <input name="precioTat" type="number" placeholder="TAT" defaultValue={editando?.precioTat} min={0} />
            <input name="precioDroguerias" type="number" placeholder="Droguerías" defaultValue={editando?.precioDroguerias} min={0} />
            <input name="precioTatViajeros" type="number" placeholder="TAT Viajeros" defaultValue={editando?.precioTatViajeros} min={0} />
            <input name="precioEntreSede" type="number" placeholder="Entre Sede" defaultValue={editando?.precioEntreSede} min={0} />
          </div>
          <input name="precioVenta" type="number" placeholder="Precio por defecto (si lo dejas vacío usa TAT)" defaultValue={editando?.precioVenta} min={0} />
          <div style={{ display: 'flex', gap: 8 }}>
            {!editando && <input name="stock" type="number" placeholder="Stock inicial" min={0} />}
            <input name="stockMinimo" type="number" placeholder="Stock mínimo" defaultValue={editando?.stockMinimo} min={0} />
          </div>
          {editando && <p className="muted" style={{ fontSize: 11 }}>El stock se modifica desde Inventario (entradas/ajustes), no aquí — así queda trazado cada movimiento.</p>}
          <button className="btn">{editando ? 'Actualizar' : 'Guardar producto'}</button>
        </form>
      )}

      {isLoading && <p className="muted">Cargando…</p>}
      {data?.datos.map(p => (
        <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>{p.nombre}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{p.categoria ?? 'Sin categoría'}{p.codigo ? ` · ${p.codigo}` : ''}{p.unidad ? ` · ${p.unidad}` : ''}</div>
            <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              Gen {fmtMoneda(p.precioGeneral)} · May {fmtMoneda(p.precioMayorista)} · TAT {fmtMoneda(p.precioTat)} · Drog {fmtMoneda(p.precioDroguerias)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono accent" style={{ fontSize: 14 }}>{fmtMoneda(p.precioVenta)}</div>
            <div style={{ fontSize: 12, color: p.stock <= p.stockMinimo ? 'var(--red)' : 'var(--muted)' }}>
              Stock: {p.stock}
            </div>
          </div>
          {esAdmin && (
            <div style={{ display: 'grid', gap: 4 }}>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditando(p)}>✏️</button>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--red)' }}
                onClick={() => confirm(`¿Desactivar ${p.nombre}?`) && eliminar.mutate(p.id)}>🗑</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
