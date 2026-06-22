import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productosApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';
import { fmtMoneda } from '../../api/formato';
import type { Producto } from '../../api/tipos';

type PreciosState = {
  precioCompra: number; iva: number;
  precioGeneral: number; precioMayorista: number; precioTat: number;
  precioDroguerias: number; precioTatViajeros: number; precioEntreSede: number;
  precioVenta: number;
};

// Listas de precio del sistema. El precio guardado YA incluye IVA (igual que la app base).
const LISTAS: [keyof PreciosState, string][] = [
  ['precioGeneral', 'General'],
  ['precioMayorista', 'Mayorista'],
  ['precioTat', 'TAT'],
  ['precioDroguerias', 'Droguerías'],
  ['precioTatViajeros', 'TAT Viajeros'],
  ['precioEntreSede', 'Entre Sede'],
];

function num(v: any): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ── Formulario de creación/edición con desglose de IVA y rentabilidad ──
function ProductoForm({ editando, onGuardar, guardando }: {
  editando: Producto | null;
  onGuardar: (datos: any) => void;
  guardando: boolean;
}) {
  // El precio de lista YA incluye IVA. El costo NO incluye IVA.
  const [p, setP] = useState<PreciosState>(() => ({
    precioCompra: num(editando?.precioCompra),
    iva: editando?.iva != null ? num(editando.iva) : 19,
    precioGeneral: num(editando?.precioGeneral),
    precioMayorista: num(editando?.precioMayorista),
    precioTat: num(editando?.precioTat),
    precioDroguerias: num(editando?.precioDroguerias),
    precioTatViajeros: num(editando?.precioTatViajeros),
    precioEntreSede: num(editando?.precioEntreSede),
    precioVenta: num(editando?.precioVenta),
  }));
  const set = (k: keyof PreciosState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP(s => ({ ...s, [k]: num(e.target.value) }));

  // Cálculos (precio con IVA incluido)
  const iva = p.iva || 0;
  const costoConIva = p.precioCompra * (1 + iva / 100);
  const desglose = (precioConIva: number) => {
    const base = iva > 0 ? precioConIva / (1 + iva / 100) : precioConIva; // precio sin IVA
    const valorIva = precioConIva - base;
    const rent = precioConIva > 0 ? ((precioConIva - costoConIva) / precioConIva) * 100 : 0;
    return { base, valorIva, rent };
  };

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
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
      iva: p.iva || undefined,
      precioCompra: p.precioCompra,
      precioGeneral: p.precioGeneral || undefined,
      precioMayorista: p.precioMayorista || undefined,
      precioTat: p.precioTat || undefined,
      precioDroguerias: p.precioDroguerias || undefined,
      precioTatViajeros: p.precioTatViajeros || undefined,
      precioEntreSede: p.precioEntreSede || undefined,
      precioVenta: p.precioVenta || p.precioTat || 0,
      stockMinimo: num(fd.get('stockMinimo')),
    };
    if (!editando) datos.stock = num(fd.get('stock'));
    onGuardar(datos);
  };

  const moneda0 = (n: number) => fmtMoneda(Math.round(n));

  return (
    <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={enviar}>
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
      <input name="unidad" placeholder="Unidad" defaultValue={editando?.unidad} />

      {/* Costo + IVA */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ flex: 1, fontSize: 11 }} className="muted">
          Costo (sin IVA)
          <input type="number" value={p.precioCompra || ''} onChange={set('precioCompra')} min={0} placeholder="Costo" />
        </label>
        <label style={{ width: 110, fontSize: 11 }} className="muted">
          % IVA
          <input type="number" value={p.iva} onChange={set('iva')} min={0} max={100} placeholder="19" />
        </label>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Costo con IVA: <b style={{ color: 'var(--text)' }}>{moneda0(costoConIva)}</b>
        <span style={{ marginLeft: 6, opacity: .8 }}>(los precios de lista ya incluyen IVA)</span>
      </div>

      {/* Listas de precio (incluyen IVA) */}
      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Listas de precio (precio al público, IVA incluido)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {LISTAS.map(([k, etq]) => (
          <label key={k} style={{ fontSize: 11 }} className="muted">
            {etq}
            <input type="number" value={(p[k] as number) || ''} onChange={set(k)} min={0} placeholder={etq} />
          </label>
        ))}
      </div>

      {/* Desglose por lista: IVA y rentabilidad */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, overflowX: 'auto' }}>
        <div className="muted" style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>DESGLOSE (IVA {iva}% incluido)</div>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 360 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'right' }}>
              <th style={{ textAlign: 'left', fontWeight: 600 }}>Lista</th>
              <th style={{ fontWeight: 600 }}>Público c/IVA</th>
              <th style={{ fontWeight: 600 }}>Base sin IVA</th>
              <th style={{ fontWeight: 600 }}>Valor IVA</th>
              <th style={{ fontWeight: 600 }}>Rentab.</th>
            </tr>
          </thead>
          <tbody>
            {LISTAS.map(([k, etq]) => {
              const precio = (p[k] as number) || 0;
              if (!precio) return null;
              const d = desglose(precio);
              const malo = d.rent < 0;
              return (
                <tr key={k} style={{ textAlign: 'right' }}>
                  <td style={{ textAlign: 'left' }}>{etq}</td>
                  <td className="mono">{moneda0(precio)}</td>
                  <td className="mono" style={{ opacity: .8 }}>{moneda0(d.base)}</td>
                  <td className="mono" style={{ opacity: .8 }}>{moneda0(d.valorIva)}</td>
                  <td className="mono" style={{ fontWeight: 700, color: malo ? 'var(--red)' : 'var(--green)' }}>
                    {d.rent.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label style={{ fontSize: 11 }} className="muted">
        Precio por defecto (si lo dejas vacío usa TAT)
        <input type="number" value={p.precioVenta || ''} onChange={set('precioVenta')} min={0} />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        {!editando && <input name="stock" type="number" placeholder="Stock inicial" min={0} />}
        <input name="stockMinimo" type="number" placeholder="Stock mínimo" defaultValue={editando?.stockMinimo} min={0} />
      </div>
      {editando && <p className="muted" style={{ fontSize: 11 }}>El stock se modifica desde Inventario (entradas/ajustes), no aquí.</p>}
      <button className="btn" disabled={guardando}>{editando ? 'Actualizar' : 'Guardar producto'}</button>
    </form>
  );
}

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

  const onGuardar = (datos: any) => {
    editando ? actualizar.mutate({ id: editando.id, ...datos }) : crear.mutate(datos);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Buscar producto o código…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {esAdmin && <button className="btn" onClick={() => { setEditando(null); setMostrarForm(v => !v); }}>＋</button>}
      </div>

      {esAdmin && (mostrarForm || editando) && (
        <ProductoForm key={editando?.id ?? 'nuevo'} editando={editando} onGuardar={onGuardar}
          guardando={crear.isPending || actualizar.isPending} />
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
