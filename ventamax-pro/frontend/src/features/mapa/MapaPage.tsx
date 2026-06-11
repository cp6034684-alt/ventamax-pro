import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientesApi } from '../../api/servicios';
import { Mapa } from '../../components/Mapa';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function MapaPage() {
  const [dia, setDia] = useState(0); // 0 = todos
  const { data } = useQuery({
    queryKey: ['clientes-mapa'],
    queryFn: () => clientesApi.listar('', 1, 500),
  });

  const clientes = (data?.datos ?? []).filter(c =>
    c.lat && c.lng && (dia === 0 || c.diaVisita === dia));

  const sinUbicar = (data?.datos ?? []).filter(c => !c.lat || !c.lng).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {DIAS.map((d, i) => (
          <button key={i} className={`btn ${dia === i ? '' : 'btn-ghost'}`}
            style={{ fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap' }}
            onClick={() => setDia(i)}>
            {i === 0 ? 'Todos' : d}
          </button>
        ))}
      </div>

      <Mapa puntos={clientes.map(c => ({
        id: c.id, lat: c.lat!, lng: c.lng!,
        titulo: c.nombre,
        descripcion: [c.barrio, c.telefono, Number(c.saldoPendiente) > 0 ? `Debe $${Number(c.saldoPendiente).toLocaleString('es-CO')}` : null]
          .filter(Boolean).join(' · '),
        color: Number(c.saldoPendiente) > 0 ? '#ffaa00' : '#00c8ff',
      }))} />

      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        {clientes.length} cliente(s) en el mapa
        {sinUbicar > 0 && ` · ${sinUbicar} sin ubicación GPS (captúrala al editar el cliente)`}
        <br />🔵 al día · 🟠 con saldo pendiente
      </div>
    </div>
  );
}
