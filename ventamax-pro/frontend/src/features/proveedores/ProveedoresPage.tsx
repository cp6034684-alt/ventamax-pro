import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { proveedoresApi } from '../../api/servicios';
import type { Proveedor } from '../../api/tipos';

export function ProveedoresPage() {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ['proveedores', busqueda], queryFn: () => proveedoresApi.listar(busqueda) });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); setMostrarForm(false); setEditando(null); };
  const crear = useMutation({ mutationFn: proveedoresApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: (d: Proveedor) => proveedoresApi.actualizar(d.id, d), onSuccess: invalidar,
  });
  const eliminar = useMutation({ mutationFn: proveedoresApi.eliminar, onSuccess: invalidar });

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const datos = {
      nombre: String(fd.get('nombre')), nit: String(fd.get('nit') || ''),
      telefono: String(fd.get('telefono') || ''), contacto: String(fd.get('contacto') || ''),
    };
    editando ? actualizar.mutate({ ...datos, id: editando.id }) : crear.mutate(datos);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Buscar proveedor…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <button className="btn" onClick={() => { setEditando(null); setMostrarForm(v => !v); }}>＋</button>
      </div>

      {(mostrarForm || editando) && (
        <form key={editando?.id ?? 'nuevo'} className="card" style={{ display: 'grid', gap: 10 }} onSubmit={guardar}>
          <input name="nombre" placeholder="Nombre *" defaultValue={editando?.nombre} required />
          <input name="nit" placeholder="NIT" defaultValue={editando?.nit} />
          <input name="contacto" placeholder="Persona de contacto" defaultValue={editando?.contacto} />
          <input name="telefono" placeholder="Teléfono" defaultValue={editando?.telefono} inputMode="tel" />
          <button className="btn">{editando ? 'Actualizar' : 'Guardar proveedor'}</button>
        </form>
      )}

      {data?.map(p => (
        <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>{p.nombre}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {[p.contacto, p.telefono, p.nit && `NIT ${p.nit}`].filter(Boolean).join(' · ') || 'Sin datos'}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setEditando(p)}>✏️</button>
          <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: 'var(--red)' }}
            onClick={() => confirm(`¿Eliminar a ${p.nombre}?`) && eliminar.mutate(p.id)}>🗑</button>
        </div>
      ))}
      {data && !data.length && <p className="muted">No hay proveedores. Agrega el primero con ＋</p>}
    </div>
  );
}
