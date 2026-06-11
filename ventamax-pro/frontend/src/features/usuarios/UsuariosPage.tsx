import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosApi } from '../../api/servicios';

const COLOR_ROL: Record<string, string> = {
  ADMIN: 'var(--purple)', COADMIN: 'var(--orange)',
  VENDEDOR: 'var(--accent)', ENTREGADOR: 'var(--green)',
};

export function UsuariosPage() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });

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
            });
          }}>
          <input name="nombre" placeholder="Nombre completo *" required />
          <input name="usuario" placeholder="Usuario de acceso *" required autoCapitalize="none" />
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="pin" placeholder="PIN (4-6 dígitos) *" required pattern="\d{4,6}" inputMode="numeric" />
            <select name="rol" required>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ENTREGADOR">Entregador</option>
              <option value="COADMIN">Co-admin</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <input name="zona" placeholder="Zona / ruta (opcional)" />
          <button className="btn" disabled={crear.isPending}>{crear.isPending ? 'Creando…' : 'Crear usuario'}</button>
          {crear.isError && <div className="error-box">{(crear.error as Error).message}</div>}
        </form>
      )}

      {data?.map(u => (
        <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', opacity: u.activo === false ? .5 : 1 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--bg3)', color: COLOR_ROL[u.rol], fontWeight: 700, fontSize: 13,
          }}>
            {u.nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>{u.nombre}</strong>
            <div style={{ fontSize: 11 }}>
              <span style={{ color: COLOR_ROL[u.rol], fontWeight: 700 }}>{u.rol}</span>
              <span className="muted">{u.zona ? ` · ${u.zona}` : ''} · @{u.usuario}</span>
            </div>
          </div>
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
      ))}
    </div>
  );
}
