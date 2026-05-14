import { Cartesian3 } from 'cesium';
import type { EmergencyRadioFeed, RadioCategory, ResolvedEmergencyRadioFeed } from './types.js';

export interface EmergencyRadioDataSourceOptions {
  /**
   * Broadcastify API key (free at broadcastify.com/api).
   * When provided, live feed data is fetched from their API.
   */
  apiKey?: string;
  /** Override the Broadcastify API endpoint. */
  endpoint?: string;
  fetcher?: typeof fetch;
}

/**
 * Fetches California emergency radio feeds from the Broadcastify API.
 * Falls back to a built-in seed of major CA public-safety feeds when no
 * API key is configured.
 *
 * Broadcastify state ID for California is 12.
 * Full API docs: https://www.broadcastify.com/api/
 */
export class EmergencyRadioDataSource {
  private readonly apiKey?: string;
  private readonly endpoint?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: EmergencyRadioDataSourceOptions = {}) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint;
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
  }

  async load(): Promise<ResolvedEmergencyRadioFeed[]> {
    if (this.apiKey) {
      const url = this.endpoint ??
        `https://api.broadcastify.com/feed/?k=${this.apiKey}&stid=12&type=json`;
      const response = await this.fetcher(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Broadcastify API ${response.status}: ${response.statusText}`);
      return this.normalize(await response.json());
    }
    return this.resolve(californiaSeed());
  }

  normalize(payload: unknown): ResolvedEmergencyRadioFeed[] {
    if (!isRecord(payload)) return [];
    const wrapper = isRecord(payload['response']) ? payload['response'] : payload;
    const arr = Array.isArray(wrapper['feeds']) ? wrapper['feeds']
              : Array.isArray(wrapper['feed'])  ? wrapper['feed']
              : [];
    const feeds = (arr as unknown[]).flatMap((raw): EmergencyRadioFeed[] => {
      if (!isRecord(raw)) return [];
      const id = String(raw['id'] ?? raw['feedId'] ?? '').trim();
      if (!id) return [];
      const lat = toNum(raw['lat'] ?? raw['latitude']);
      const lon = toNum(raw['lng'] ?? raw['lon'] ?? raw['longitude']);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      return [{
        id,
        name:      String(raw['feedName'] ?? raw['name'] ?? `Feed ${id}`),
        county:    typeof raw['ctName'] === 'string' ? raw['ctName'] : undefined,
        latitude:  lat,
        longitude: lon,
        category:  categorize(String(raw['feedType'] ?? raw['categories'] ?? '')),
        streamUrl: typeof raw['streamUrl'] === 'string' ? raw['streamUrl']
                  : `https://broadcastify.cdnstream1.com/${id}`,
        webUrl:    `https://www.broadcastify.com/listen/feed/${id}`,
        listeners: typeof raw['listeners'] === 'number' ? raw['listeners']
                  : toNum(raw['listeners']) || undefined,
      }];
    });
    return this.resolve(feeds);
  }

  private resolve(feeds: EmergencyRadioFeed[]): ResolvedEmergencyRadioFeed[] {
    return feeds.map(f => ({ ...f, position: Cartesian3.fromDegrees(f.longitude, f.latitude) }));
  }
}

function categorize(type: string): RadioCategory {
  const t = type.toLowerCase();
  if (t.includes('law') || t.includes('police') || t.includes('sheriff')) return 'law';
  if (t.includes('ems') || t.includes('medical') || t.includes('ambulance')) return 'ems';
  if (t.includes('fire')) return 'fire';
  if (t.includes('aircraft') || t.includes('aviation') || t.includes('air ')) return 'aircraft';
  if (t.includes('multi') || t.includes('interop') || t.includes('tac')) return 'multi';
  return 'other';
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Seed list of major California public-safety feeds.
 * Direct CDN stream URLs require an API-issued token and are not available
 * without a Broadcastify API key. The seed omits streamUrl so the player
 * falls back to the Broadcastify web link instead of producing 404s.
 * Get a free API key at broadcastify.com/api for live streaming.
 */
function californiaSeed(): EmergencyRadioFeed[] {
  const bf = (id: string) => ({
    webUrl: `https://www.broadcastify.com/listen/feed/${id}`,
  });
  return [
    { id: '39810', name: 'San Diego Sheriff/Police Dispatch',  county: 'San Diego',     latitude: 32.7157, longitude: -117.1611, category: 'law',      ...bf('39810') },
    { id: '4312',  name: 'San Diego County Fire & Rescue',     county: 'San Diego',     latitude: 32.7300, longitude: -117.1400, category: 'fire',     ...bf('4312')  },
    { id: '2120',  name: 'LAPD Metro / Central',               county: 'Los Angeles',   latitude: 34.0522, longitude: -118.2437, category: 'law',      ...bf('2120')  },
    { id: '9781',  name: 'LA County Fire Dispatch',            county: 'Los Angeles',   latitude: 34.0700, longitude: -118.2000, category: 'fire',     ...bf('9781')  },
    { id: '13040', name: 'San Francisco Police',               county: 'San Francisco', latitude: 37.7749, longitude: -122.4194, category: 'law',      ...bf('13040') },
    { id: '28830', name: 'San Francisco Fire Dispatch',        county: 'San Francisco', latitude: 37.7800, longitude: -122.4100, category: 'fire',     ...bf('28830') },
    { id: '31910', name: 'Sacramento County Sheriff',          county: 'Sacramento',    latitude: 38.5816, longitude: -121.4944, category: 'law',      ...bf('31910') },
    { id: '16420', name: 'Sacramento Metro Fire',              county: 'Sacramento',    latitude: 38.5900, longitude: -121.5000, category: 'fire',     ...bf('16420') },
    { id: '24145', name: 'Orange County Sheriff/Fire',         county: 'Orange',        latitude: 33.7175, longitude: -117.8311, category: 'multi',    ...bf('24145') },
    { id: '32285', name: 'Riverside County Sheriff',           county: 'Riverside',     latitude: 33.9534, longitude: -117.3962, category: 'law',      ...bf('32285') },
    { id: '30559', name: 'San Bernardino County Sheriff',      county: 'San Bernardino',latitude: 34.1083, longitude: -117.2898, category: 'law',      ...bf('30559') },
    { id: '25028', name: 'Kern County Fire / EMS',             county: 'Kern',          latitude: 35.3733, longitude: -119.0187, category: 'fire',     ...bf('25028') },
    { id: '36035', name: 'Fresno County Sheriff',              county: 'Fresno',        latitude: 36.7378, longitude: -119.7871, category: 'law',      ...bf('36035') },
    { id: '15014', name: 'Bay Area Regional EMS',              county: 'Alameda',       latitude: 37.8044, longitude: -122.2712, category: 'ems',      ...bf('15014') },
    { id: '41088', name: 'SoCal TRACON / Approach',            county: 'Los Angeles',   latitude: 33.9425, longitude: -118.4081, category: 'aircraft', ...bf('41088') },
  ];
}
