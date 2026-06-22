import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosApi, regionesApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';

const COLOR_ROL: Record<string, string> = {
  ADMIN: 'var(--purple)', COADMIN: 'var(--orange)', SUPERVISOR: '#22d3ee',
  VENDEDOR: 'var(--accent)', ENTREGADOR: 'var(--green)',
};

export function UsuariosPage() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { usuario } = useAuth();
  // Un supervisor no puede crear administradores ni co-administradores.
  const puedeCrearAdmins = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN';
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });
  const { data: regiones } = useQuery({ queryKey: ['regiones'], queryFn: regionesApi.listar });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setMostrarForm(false); };
  const crear = useMutation({ mutationFn: usuariosApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, ...d }: any) => usuariosApi.actualizar(id, d), onSuccess: invalidar,
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <button className="btn" onClick={() => setMostrarForm(v => !v)}>＋ Nuevo usuario</button>

      {mostrarForm && (
        <form className="card" style={{ display: 'grid', gap: 10 }}
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            crear.mutate({
              nombre: String(fd.get('nombre')),
              usuario: String(fd.get('usuario')).toLowerCase().trim(),
              pin: String(fd.get('pin')),
              rol: String(fd.get('rol')),
              zona: String(fd.get('zona') || '') || undefined,
              documento: String(fd.get('documento') || '') || undefined,
              ciudad: String(fd.get('ciudad') || '') || undefined,
              telefono: String(fd.get('telefono') || '') || undefined,
              meta: fd.get('meta') ? Number(fd.get('meta')) : undefined,
              regionId: String(fd.get('regionId') || '') || undefined,
            });
          }}>
          <input name="nombre" placeholder="Nombre completo *" required />
          <input name="usuario" placeholder="Usuario de acceso *" required autoCapitalize="none" />
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="pin" placeholder="PIN (4-6 dígitos) *" required pattern="\d{4,6}" inputMode="numeric" />
            <select name="rol" required>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ENTREGADOR">Entregador</option>
              <option value="SUPERVISOR">Supervisor</option>
              {puedeCrearAdmins && <option value="COADMIN">Co-admin</option>}
              {puedeCrearAdmins && <option value="ADMIN">Admin</option>}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="documento" placeholder="Documento / cédula" inputMode="numeric" />
            <input name="ciudad" placeholder="Ciudad" />
            <input name="telefono" placeholder="Teléfono" inputMode="tel" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="zona" placeholder="Zona / ruta (opcional)" style={{ flex: 1 }} />
            <input name="meta" placeholder="Meta mensual" inputMode="numeric" defaultValue={10000000} style={{ maxWidth: 150 }} />
          </div>
          <select name="regionId" defaultValue="">
            <option value="">Sin región asignada</option>
            {regiones?.map(r => <option key={r.id} value={r.id}>Región: {r.nombre}</option>)}
          </select>
          <button className="btn" disabled={crear.isPending}>{crear.isPending ? 'Creando…' : 'Crear usuario'}</button>
          {crear.isError && <div className="error-box">{(crear.error as Error).message}</div>}
        </form>
      )}

      {data?.map(u => (
        <div key={u.id} className="card" style={{ display: 'grid', gap: 8, padding: '12px 14px', opacity: u.activo === false ? .5 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: 'var(--bg3)', color: COLOR_ROL[u.rol], fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}>
              {u.nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{u.nombre}</strong>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: COLOR_ROL[u.rol], fontWeight: 700 }}>{u.rol}</span>
                <span className="muted">{u.zona ? ` · ${u.zona}` : ''} · @{u.usuario}</span>
                {u.meta != null && <span className="muted"> · Meta {u.meta.toLocaleString('es-CO')}</span>}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 11 }}
              onClick={() => setEditId(editId === u.id ? null : u.id)}>✏️</button>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 11 }}
              onClick={() => {
                const v = prompt(`Meta mensual de ${u.nombre}:`, String(u.meta ?? 10000000));
                if (v != null) {
                  const meta = Number(v.replace(/[^\d]/g, ''));
                  if (Number.isFinite(meta) && meta >= 0) actualizar.mutate({ id: u.id, meta });
                  else alert('Meta inválida');
                }
              }}>🎯 Meta</button>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 11 }}
              onClick={() => {
                const pin = prompt(`Nuevo PIN para ${u.nombre} (4-6 dígitos):`);
                if (pin && /^\d{4,6}$/.test(pin)) actualizar.mutate({ id: u.id, pin });
                else if (pin) alert('PIN inválido');
              }}>🔑 PIN</button>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 11, color: u.activo === false ? 'var(--green)' : 'var(--red)' }}
              onClick={() => actualizar.mutate({ id: u.id, activo: u.activo === false })}>
              {u.activo === false ? 'Activar' : 'Desactivar'}
            </button>
          </div>
          {editId === u.id && (
            <form style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}
              onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                actualizar.mutate({
                  id: u.id,
                  nombre: String(fd.get('nombre') || '').trim() || undefined,
                  rol: String(fd.get('rol') || '') || undefined,
                  zona: String(fd.get('zona') || ''),
                  documento: String(fd.get('documento') || ''),
                  ciudad: String(fd.get('ciudad') || ''),
                  telefono: String(fd.get('telefono') || ''),
                  meta: fd.get('meta') ? Number(String(fd.get('meta')).replace(/[^\d]/g, '')) : undefined,
                  regionId: String(fd.get('regionId') || '') || null,
                });
                setEditId(null);
              }}>
              <input name="nombre" defaultValue={u.nombre} placeholder="Nombre completo" />
              <div style={{ display: 'flex', gap: 8 }}>
                <select name="rol" defaultValue={u.rol} style={{ flex: 1 }}>
                  <option value="VENDEDOR">Vendedor</option>
                  <option value="ENTREGADOR">Entregador</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  {puedeCrearAdmins && <option value="COADMIN">Co-admin</option>}
                  {puedeCrearAdmins && <option value="ADMIN">Admin</option>}
                </select>
                <input name="meta" defaultValue={u.meta ?? 10000000} placeholder="Meta" inputMode="numeric" style={{ maxWidth: 130 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input name="documento" defaultValue={u.documento ?? ''} placeholder="Documento" inputMode="numeric" />
                <input name="ciudad" defaultValue={u.ciudad ?? ''} placeholder="Ciudad" />
                <input name="telefono" defaultValue={u.telefono ?? ''} placeholder="Teléfono" inputMode="tel" />
              </div>
              <input name="zona" defaultValue={u.zona ?? ''} placeholder="Zona / ruta" />
              <select name="regionId" defaultValue={u.region?.id ?? ''}>
                <option value="">Sin región asignada</option>
                {regiones?.map(r => <option key={r.id} value={r.id}>Región: {r.nombre}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" type="submit" style={{ flex: 1 }}>Guardar cambios</button>
                <button className="btn btn-ghost" type="button" onClick={() => setEditId(null)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
