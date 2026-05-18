import type { FlightCircle, FlightPoint, LiveFlight, LiveFlightDataSourceOptions } from './types.js';

// opendata.adsb.fi — free community ADS-B API, no key required, CORS wildcard.
// Response uses feet for altitude, knots for speed, ft/min for vertical rate.
// category field (ADS-B emitter category): B1 = rotorcraft, B2 = glider, etc.
const ADSB_DIRECT = 'https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}';
const ADSB_PROXY  = '{proxy}/flights?lat={lat}&lon={lon}&dist={nm}';

/** Compute search circle from a bounding box: centre lat/lon + radius in nautical miles. */
function bboxToCircle(bbox: [number, number, number, number]): FlightCircle {
  const [west, south, east, north] = bbox;
  const lat = (south + north) / 2;
  const lon = (west  + east)  / 2;
  const dlat = (north - lat) * (Math.PI / 180);
  const dlon = (east  - lon) * (Math.PI / 180);
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat * Math.PI / 180) ** 2 * Math.sin(dlon / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { lat, lon, nm: Math.min(Math.ceil(km / 1.852) + 60, 250) }; // capped at adsb.fi's 250 nm limit
}

/** Polls adsb.fi for real-time ADS-B state vectors via an optional CORS proxy. */
export class LiveFlightDataSource {
  private readonly circles: FlightCircle[];
  private readonly bbox: [number, number, number, number];
  private readonly refreshIntervalMs: number;
  private readonly trackDurationMs: number;
  private readonly fetcher: typeof fetch;
  private readonly proxyUrl: string | null;

  private _tracks = new Map<string, FlightPoint[]>();
  private _handle: ReturnType<typeof setInterval> | undefined;
  private _destroyed = false;

  /** Called after every successful poll with the current in-bbox flight list. */
  onUpdate?: (flights: LiveFlight[]) => void;

  constructor(options: LiveFlightDataSourceOptions = {}) {
    this.bbox              = options.bbox             ?? [-124.48, 32.53, -114.13, 42.01];
    this.circles           = options.circles          ?? [];
    this.refreshIntervalMs = options.refreshIntervalMs ?? 15_000;
    this.trackDurationMs   = options.trackDurationMs   ?? 3_600_000;
    this.fetcher           = options.fetcher           ?? fetch.bind(globalThis);
    this.proxyUrl          = options.proxyUrl          ?? null;
  }

  async start(): Promise<void> {
    await this._poll();
    this._handle ??= setInterval(() => { void this._poll(); }, this.refreshIntervalMs);
  }

  stop(): void {
    clearInterval(this._handle);
    this._handle = undefined;
  }

  /** Returns collected position history for an aircraft (up to trackDurationMs). */
  getTrack(icao24: string): FlightPoint[] {
    return this._tracks.get(icao24) ?? [];
  }

  destroy(): void {
    this._destroyed = true;
    this.stop();
    this._tracks.clear();
  }

  private async _poll(): Promise<void> {
    if (this._destroyed) return;

    const queryCircles = this.circles.length > 0 ? this.circles : [bboxToCircle(this.bbox)];
    const template = this.proxyUrl
      ? ADSB_PROXY.replace('{proxy}', this.proxyUrl)
      : ADSB_DIRECT;

    const now = Date.now();
    const [west, south, east, north] = this.bbox;
    const flightMap = new Map<string, LiveFlight>();

    await Promise.all(queryCircles.map(async ({ lat, lon, nm }) => {
      const url = template
        .replace('{lat}', String(lat))
        .replace('{lon}', String(lon))
        .replace('{nm}', String(nm));
      try {
        const res = await this.fetcher(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const data = await res.json() as { ac?: unknown[]; aircraft?: unknown[] };
        if (this._destroyed) return;

        for (const raw of (data.aircraft ?? data.ac ?? [])) {
          if (typeof raw !== 'object' || raw === null) continue;
          const a = raw as Record<string, unknown>;

          const icao24 = typeof a['hex'] === 'string' ? a['hex'].toLowerCase() : null;
          const alat   = typeof a['lat'] === 'number' ? a['lat'] : null;
          const alon   = typeof a['lon'] === 'number' ? a['lon'] : null;
          if (!icao24 || alat === null || alon === null) continue;

          // When using a bbox, clip to it (circle query overshoots corners)
          if (this.circles.length === 0) {
            if (alon < west || alon > east || alat < south || alat > north) continue;
          }

          // Skip ground vehicles and parked aircraft
          const altRaw = a['alt_baro'];
          if (altRaw === 'ground') continue;
          const altFt = typeof altRaw === 'number' ? altRaw : 0;
          if (altFt < 100) continue;

          // Skip stale entries (seen > 60 s)
          const seen_s = typeof a['seen'] === 'number' ? a['seen'] : 0;
          if (seen_s > 60) continue;

          // Deduplicate across circles — keep whichever entry arrives first
          if (flightMap.has(icao24)) continue;

          const altM    = altFt  * 0.3048;
          const speedMs = (typeof a['gs']        === 'number' ? a['gs']        : 0) * 0.514444;
          const heading = typeof a['track']      === 'number' ? a['track']     : 0;
          const vRateMs = (typeof a['baro_rate'] === 'number' ? a['baro_rate'] : 0) * 0.00508;

          const callsign = (typeof a['flight'] === 'string' ? a['flight'].trim() : '') || icao24;
          const originCountry =
            (typeof a['ownOp'] === 'string' && a['ownOp'] ? a['ownOp'] : null) ??
            (typeof a['r']     === 'string' && a['r']     ? a['r']     : null) ??
            '';

          const category = typeof a['category'] === 'string' ? a['category'] : '';
          const kind: 'plane' | 'helicopter' =
            category === 'B1' ? 'helicopter'
            : !category && speedMs < 60 ? 'helicopter'
            : 'plane';

          const point: FlightPoint = { longitude: alon, latitude: alat, altitude: altM, heading, speed: speedMs, timestamp: now };
          const prev  = this._tracks.get(icao24) ?? [];
          const track = [...prev, point].filter(p => now - p.timestamp < this.trackDurationMs);
          this._tracks.set(icao24, track);

          flightMap.set(icao24, { icao24, callsign, originCountry, longitude: alon, latitude: alat, altitude: altM, speed: speedMs, heading, verticalRate: vRateMs, kind });
        }
      } catch (err) {
        console.warn('[LiveFlight] poll failed:', err instanceof Error ? err.message : String(err));
      }
    }));

    if (this._destroyed) return;

    const flights = [...flightMap.values()];
    const seen = new Set(flightMap.keys());

    // Prune departed aircraft — keep track until it ages out naturally
    for (const [id, track] of this._tracks) {
      if (seen.has(id)) continue;
      const pruned = track.filter(p => now - p.timestamp < this.trackDurationMs);
      if (pruned.length === 0) this._tracks.delete(id);
      else this._tracks.set(id, pruned);
    }

    this.onUpdate?.(flights);
  }
}
