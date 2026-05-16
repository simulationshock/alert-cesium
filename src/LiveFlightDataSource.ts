import type { FlightPoint, LiveFlight, LiveFlightDataSourceOptions } from './types.js';

// opendata.adsb.fi — free community ADS-B API, no key required, CORS wildcard.
// Response uses feet for altitude, knots for speed, ft/min for vertical rate.
// category field (ADS-B emitter category): B1 = rotorcraft, B2 = glider, etc.
const ADSB_LOL = 'https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}';

/** Compute search circle from a bounding box: centre lat/lon + radius in nautical miles. */
function bboxToCircle(bbox: [number, number, number, number]): { lat: number; lon: number; nm: number } {
  const [west, south, east, north] = bbox;
  const lat = (south + north) / 2;
  const lon = (west  + east)  / 2;
  const dlat = (north - lat) * (Math.PI / 180);
  const dlon = (east  - lon) * (Math.PI / 180);
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat * Math.PI / 180) ** 2 * Math.sin(dlon / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { lat, lon, nm: Math.ceil(km / 1.852) + 60 }; // +60 nm margin
}

/** Polls adsb.lol for real-time ADS-B state vectors. Free, no API key, CORS-open. */
export class LiveFlightDataSource {
  private readonly bbox: [number, number, number, number];
  private readonly refreshIntervalMs: number;
  private readonly trackDurationMs: number;
  private readonly fetcher: typeof fetch;

  private _tracks = new Map<string, FlightPoint[]>();
  private _handle: ReturnType<typeof setInterval> | undefined;
  private _destroyed = false;

  /** Called after every successful poll with the current in-bbox flight list. */
  onUpdate?: (flights: LiveFlight[]) => void;

  constructor(options: LiveFlightDataSourceOptions = {}) {
    this.bbox              = options.bbox             ?? [-124.48, 32.53, -114.13, 42.01];
    this.refreshIntervalMs = options.refreshIntervalMs ?? 15_000;
    this.trackDurationMs   = options.trackDurationMs   ?? 3_600_000;
    this.fetcher           = options.fetcher           ?? fetch.bind(globalThis);
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
    const { lat, lon, nm } = bboxToCircle(this.bbox);
    const url = ADSB_LOL.replace('{lat}', String(lat)).replace('{lon}', String(lon)).replace('{nm}', String(nm));
    try {
      const res = await this.fetcher(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json() as { ac?: unknown[]; aircraft?: unknown[] };
      if (this._destroyed) return;

      const now     = Date.now();
      const flights: LiveFlight[] = [];
      const seen    = new Set<string>();
      const [west, south, east, north] = this.bbox;

      for (const raw of (data.aircraft ?? data.ac ?? [])) {
        if (typeof raw !== 'object' || raw === null) continue;
        const a = raw as Record<string, unknown>;

        const icao24 = typeof a['hex'] === 'string' ? a['hex'].toLowerCase() : null;
        const lat    = typeof a['lat'] === 'number' ? a['lat'] : null;
        const lon    = typeof a['lon'] === 'number' ? a['lon'] : null;
        if (!icao24 || lat === null || lon === null) continue;

        // Clip to original bbox (circle query overshoots)
        if (lon < west || lon > east || lat < south || lat > north) continue;

        // Skip ground vehicles and parked aircraft
        const altRaw = a['alt_baro'];
        if (altRaw === 'ground') continue;
        const altFt = typeof altRaw === 'number' ? altRaw : 0;
        if (altFt < 100) continue; // filter taxi/surface traffic

        // Skip stale entries (seen > 60 s)
        const seen_s = typeof a['seen'] === 'number' ? a['seen'] : 0;
        if (seen_s > 60) continue;

        const altM    = altFt  * 0.3048;
        const speedMs = (typeof a['gs']        === 'number' ? a['gs']        : 0) * 0.514444;
        const heading = typeof a['track']      === 'number' ? a['track']     : 0;
        const vRateMs = (typeof a['baro_rate'] === 'number' ? a['baro_rate'] : 0) * 0.00508;

        const callsign = (typeof a['flight'] === 'string' ? a['flight'].trim() : '') || icao24;
        // Show operator name if available, otherwise aircraft registration
        const originCountry =
          (typeof a['ownOp'] === 'string' && a['ownOp'] ? a['ownOp'] : null) ??
          (typeof a['r']     === 'string' && a['r']     ? a['r']     : null) ??
          '';

        // category B1 = rotorcraft; fall back to speed heuristic
        const category = typeof a['category'] === 'string' ? a['category'] : '';
        const kind: 'plane' | 'helicopter' =
          category === 'B1' ? 'helicopter'
          : !category && speedMs < 60 ? 'helicopter'
          : 'plane';

        const point: FlightPoint = { longitude: lon, latitude: lat, altitude: altM, heading, speed: speedMs, timestamp: now };
        const prev  = this._tracks.get(icao24) ?? [];
        const track = [...prev, point].filter(p => now - p.timestamp < this.trackDurationMs);
        this._tracks.set(icao24, track);

        flights.push({ icao24, callsign, originCountry, longitude: lon, latitude: lat, altitude: altM, speed: speedMs, heading, verticalRate: vRateMs, kind });
        seen.add(icao24);
      }

      // Prune departed aircraft — keep their track until it ages out naturally
      for (const [id, track] of this._tracks) {
        if (seen.has(id)) continue;
        const pruned = track.filter(p => now - p.timestamp < this.trackDurationMs);
        if (pruned.length === 0) this._tracks.delete(id);
        else this._tracks.set(id, pruned);
      }

      this.onUpdate?.(flights);
    } catch (err) {
      console.warn('[LiveFlight] poll failed:', err instanceof Error ? err.message : String(err));
    }
  }
}
