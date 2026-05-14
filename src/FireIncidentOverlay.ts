import { Color, GeoJsonDataSource, type Viewer } from 'cesium';
import type {
  FireHighlightTarget,
  FireIncident,
  FireIncidentOverlayOptions,
  FireOverlayLoadResult,
  FireOverlayStatus,
  FireProximityStatus,
  ResolvedWildfireCamera,
} from './types.js';

// CAL FIRE + NIFC FIRIS combined California perimeters (anonymously queryable public view)
const DEFAULT_ENDPOINT =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query' +
  '?where=displayStatus+%3D+%27Active%27' +
  '&outFields=incident_name%2Carea_acres%2Ctype%2Cpoly_DateCurrent' +
  '&outSR=4326' +
  '&f=geojson';

interface ResolvedOptions {
  endpoint: string;
  proximityThresholdKm: number;
  refreshIntervalMs: number;
  showToggleButton: boolean;
  markers?: FireHighlightTarget;
  fetcher: typeof fetch;
}

/** Displays active wildfire perimeter polygons on the Cesium globe and highlights at-risk camera markers. */
export class FireIncidentOverlay {
  private readonly viewer: Viewer;
  private readonly options: ResolvedOptions;
  private _status: FireOverlayStatus = 'idle';
  private _incidents: FireIncident[] = [];
  private _visible = true;
  private _dataSource: GeoJsonDataSource | undefined;
  private _refreshHandle: ReturnType<typeof setInterval> | undefined;
  private _lastFetchedAt: Date | undefined;
  private _highlights: Map<string, FireProximityStatus> = new Map();
  private _toggleButton: HTMLButtonElement | undefined;
  private _destroyed = false;

  constructor(viewer: Viewer, options: FireIncidentOverlayOptions = {}) {
    this.viewer = viewer;
    this.options = {
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
      proximityThresholdKm: options.proximityThresholdKm ?? 5,
      refreshIntervalMs: options.refreshIntervalMs ?? 300_000,
      showToggleButton: options.showToggleButton !== false,
      markers: options.markers,
      fetcher: options.fetcher ?? fetch.bind(globalThis),
    };
    if (this.options.showToggleButton) {
      this.injectToggleButton();
    }
  }

  get status(): FireOverlayStatus { return this._status; }
  get visible(): boolean { return this._visible; }
  get incidents(): readonly FireIncident[] { return this._incidents; }
  get lastFetchedAt(): Date | undefined { return this._lastFetchedAt; }

  async load(endpoint?: string): Promise<FireOverlayLoadResult> {
    const url = endpoint ?? this.options.endpoint;
    this._status = 'loading';
    try {
      const incidents = await this.fetchIncidents(url);
      this._incidents = incidents;
      this._lastFetchedAt = new Date();
      this._status = 'loaded';
      await this.renderIncidents(incidents);
      this._highlights = this.computeProximity(incidents, this.options.markers?.getCameras() ?? []);
      if (this._visible) {
        this.options.markers?.setFireHighlights(this._highlights);
      }
      if (this._refreshHandle === undefined && this.options.refreshIntervalMs > 0) {
        this.scheduleRefresh();
      }
      return { status: 'loaded', incidentCount: incidents.length, highlightedCameraCount: this._highlights.size };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this._status = 'error';
      console.warn('[FireIncidentOverlay] Failed to load fire data:', err.message);
      return { status: 'error', incidentCount: 0, highlightedCameraCount: 0, error: err };
    }
  }

  setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    if (visible) {
      if (this._dataSource && !this.viewer.dataSources.contains(this._dataSource)) {
        void this.viewer.dataSources.add(this._dataSource);
      }
      this.options.markers?.setFireHighlights(this._highlights);
    } else {
      if (this._dataSource && this.viewer.dataSources.contains(this._dataSource)) {
        this.viewer.dataSources.remove(this._dataSource, false);
      }
      this.options.markers?.setFireHighlights(new Map());
    }
    if (this._toggleButton) {
      this._toggleButton.textContent = visible ? 'Hide Fire Overlay' : 'Show Fire Overlay';
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._refreshHandle !== undefined) {
      clearInterval(this._refreshHandle);
      this._refreshHandle = undefined;
    }
    if (this._dataSource) {
      this.viewer.dataSources.remove(this._dataSource, true);
      this._dataSource = undefined;
    }
    if (this._toggleButton) {
      this._toggleButton.remove();
      this._toggleButton = undefined;
    }
    this.options.markers?.setFireHighlights(new Map());
  }

  private scheduleRefresh(): void {
    this._refreshHandle = setInterval(() => { void this.refresh(); }, this.options.refreshIntervalMs);
  }

  private async refresh(): Promise<void> {
    if (this._destroyed) return;
    try {
      const incidents = await this.fetchIncidents(this.options.endpoint);
      if (this._destroyed) return;
      this._incidents = incidents;
      this._lastFetchedAt = new Date();
      this._status = 'loaded';
      await this.renderIncidents(incidents);
      this._highlights = this.computeProximity(incidents, this.options.markers?.getCameras() ?? []);
      if (this._visible) {
        this.options.markers?.setFireHighlights(this._highlights);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this._status = 'error';
      console.warn('[FireIncidentOverlay] Auto-refresh failed, retaining previous data:', err.message);
    }
  }

  private async fetchIncidents(endpoint: string): Promise<FireIncident[]> {
    const response = await this.options.fetcher(endpoint, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
      return [];
    }
    return (payload.features as unknown[])
      .map((feature, index) => this.normalizeFeature(feature, index))
      .filter((incident): incident is FireIncident => incident !== undefined);
  }

  private normalizeFeature(feature: unknown, index: number): FireIncident | undefined {
    if (!isRecord(feature)) return undefined;
    const props = isRecord(feature.properties) ? feature.properties : {};
    const geometry = isRecord(feature.geometry) ? feature.geometry : undefined;
    if (!geometry) return undefined;

    const geoType = geometry.type;
    if (geoType !== 'Polygon' && geoType !== 'MultiPolygon') return undefined;

    const coordinates = geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) return undefined;

    const outerRing: unknown = geoType === 'Polygon'
      ? (coordinates as unknown[][])[0]
      : (coordinates as unknown[][][])[0]?.[0];
    if (!Array.isArray(outerRing) || outerRing.length < 3) return undefined;

    const rawName = String(
      props['IncidentName'] ?? props['incident_name'] ?? props['name'] ?? props['NAME'] ?? `Fire ${index + 1}`
    ).trim();
    const id = String(feature.id ?? slugify(rawName, index));
    const acresBurned = numberProp(props, ['GISAcres', 'area_acres']);
    const percentContained = numberProp(props, ['PercentContained', 'percent_contained']);
    const rawDate = props['DateCurrent'] ?? props['poly_DateCurrent'] ?? props['CreateDate'];
    const dateUpdated = typeof rawDate === 'number' ? new Date(rawDate as number) : undefined;
    const boundingBox = computeBoundingBox(outerRing as number[][]);

    return {
      id,
      name: rawName,
      acresBurned,
      percentContained,
      dateUpdated,
      geometry: {
        type: geoType as 'Polygon' | 'MultiPolygon',
        coordinates: coordinates as number[][][] | number[][][][],
      },
      boundingBox,
    };
  }

  private async renderIncidents(incidents: FireIncident[]): Promise<void> {
    if (this._dataSource) {
      this.viewer.dataSources.remove(this._dataSource, true);
      this._dataSource = undefined;
    }
    if (incidents.length === 0) return;

    const featureCollection = {
      type: 'FeatureCollection',
      features: incidents.map(incident => ({
        type: 'Feature',
        id: incident.id,
        properties: { name: incident.name },
        geometry: incident.geometry,
      })),
    };

    const ds = await GeoJsonDataSource.load(featureCollection, {
      stroke: Color.RED,
      fill: Color.RED.withAlpha(0.4),
      strokeWidth: 3,
      clampToGround: true,
    });
    this._dataSource = ds;
    if (this._visible && !this._destroyed) {
      await this.viewer.dataSources.add(ds);
    }
  }

  private computeProximity(
    incidents: FireIncident[],
    cameras: ResolvedWildfireCamera[],
  ): Map<string, FireProximityStatus> {
    const highlights = new Map<string, FireProximityStatus>();
    const padDeg = this.options.proximityThresholdKm / 111;

    for (const camera of cameras) {
      let bestStatus: FireProximityStatus | undefined;

      for (const incident of incidents) {
        if (bestStatus === 'inside') break;
        const bb = incident.boundingBox;
        if (
          camera.longitude < bb.west - padDeg || camera.longitude > bb.east + padDeg ||
          camera.latitude < bb.south - padDeg || camera.latitude > bb.north + padDeg
        ) continue;

        const rings: number[][][] =
          incident.geometry.type === 'Polygon'
            ? [(incident.geometry.coordinates as number[][][])[0]]
            : (incident.geometry.coordinates as number[][][][]).map(poly => poly[0]);

        let inside = false;
        for (const ring of rings) {
          if (windingNumber([camera.longitude, camera.latitude], ring) !== 0) {
            inside = true;
            break;
          }
        }
        if (inside) { bestStatus = 'inside'; continue; }
        if (bestStatus === 'proximity') continue;

        let minDist = Infinity;
        for (const ring of rings) {
          for (const vertex of ring) {
            const d = haversineKm(camera.latitude, camera.longitude, vertex[1]!, vertex[0]!);
            if (d < minDist) minDist = d;
          }
        }
        if (minDist <= this.options.proximityThresholdKm) bestStatus = 'proximity';
      }

      if (bestStatus !== undefined) highlights.set(camera.id, bestStatus);
    }

    return highlights;
  }

  private injectToggleButton(): void {
    const container = this.viewer.container as HTMLElement;
    const button = document.createElement('button');
    button.textContent = 'Hide Fire Overlay';
    button.style.cssText = [
      'position:absolute',
      'bottom:30px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:8px 16px',
      'background:rgba(40,40,40,0.85)',
      'color:#fff',
      'border:1px solid rgba(255,100,100,0.7)',
      'border-radius:4px',
      'cursor:pointer',
      'font-size:13px',
      'font-family:sans-serif',
      'z-index:1000',
      'backdrop-filter:blur(4px)',
    ].join(';');
    button.addEventListener('click', () => this.setVisible(!this._visible));
    container.appendChild(button);
    this._toggleButton = button;
  }
}

// --- Module-scope helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberProp(props: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (typeof props[key] === 'number') return props[key] as number;
  }
  return undefined;
}

function slugify(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `fire-${index}`;
}

function computeBoundingBox(ring: number[][]): { west: number; south: number; east: number; north: number } {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const coord of ring) {
    const lon = coord[0]!;
    const lat = coord[1]!;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}

function windingNumber(point: [number, number], ring: number[][]): number {
  const [px, py] = point;
  let winding = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    if (y1! <= py!) {
      if (y2! > py!) {
        if (isLeft(x1!, y1!, x2!, y2!, px!, py!) > 0) winding++;
      }
    } else {
      if (y2! <= py!) {
        if (isLeft(x1!, y1!, x2!, y2!, px!, py!) < 0) winding--;
      }
    }
  }
  return winding;
}

function isLeft(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  return (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
