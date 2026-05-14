import type { FlightPoint, LiveFlight, LiveFlightDataSourceOptions } from './types.js';

const OPENSKY_API = 'https://opensky-network.org/api/states/all';

/** Polls the OpenSky Network anonymous API for real-time ADS-B flight state vectors. */
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
    this.bbox             = options.bbox            ?? [-124.48, 32.53, -114.13, 42.01];
    this.refreshIntervalMs = options.refreshIntervalMs ?? 15_000;
    this.trackDurationMs  = options.trackDurationMs ?? 3_600_000;
    this.fetcher          = options.fetcher         ?? fetch.bind(globalThis);
  }

  async start(): Promise<void> {
    await this._poll();
    this._handle ??= setInterval(() => { void this._poll(); }, this.refreshIntervalMs);
  }

  stop(): void {
    clearInterval(this._handle);
    this._handle = undefined;
  }

  /** Returns the collected position history for an aircraft (up to trackDurationMs old). */
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
    const [west, south, east, north] = this.bbox;
    const url = `${OPENSKY_API}?lamin=${south}&lomin=${west}&lamax=${north}&lomax=${east}`;
    try {
      const res = await this.fetcher(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json() as { states?: unknown[][] };
      if (this._destroyed) return;

      const now     = Date.now();
      const flights: LiveFlight[] = [];
      const seen    = new Set<string>();

      for (const s of (data.states ?? [])) {
        if (!Array.isArray(s)) continue;
        const icao24   = typeof s[0] === 'string' ? s[0] : null;
        const lon      = typeof s[5] === 'number' ? s[5] : null;
        const lat      = typeof s[6] === 'number' ? s[6] : null;
        const onGround = s[8] === true;
        if (!icao24 || lon === null || lat === null || onGround) continue;

        const altitude  = typeof s[7]  === 'number' ? s[7]  : 0;
        const speed     = typeof s[9]  === 'number' ? s[9]  : 0;
        const heading   = typeof s[10] === 'number' ? s[10] : 0;
        const vertRate  = typeof s[11] === 'number' ? s[11] : 0;
        const callsign  = (typeof s[1] === 'string' ? s[1].trim() : '') || icao24;
        const country   = typeof s[2] === 'string' ? s[2] : '';

        const point: FlightPoint = { longitude: lon, latitude: lat, altitude, heading, speed, timestamp: now };
        const prev  = this._tracks.get(icao24) ?? [];
        const track = [...prev, point].filter(p => now - p.timestamp < this.trackDurationMs);
        this._tracks.set(icao24, track);

        // Type heuristic: helicopters are slow (< 60 m/s ≈ 117 kn) and typically stay low
        const kind: 'plane' | 'helicopter' = speed < 60 ? 'helicopter' : 'plane';

        flights.push({ icao24, callsign, originCountry: country, longitude: lon, latitude: lat, altitude, speed, heading, verticalRate: vertRate, kind });
        seen.add(icao24);
      }

      // Prune departed aircraft — keep their track until it ages out
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
