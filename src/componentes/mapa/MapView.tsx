'use client';

import { useEffect, useRef } from 'react';
import type L from 'leaflet';

interface MapViewProps {
  lat: number;
  lng: number;
  tituloEvento?: string;
  localEvento?: string;
  className?: string;
}

export default function MapView({
  lat,
  lng,
  tituloEvento,
  localEvento,
  className = 'h-80',
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      const Leaflet = (await import('leaflet')).default;
      if (!isMounted || !mapContainerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const center: [number, number] = [lat, lng];

      const map = Leaflet.map(mapContainerRef.current, {
        center,
        zoom: 15,
        zoomControl: true,
      });

      mapRef.current = map;

      // Tiles do Google
      const mapaTile = Leaflet.tileLayer(
        'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        {
          maxZoom: 20,
          attribution: '&copy; Google Maps',
        }
      );

      const sateliteTile = Leaflet.tileLayer(
        'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
          maxZoom: 20,
          attribution: '&copy; Google Maps',
        }
      );

      mapaTile.addTo(map);

      const baseMaps = {
        Mapa: mapaTile,
        Satélite: sateliteTile,
      };

      Leaflet.control.layers(baseMaps, undefined, { position: 'topright' }).addTo(map);

      // Ícone SVG customizado
      const iconSvg = `
        <div class="flex items-center justify-center filter drop-shadow-lg">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ff007a" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="12" cy="9" r="2.5" fill="#ffffff"/>
          </svg>
        </div>
      `;

      const customIcon = Leaflet.divIcon({
        html: iconSvg,
        className: 'bg-transparent',
        iconSize: [38, 38],
        iconAnchor: [19, 38],
        popupAnchor: [0, -38],
      });

      const marker = Leaflet.marker(center, {
        icon: customIcon,
        draggable: false,
      }).addTo(map);

      if (tituloEvento || localEvento) {
        const escapar = (str: string) =>
          str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const tituloEscapado = tituloEvento ? escapar(tituloEvento) : '';
        const localEscapado = localEvento ? escapar(localEvento) : '';

        const conteudoPopup = `
          <div style="font-family: sans-serif; font-size: 13px; text-align: center; padding: 2px;">
            ${tituloEscapado ? `<strong style="display:block; font-size: 14px; margin-bottom: 2px;">${tituloEscapado}</strong>` : ''}
            ${localEscapado ? `<span style="color: #64748b;">${localEscapado}</span>` : ''}
          </div>
        `;
        marker.bindPopup(conteudoPopup);
      }

      // Garantir renderização completa
      const timer1 = setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 150);

      const timer2 = setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 500);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng, tituloEvento, localEvento]);

  // Recalcular tamanho quando o container mudar de visibilidade
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border border-white/10 shadow-lg ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full z-0" />
    </div>
  );
}
