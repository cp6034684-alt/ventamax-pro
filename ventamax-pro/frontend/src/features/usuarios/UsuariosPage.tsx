import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosApi, regionesApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';

const COLOR_ROL: Record<string, string> = {
  ADMIN: 'var(--purple)', COADMIN: 'var(--orange)', SUPERVISOR: '#22d3ee',
  VENDEDOR: 'var(--accent)', ENTREGADOR: 'var(--green)',
};

// Canal a partir del sufijo del ticket (CIU-NN-XXX)
const CANAL_LABEL: Record<string, string> = { MIX: 'Mixto', FOC: 'Focalizado', MAY: 'Mayorista', VIA: 'Viajero' };
function canalDeZona(zona?: string | null) {
  const m = /-([A-Z]{3})$/.exec(String(zona ?? ''));
  return m ? (CANAL_LABEL[m[1]] ?? '') : '';
}

const CIUDADES = ['ARMENIA', 'IBAGUE', 'PEREIRA'];
const CANALES = ['MIXTO', 'FOCALIZADO', 'MAYORISTA', 'VIAJERO'];

export function UsuariosPage() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { usuario } = useAuth();
  const puedeCrearAdmins = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN';
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });
  const { data: regiones } = useQuery({ queryKey: ['regiones'], queryFn: regionesApi.listar });

  // Estado del formulario de creación (controlado donde define el ticket)
  const [rolN, setRolN] = useState('VENDEDOR');
  const [ciudadN, setCiudadN] = useState('');
  const [canalN, setCanalN] = useState('');
  const esVendedorN = rolN === 'VENDEDOR';
  const { data: ticketPrev } = useQuery({
    queryKey: ['siguiente-ticket', ciudadN, canalN],
    queryFn: () => usuariosApi.siguienteTicket(ciudadN, canalN),
    enabled: esVendedorN && !!ciudadN && !!canalN,
  });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setMostrarForm(false); setCiudadN(''); setCanalN(''); };
  const crear = useMutation({ mutationFn: usuariosApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, ...d }: any) => usuariosApi.actualizar(id, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
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
              rol: rolN,
              documento: String(fd.get('documento') || '') || undefined,
              telefono: String(fd.get('telefono') || '') || undefined,
              meta: fd.get('meta') ? Number(String(fd.get('meta')).replace(/[^\d]/g, '')) : undefined,
              // Vendedor: ciudad + canal → el sistema asigna el ticket y la región.
              ciudad: esVendedorN ? (ciudadN || undefined) : (String(fd.get('ciudad') || '') || undefined),
              canal: esVendedorN ? (canalN || undefined) : undefined,
              zona: esVendedorN ? undefined : (String(fd.get('zona') || '') || undefined),
              regionId: esVendedorN ? undefined : (String(fd.get('regionId') || '') || undefined),
            });
          }}>
          <input name="nombre" placeholder="Nombre completo *" required />
          <input name="usuario" placeholder="Usuario de acceso *" required autoCapitalize="none" />
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="pin" placeholder="PIN (4-6 dígitos) *" required pattern="\d{4,6}" inputMode="numeric" style={{ flex: 1 }} />
            <select value={rolN} onChange={e => setRolN(e.target.value)} required style={{ flex: 1 }}>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ENTREGADOR">Entregador</option>
              <option value="SUPERVISOR">Supervisor</option>
              {puedeCrearAdmins && <option value="COADMIN">Co-admin</option>}
              {puedeCrearAdmins && <option value="ADMIN">Admin</option>}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="documento" placeholder="Documento / cédula" inputMode="numeric" style={{ flex: 1 }} />
            <input name="telefono" placeholder="Teléfono" inputMode="tel" style={{ flex: 1 }} />
          </div>

          {esVendedorN ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={ciudadN} onChange={e => setCiudadN(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Ciudad…</option>
                  {CIUDADES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                </select>
                <select value={canalN} onChange={e => setCanalN(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Canal…</option>
                  {CANALES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Ticket a asignar: <b className="mono accent">{esVendedorN && ciudadN && canalN ? (ticketPrev?.ticket ?? '…') : '— elige ciudad y canal —'}</b>
                <span style={{ display: 'block', fontSize: 11, opacity: .8 }}>La región y las listas de precio se asignan según la ciudad y el canal (focalizado = solo Droguerías).</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input name="ciudad" placeholder="Ciudad" style={{ flex: 1 }} />
                <input name="zona" placeholder="Zona / ruta (opcional)" style={{ flex: 1 }} />
              </div>
              <select name="regionId" defaultValue="">
                <option value="">Sin región asignada</option>
                {regiones?.map(r => <option key={r.id} value={r.id}>Región: {r.nombre}</option>)}
              </select>
            </>
          )}

          <input name="meta" placeholder="Meta mensual" inputMode="numeric" defaultValue={10000000} />
          <button className="btn" disabled={crear.isPending}>{crear.isPending ? 'Creando…' : 'Crear usuario'}</button>
          {crear.isError && <div className="error-box">{(crear.error as Error).message}</div>}
        </form>
      )}

      {data?.map(u => {
        const canal = u.rol === 'VENDEDOR' ? canalDeZona(u.zona) : '';
        return (
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
                  <span style={{ color: COLOR_ROL[u.rol], fontWeight: 700 }}>{u.rol}{canal ? ` · ${canal}` : ''}</span>
                  <span className="muted">{u.zona ? ` · ${u.zona}` : ''} · @{u.usuario}</span>
                  {u.meta != null && <span className="muted"> · Meta {u.meta.toLocaleString('es-CO')}</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => setEditId(editId === u.id ? null : u.id)}>✏️ Editar</button>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => {
                  const v = prompt(`Meta mensual de ${u.nombre}:`, String(u.meta ?? 10000000));
                  if (v != null) {
                    const meta = Number(v.replace(/[^\d]/g, ''));
                    if (Number.isFinite(meta) && meta >= 0) actualizar.mutate({ id: u.id, meta });
                    else alert('Meta inválida');
                  }
                }}>🎯 Meta</button>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => {
                  const pin = prompt(`Nuevo PIN para ${u.nombre} (4-6 dígitos):`);
                  if (pin && /^\d{4,6}$/.test(pin)) actualizar.mutate({ id: u.id, pin });
                  else if (pin) alert('PIN inválido');
                }}>🔑 PIN</button>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: u.activo === false ? 'var(--green)' : 'var(--red)' }}
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
                <input name="zona" defaultValue={u.zona ?? ''} placeholder="Ticket / zona (ej. ARM-07-MIX)" />
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
        );
      })}
    </div>
  );
}
