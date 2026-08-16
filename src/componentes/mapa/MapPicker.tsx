'use client';

import { useEffect, useRef } from 'react';
import type L from 'leaflet';
import { MapPin, AlertCircle } from 'lucide-react';

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  localDefinido: boolean;
  onChange: (lat: number, lng: number) => void;
  onLocalDefinidoChange: (localDefinido: boolean) => void;
}

const DEFAULT_CENTER: [number, number] = [-10.187933, -48.333664]; // Palmas / TO

export default function MapPicker({
  lat,
  lng,
  localDefinido,
  onChange,
  onLocalDefinidoChange,
}: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      // Import dynamic client-side Leaflet
      const Leaflet = (await import('leaflet')).default;

      if (!isMounted || !mapContainerRef.current) return;

      // Evitar reinicialização duplicada
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const initialCenter: [number, number] =
        lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER;
      const initialZoom = lat !== null && lng !== null ? 15 : 13;

      const map = Leaflet.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
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

      // Marcador
      const markerPosition: [number, number] = initialCenter;
      const marker = Leaflet.marker(markerPosition, {
        icon: customIcon,
        draggable: localDefinido,
      }).addTo(map);

      markerRef.current = marker;

      // Atualizar no arraste
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChange(pos.lat, pos.lng);
      });

      // Atualizar no clique do mapa
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!markerRef.current) return;
        markerRef.current.setLatLng(e.latlng);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      // Garantir renderização completa dos tiles
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 250);
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Executar na montagem

  // Atualizar posição do marcador quando as props lat/lng mudarem externamente
  useEffect(() => {
    if (mapRef.current && markerRef.current && lat !== null && lng !== null) {
      const novaPosicao: [number, number] = [lat, lng];
      markerRef.current.setLatLng(novaPosicao);
      mapRef.current.panTo(novaPosicao);
    }
  }, [lat, lng]);

  // Atualizar estado de arrastável do marcador conforme localDefinido
  useEffect(() => {
    if (markerRef.current) {
      if (localDefinido) {
        markerRef.current.dragging?.enable();
      } else {
        markerRef.current.dragging?.disable();
      }
    }

    if (mapRef.current && localDefinido) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 150);
    }
  }, [localDefinido]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <MapPin size={16} className="text-[#ff007a]" />
          Localização no Mapa
        </label>
        <span className="text-xs text-slate-400">
          Clique no mapa ou araste o marcador para definir o ponto
        </span>
      </div>

      <div
        className={`relative w-full h-80 rounded-xl overflow-hidden border border-white/10 shadow-lg transition-all duration-300 ${
          !localDefinido ? 'opacity-40 pointer-events-none filter grayscale' : 'opacity-100'
        }`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-0" />
      </div>

      {lat !== null && lng !== null && localDefinido && (
        <div className="text-xs text-slate-400 flex items-center justify-between px-1">
          <span>Coordenadas selecionadas:</span>
          <span className="font-mono text-slate-200">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
        </div>
      )}

      {/* Checkbox Local não definido */}
      <div className="flex items-center gap-2.5 pt-1">
        <input
          type="checkbox"
          id="checkbox-local-nao-definido"
          checked={!localDefinido}
          onChange={(e) => onLocalDefinidoChange(!e.target.checked)}
          className="w-4 h-4 rounded bg-[#111a2e] border-white/20 text-[#ff007a] focus:ring-[#ff007a] cursor-pointer"
        />
        <label
          htmlFor="checkbox-local-nao-definido"
          className="text-xs font-medium text-slate-300 cursor-pointer select-none flex items-center gap-1.5"
        >
          <AlertCircle size={14} className="text-slate-400" />
          Local não definido (oculta o mapa nos detalhes do evento)
        </label>
      </div>
    </div>
  );
}
