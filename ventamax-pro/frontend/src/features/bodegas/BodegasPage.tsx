import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { regionesApi, bodegasApi } from '../../api/servicios';

export function BodegasPage() {
  const qc = useQueryClient();
  const [nuevaRegion, setNuevaRegion] = useState('');

  const { data: regiones } = useQuery({ queryKey: ['regiones'], queryFn: regionesApi.listar });
  const { data: bodegas } = useQuery({ queryKey: ['bodegas'], queryFn: bodegasApi.listar });

  const crearRegion = useMutation({
    mutationFn: () => regionesApi.crear(nuevaRegion.trim()),
    onSuccess: () => { setNuevaRegion(''); qc.invalidateQueries({ queryKey: ['regiones'] }); },
  });
  const crearBodega = useMutation({
    mutationFn: (d: any) => bodegasApi.crear(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bodegas'] }); qc.invalidateQueries({ queryKey: ['regiones'] }); },
  });
  const eliminarBodega = useMutation({
    mutationFn: (id: string) => bodegasApi.eliminar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bodegas'] }); qc.invalidateQueries({ queryKey: ['regiones'] }); },
  });

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 14 }}>
      {/* ── Regiones ── */}
      <div>
        <strong style={{ fontSize: 14 }}>Regiones</strong>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input placeholder="Nueva región (ej. Eje Cafetero)" value={nuevaRegion}
            onChange={e => setNuevaRegion(e.target.value)} />
          <button className="btn" disabled={!nuevaRegion.trim() || crearRegion.isPending}
            onClick={() => crearRegion.mutate()}>Agregar</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {!regiones?.length && <span className="muted" style={{ fontSize: 12 }}>Aún no hay regiones.</span>}
          {regiones?.map(r => (
            <span key={r.id} style={{
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 16,
              padding: '4px 12px', fontSize: 12, fontWeight: 700,
            }}>
              {r.nombre} <span className="muted" style={{ fontWeight: 500 }}>· {r._count?.bodegas ?? 0} bodega(s)</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Crear bodega ── */}
      <form className="card" style={{ display: 'grid', gap: 10 }}
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          crearBodega.mutate({
            nombre: String(fd.get('nombre')),
            codigo: String(fd.get('codigo') || '') || undefined,
            ciudad: String(fd.get('ciudad') || '') || undefined,
            direccion: String(fd.get('direccion') || '') || undefined,
            regionId: String(fd.get('regionId') || '') || undefined,
          });
          e.currentTarget.reset();
        }}>
        <strong style={{ fontSize: 13 }}>Nueva bodega</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="nombre" placeholder="Nombre de la bodega *" required />
          <input name="codigo" placeholder="Código" style={{ maxWidth: 110 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="ciudad" placeholder="Ciudad" />
          <select name="regionId" required style={{ minWidth: 150 }}>
            <option value="">Región…</option>
            {regiones?.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>
        <input name="direccion" placeholder="Dirección (opcional)" />
        <button className="btn" disabled={crearBodega.isPending}>
          {crearBodega.isPending ? 'Guardando…' : 'Crear bodega'}
        </button>
        {!regiones?.length && <p className="muted" style={{ fontSize: 11 }}>Crea primero una región para poder asignarla.</p>}
        {crearBodega.isError && <div className="error-box">{(crearBodega.error as Error).message}</div>}
      </form>

      {/* ── Lista de bodegas ── */}
      <div>
        <strong style={{ fontSize: 14 }}>Bodegas</strong>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {!bodegas?.length && <span className="muted" style={{ fontSize: 12 }}>Aún no hay bodegas.</span>}
          {bodegas?.map(b => (
            <div key={b.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{b.nombre}{b.codigo ? ` · ${b.codigo}` : ''}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {b.region?.nombre ?? 'Sin región'}{b.ciudad ? ` · ${b.ciudad}` : ''}{b.direccion ? ` · ${b.direccion}` : ''}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--red)' }}
                onClick={() => confirm(`¿Desactivar bodega ${b.nombre}?`) && eliminarBodega.mutate(b.id)}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
