<script setup lang="ts">
import type { GeoPoint } from '#shared/geo/point-in-polygon'
import type { AccessMapEvent } from '~/utils/access-gate-map'

const props = defineProps<{
  events: AccessMapEvent[]
  polygon: GeoPoint[]
  drawing: boolean
}>()

const emit = defineEmits<{
  'update:polygon': [points: GeoPoint[]]
  'ban-ip': [ip: string]
}>()

const mapEl = ref<HTMLElement | null>(null)

// Leaflet instances are kept outside reactive state to avoid deep proxies.
let L: typeof import('leaflet') | null = null
let map: import('leaflet').Map | null = null
let clusterGroup: import('leaflet').LayerGroup | null = null
let polygonLayer: import('leaflet').Polygon | null = null
let vertexLayer: import('leaflet').LayerGroup | null = null

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch] ?? ch
  ))
}

function markerColor(ev: AccessMapEvent): string {
  if (ev.outcome === 'blocked') return '#dc2626'
  if (ev.eventType === 'login') {
    return ev.outcome === 'login_failed' ? '#f59e0b' : '#4f46e5'
  }
  return '#0ea5e9'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function popupHtml(ev: AccessMapEvent): string {
  const rows: string[] = []
  const who = ev.userName || ev.userEmail || (ev.eventType === 'login' ? 'Unknown user' : 'Anonymous visitor')
  rows.push(`<b>${escapeHtml(who)}</b>`)
  if (ev.userEmail && ev.userEmail !== who) rows.push(escapeHtml(ev.userEmail))
  rows.push(`Type: ${escapeHtml(ev.eventType)} · ${escapeHtml(ev.outcome)}`)
  if (ev.locationLabel) rows.push(`Location: ${escapeHtml(ev.locationLabel)}`)
  if (ev.ipAddress) rows.push(`IP: ${escapeHtml(ev.ipAddress)}`)
  if (ev.path) rows.push(`Path: ${escapeHtml(ev.path)}`)
  rows.push(`When: ${escapeHtml(formatWhen(ev.createdAt))}`)
  const banBtn = ev.ipAddress
    ? `<button type="button" class="ag-ban-btn" data-ip="${escapeHtml(ev.ipAddress)}">Ban this IP</button>`
    : ''
  return `<div class="ag-popup">${rows.join('<br>')}${banBtn ? `<div style="margin-top:8px">${banBtn}</div>` : ''}</div>`
}

function renderMarkers() {
  if (!L || !map || !clusterGroup) return
  clusterGroup.clearLayers()
  for (const ev of props.events) {
    if (ev.latitude == null || ev.longitude == null) continue
    const color = markerColor(ev)
    const icon = L.divIcon({
      className: 'ag-marker',
      html: `<span class="ag-dot" style="background:${color}"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    const marker = L.marker([ev.latitude, ev.longitude], { icon })
    marker.bindPopup(popupHtml(ev))
    clusterGroup.addLayer(marker)
  }
}

function renderPolygon() {
  if (!L || !map) return
  if (polygonLayer) {
    polygonLayer.remove()
    polygonLayer = null
  }
  if (vertexLayer) {
    vertexLayer.clearLayers()
  }
  const pts = props.polygon
  if (pts.length >= 2) {
    const latlngs = pts.map(p => [p.lat, p.lng]) as [number, number][]
    polygonLayer = L.polygon(latlngs, {
      color: '#4f46e5',
      weight: 2,
      fillOpacity: 0.12,
    }).addTo(map)
  }
  if (props.drawing && vertexLayer) {
    for (const p of pts) {
      L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: '#4f46e5',
        fillColor: '#fff',
        fillOpacity: 1,
        weight: 2,
      }).addTo(vertexLayer)
    }
  }
}

function fitToData() {
  if (!L || !map) return
  const coords: [number, number][] = []
  for (const ev of props.events) {
    if (ev.latitude != null && ev.longitude != null) coords.push([ev.latitude, ev.longitude])
  }
  for (const p of props.polygon) coords.push([p.lat, p.lng])
  if (coords.length) {
    map.fitBounds(L.latLngBounds(coords).pad(0.2), { maxZoom: 12 })
  }
  else {
    map.setView([39.5, -98.35], 4)
  }
}

function onMapClick(e: import('leaflet').LeafletMouseEvent) {
  if (!props.drawing) return
  const next = [...props.polygon, { lat: e.latlng.lat, lng: e.latlng.lng }]
  emit('update:polygon', next)
}

async function initMap() {
  if (!mapEl.value) return
  await import('leaflet/dist/leaflet.css')
  await import('leaflet.markercluster/dist/MarkerCluster.css')
  await import('leaflet.markercluster/dist/MarkerCluster.Default.css')
  const leafletMod = await import('leaflet')
  L = ((leafletMod as { default?: typeof import('leaflet') }).default ?? leafletMod) as typeof import('leaflet')
  await import('leaflet.markercluster')

  map = L.map(mapEl.value, { scrollWheelZoom: true }).setView([39.5, -98.35], 4)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  const makeCluster = (L as typeof import('leaflet') & {
    markerClusterGroup?: () => import('leaflet').LayerGroup
  }).markerClusterGroup
  clusterGroup = makeCluster ? makeCluster() : L.layerGroup()
  map.addLayer(clusterGroup)
  vertexLayer = L.layerGroup().addTo(map)

  map.on('click', onMapClick)
  map.on('popupopen', (e: import('leaflet').PopupEvent) => {
    const node = (e.popup.getElement?.() ?? null) as HTMLElement | null
    const btn = node?.querySelector<HTMLButtonElement>('.ag-ban-btn')
    if (btn) {
      btn.addEventListener('click', () => {
        const ip = btn.dataset.ip
        if (ip) emit('ban-ip', ip)
      }, { once: true })
    }
  })

  renderMarkers()
  renderPolygon()
  fitToData()
}

onMounted(() => {
  void initMap()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})

watch(() => props.events, () => {
  renderMarkers()
}, { deep: true })

watch(() => props.polygon, () => {
  renderPolygon()
}, { deep: true })

watch(() => props.drawing, () => {
  renderPolygon()
})
</script>

<template>
  <div ref="mapEl" class="ag-map" />
</template>

<style>
.ag-map {
  width: 100%;
  height: 420px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  z-index: 0;
}
.ag-marker .ag-dot {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.25);
}
.ag-popup {
  font-size: 12.5px;
  line-height: 1.5;
  color: #0f172a;
}
.ag-ban-btn {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
