import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PosicionViva, PuntoRecorrido } from '../api/tipos';

/** Mapa de rastreo: marcadores en vivo + polilínea del recorrido del día. */
export function MapaRastreo({ vivos, recorrido, alto = 460 }: {
  vivos: PosicionViva[];
  recorrido?: PuntoRecorrido[];
  alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaVivo = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current).setView([4.81, -75.69], 12); // Eje cafetero
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa.current);
    capaRuta.current = L.layerGroup().addTo(mapa.current);
    capaVivo.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  // ── Recorrido del día (polilínea + inicio/fin) ──
  useEffect(() => {
    if (!mapa.current || !capaRuta.current) return;
    capaRuta.current.clearLayers();
    const pts = (recorrido ?? []).filter(p => p.lat && p.lng);
    if (!pts.length) return;
    const coords = pts.map(p => [p.lat, p.lng] as [number, number]);
    L.polyline(coords, { color: '#00c8ff', weight: 4, opacity: .85 }).addTo(capaRuta.current);
    // Puntos intermedios discretos
    pts.forEach(p => {
      L.circleMarker([p.lat, p.lng], { radius: 3, color: '#00c8ff', weight: 1, fillColor: '#00c8ff', fillOpacity: .6 })
        .addTo(capaRuta.current!);
    });
    // Inicio (verde) y fin (rojo)
    const ini = pts[0], fin = pts[pts.length - 1];
    L.circleMarker([ini.lat, ini.lng], { radius: 8, color: '#06121f', weight: 2, fillColor: '#00e5a0', fillOpacity: 1 })
      .bindTooltip('Inicio', { direction: 'top' }).addTo(capaRuta.current);
    L.circleMarker([fin.lat, fin.lng], { radius: 8, color: '#06121f', weight: 2, fillColor: '#ff4060', fillOpacity: 1 })
      .bindTooltip('Último punto', { direction: 'top' }).addTo(capaRuta.current);
    mapa.current.fitBounds(L.latLngBounds(coords), { padding: [30, 30], maxZoom: 16 });
  }, [recorrido]);

  // ── Marcadores en vivo ──
  useEffect(() => {
    if (!mapa.current || !capaVivo.current) return;
    capaVivo.current.clearLayers();
    const validos = vivos.filter(v => v.lat && v.lng);
    validos.forEach(v => {
      const m = L.circleMarker([v.lat, v.lng], {
        radius: 9, color: '#fff', weight: 2.5, fillColor: '#0044ff', fillOpacity: 1,
      });
      m.bindTooltip(`${v.nombre} · hace ${v.haceSegundos}s`, { direction: 'top', permanent: false });
      capaVivo.current!.addLayer(m);
    });
    // Si no hay recorrido cargado, centramos en los vivos
    if (validos.length && !(recorrido && recorrido.length)) {
      mapa.current.fitBounds(L.latLngBounds(validos.map(v => [v.lat, v.lng])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [vivos, recorrido]);

  return (
    <div ref={contenedor} style={{ height: alto, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
  );
}
