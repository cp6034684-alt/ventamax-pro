import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PuntoMapa {
  id: string; lat: number; lng: number;
  titulo: string; descripcion?: string; color?: string;
}

/** Mapa Leaflet con pines de colores, selección por clic y botón "Centrar" (GPS). */
export function Mapa({ puntos, onSeleccionar, alto = 460 }: {
  puntos: PuntoMapa[]; onSeleccionar?: (id: string) => void; alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const yo = useRef<L.CircleMarker | null>(null);
  const seleccionarRef = useRef(onSeleccionar);
  seleccionarRef.current = onSeleccionar;
  const [ubicando, setUbicando] = useState(false);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current).setView([4.81, -75.69], 12); // Eje cafetero por defecto
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa.current);
    capa.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  useEffect(() => {
    if (!mapa.current || !capa.current) return;
    capa.current.clearLayers();
    const validos = puntos.filter(p => p.lat && p.lng);
    validos.forEach(p => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 8, color: '#06121f', weight: 1.5, fillColor: p.color ?? '#00c8ff', fillOpacity: .9,
      });
      m.bindTooltip(p.titulo, { direction: 'top' });
      m.on('click', () => seleccionarRef.current?.(p.id));
      capa.current!.addLayer(m);
    });
    if (validos.length) {
      mapa.current.fitBounds(L.latLngBounds(validos.map(p => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 15 });
    }
  }, [puntos]);

  const centrar = () => {
    if (!navigator.geolocation || !mapa.current) return alert('Tu dispositivo no soporta GPS');
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        mapa.current!.setView([lat, lng], 16);
        if (yo.current) yo.current.setLatLng([lat, lng]);
        else {
          yo.current = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#0044ff', fillOpacity: 1 })
            .bindTooltip('Estás aquí').addTo(mapa.current!);
        }
        setUbicando(false);
      },
      () => { alert('No se pudo obtener tu ubicación. Activa el GPS y los permisos.'); setUbicando(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={contenedor} style={{ height: alto, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
      <button onClick={centrar} disabled={ubicando} title="Centrar en mi ubicación"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1000,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}>
        {ubicando ? '📍…' : '📍 Centrar'}
      </button>
    </div>
  );
}
