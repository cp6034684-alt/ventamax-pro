import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { iniciarSesion } = useAuth();
  const navigate = useNavigate();

  const tecla = (d: string) => {
    setError('');
    if (d === '←') return setPin(p => p.slice(0, -1));
    if (pin.length >= 6) return;
    setPin(p => p + d);
  };

  const entrar = async () => {
    if (!usuario || pin.length < 4) return setError('Escribe tu usuario y un PIN de 4 a 6 dígitos');
    setCargando(true); setError('');
    try {
      const r = await authApi.login(usuario.trim().toLowerCase(), pin);
      iniciarSesion(r.token, r.usuario);
      navigate('/');
    } catch (e: any) {
      setError(e.message); setPin('');
    } finally { setCargando(false); }
  };

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380, borderRadius: 24 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'grid',
          placeItems: 'center', fontSize: 24, background: 'linear-gradient(135deg, var(--accent), #0044ff)',
          boxShadow: '0 0 28px rgba(0,200,255,.35)',
        }}>⚡</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, textAlign: 'center' }}>VentaMax Pro</h1>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
          Sistema de venta TAT
        </p>

        <input
          placeholder="Usuario" value={usuario} autoCapitalize="none"
          onChange={e => setUsuario(e.target.value)} style={{ marginBottom: 14 }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 18 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <span key={i} style={{
              width: 13, height: 13, borderRadius: '50%',
              border: '2px solid var(--border)',
              background: i < pin.length ? 'var(--accent)' : 'transparent',
              borderColor: i < pin.length ? 'var(--accent)' : 'var(--border)',
            }} />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','←','0','OK'].map(t => (
            <button
              key={t}
              className="mono"
              onClick={() => (t === 'OK' ? entrar() : tecla(t))}
              disabled={cargando && t === 'OK'}
              style={{
                background: t === 'OK' ? 'rgba(0,200,255,.15)' : 'var(--bg3)',
                border: '1px solid var(--border)', borderRadius: 14, padding: 16,
                fontSize: t === 'OK' ? 14 : 22, fontWeight: 700, color: 'var(--text)',
              }}
            >{cargando && t === 'OK' ? '…' : t}</button>
          ))}
        </div>

        {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    </div>
  );
}
