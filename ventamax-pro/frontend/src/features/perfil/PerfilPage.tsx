import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';

export function PerfilPage() {
  const { usuario, cerrarSesion } = useAuth();
  const { data: yo } = useQuery({ queryKey: ['yo'], queryFn: authApi.yo });
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiarPin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const actual = String(fd.get('actual'));
    const nuevo = String(fd.get('nuevo'));
    const confirmar = String(fd.get('confirmar'));
    if (nuevo !== confirmar) return setMensaje({ ok: false, texto: 'Los PIN nuevos no coinciden' });

    setGuardando(true); setMensaje(null);
    try {
      await authApi.cambiarPin(actual, nuevo);
      setMensaje({ ok: true, texto: 'PIN actualizado correctamente' });
      e.currentTarget.reset();
    } catch (err: any) {
      setMensaje({ ok: false, texto: err.message });
    } finally { setGuardando(false); }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 10px',
          display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800,
          background: 'linear-gradient(135deg, var(--accent), #0044ff)',
        }}>
          {usuario?.nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}
        </div>
        <strong style={{ fontSize: 16 }}>{usuario?.nombre}</strong>
        <p className="muted" style={{ fontSize: 12 }}>
          {usuario?.rol}{yo?.zona ? ` · Zona ${yo.zona}` : ''}{yo?.usuario ? ` · @${yo.usuario}` : ''}
        </p>
      </div>

      <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={cambiarPin}>
        <strong style={{ fontSize: 13 }}>Cambiar mi PIN</strong>
        <input name="actual" type="password" placeholder="PIN actual" required pattern="\d{4,6}" inputMode="numeric" />
        <input name="nuevo" type="password" placeholder="PIN nuevo (4-6 dígitos)" required pattern="\d{4,6}" inputMode="numeric" />
        <input name="confirmar" type="password" placeholder="Confirmar PIN nuevo" required pattern="\d{4,6}" inputMode="numeric" />
        <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Cambiar PIN'}</button>
        {mensaje && (
          <div className={mensaje.ok ? 'card' : 'error-box'}
            style={mensaje.ok ? { borderColor: 'var(--green)', color: 'var(--green)', fontSize: 13, textAlign: 'center', padding: 10 } : undefined}>
            {mensaje.texto}
          </div>
        )}
      </form>

      <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={cerrarSesion}>
        Cerrar sesión
      </button>
    </div>
  );
}
