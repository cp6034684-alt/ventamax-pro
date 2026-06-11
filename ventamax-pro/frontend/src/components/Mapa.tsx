import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PuntoMapa {
  id: string; lat: number; lng: number;
  titulo: string; descripcion?: string; color?: string;
}

/** Mapa Leaflet con pines de colores. Centra automáticamente en los puntos. */
export function Mapa({ puntos, alto = 420 }: { puntos: PuntoMapa[]; alto?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current).setView([6.2442, -75.5812], 12); // Medellín por defecto
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(mapa.current);
    capa.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  useEffect(() => {
    if (!mapa.current || !capa.current) return;
    capa.current.clearLayers();
    const validos = puntos.filter(p => p.lat && p.lng);
    validos.forEach(p => {
      const marcador = L.circleMarker([p.lat, p.lng], {
        radius: 9, color: p.color ?? '#00c8ff', fillColor: p.color ?? '#00c8ff',
        fillOpacity: .85, weight: 2,
      });
      marcador.bindPopup(`<strong>${p.titulo}</strong>${p.descripcion ? `<br>${p.descripcion}` : ''}`);
      capa.current!.addLayer(marcador);
    });
    if (validos.length) {
      mapa.current.fitBounds(L.latLngBounds(validos.map(p => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 15 });
    }
  }, [puntos]);

  return <div ref={contenedor} style={{ height: alto, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />;
}
