import { Cartesian3 } from 'cesium';
import type { PublicWebcam, ResolvedPublicWebcam } from './types.js';

export interface PublicWebcamDataSourceOptions {
  /**
   * Windy.com API key (free at windy.com/webcams/api).
   * When provided, live data is fetched from the Windy Webcams API v3.
   */
  apiKey?: string;
  /**
   * Bounding box [west, south, east, north] in decimal degrees.
   * Defaults to California.
   */
  bbox?: [number, number, number, number];
  /** Maximum webcams to fetch. Defaults to 200. */
  limit?: number;
  fetcher?: typeof fetch;
}

/**
 * Fetches public webcams from the Windy Webcams API v3.
 * Falls back to a built-in seed of notable California webcams when no API key
 * is configured (seed entries lack preview images — supply a key for live feeds).
 *
 * Free API key: https://windy.com/webcams/api
 */
export class PublicWebcamDataSource {
  private readonly apiKey?: string;
  private readonly bbox: [number, number, number, number];
  private readonly limit: number;
  private readonly fetcher: typeof fetch;

  constructor(options: PublicWebcamDataSourceOptions = {}) {
    this.apiKey = options.apiKey;
    this.bbox    = options.bbox  ?? [-124.48, 32.53, -114.13, 42.01];
    this.limit   = options.limit ?? 200;
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
  }

  async load(): Promise<ResolvedPublicWebcam[]> {
    if (this.apiKey) {
      const [west, south, east, north] = this.bbox;
      const url = 'https://api.windy.com/webcams/api/v3/webcams?' +
        `lang=en&limit=${this.limit}&offset=0&` +
        `boundingBox[north]=${north}&boundingBox[south]=${south}` +
        `&boundingBox[west]=${west}&boundingBox[east]=${east}` +
        `&include=images,player,urls,location`;
      const response = await this.fetcher(url, {
        headers: { 'x-windy-api-key': this.apiKey, accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Windy API ${response.status}: ${response.statusText}`);
      return this.normalize(await response.json());
    }
    return this.resolve(californiaSeed());
  }

  normalize(payload: unknown): ResolvedPublicWebcam[] {
    if (!isRecord(payload)) return [];
    const arr: unknown[] = Array.isArray((payload as any).webcams)
      ? (payload as any).webcams : [];

    const webcams = arr.flatMap((raw): PublicWebcam[] => {
      if (!isRecord(raw)) return [];
      const id = String(raw['webcamId'] ?? raw['id'] ?? '').trim();
      if (!id) return [];

      const loc = isRecord(raw['location']) ? raw['location'] : {};
      const lat = toNum(loc['latitude']);
      const lon = toNum(loc['longitude']);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

      const images  = isRecord(raw['images'])         ? raw['images']         : {};
      const current = isRecord((images as any)['current']) ? (images as any)['current'] : {};
      const player  = isRecord(raw['player'])         ? raw['player']         : {};
      const day     = isRecord((player as any)['day'])    ? (player as any)['day']    : {};
      const urls    = isRecord(raw['urls'])           ? raw['urls']           : {};

      return [{
        id,
        title:       String(raw['title'] ?? `Webcam ${id}`),
        city:        strOrUndef(loc['city']),
        region:      strOrUndef(loc['region']),
        latitude:    lat,
        longitude:   lon,
        status:      strOrUndef(raw['status']),
        previewUrl:  strOrUndef(current['preview']),
        thumbnailUrl:strOrUndef(current['thumbnail']),
        playerUrl:   strOrUndef(day['embed']),
        detailUrl:   strOrUndef(urls['detail']),
      }];
    });

    return this.resolve(webcams);
  }

  private resolve(webcams: PublicWebcam[]): ResolvedPublicWebcam[] {
    return webcams.map(w => ({
      ...w,
      position: Cartesian3.fromDegrees(w.longitude, w.latitude),
    }));
  }
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Notable California webcams as a fallback seed.
 * Preview images require a Windy API key — these entries provide location and
 * detail links only.  Get a free key at https://windy.com/webcams/api
 */
function californiaSeed(): PublicWebcam[] {
  // Seed IDs are illustrative location anchors; they may not match real Windy
  // webcam IDs, so we omit playerUrl/previewUrl to avoid 404 iframe embeds.
  // A real API key returns accurate IDs with working player and preview URLs.
  const w = (id: string) => ({
    detailUrl: `https://www.windy.com/webcams/${id}`,
  });
  return [
    // San Diego coast
    { id: '1559090485', title: 'San Diego — Coronado Bridge',    city: 'San Diego',     region: 'California', latitude: 32.6996, longitude: -117.1450, ...w('1559090485') },
    { id: '1559090487', title: 'La Jolla Cove',                  city: 'La Jolla',      region: 'California', latitude: 32.8508, longitude: -117.2713, ...w('1559090487') },
    { id: '1559090488', title: 'Del Mar Beach',                  city: 'Del Mar',       region: 'California', latitude: 32.9595, longitude: -117.2653, ...w('1559090488') },
    // LA area
    { id: '1559090400', title: 'Santa Monica Pier',              city: 'Santa Monica',  region: 'California', latitude: 34.0090, longitude: -118.4985, ...w('1559090400') },
    { id: '1559090401', title: 'Hollywood Hills',                city: 'Los Angeles',   region: 'California', latitude: 34.1341, longitude: -118.3215, ...w('1559090401') },
    { id: '1559090402', title: 'Manhattan Beach Pier',           city: 'Manhattan Beach',region: 'California', latitude: 33.8842, longitude: -118.4100, ...w('1559090402') },
    // Bay Area
    { id: '1559090500', title: 'Golden Gate Bridge',             city: 'San Francisco', region: 'California', latitude: 37.8199, longitude: -122.4783, ...w('1559090500') },
    { id: '1559090501', title: 'San Francisco Bay — Fishermans Wharf', city: 'San Francisco', region: 'California', latitude: 37.8080, longitude: -122.4177, ...w('1559090501') },
    // Central Coast / Mountains
    { id: '1559090600', title: 'Big Sur Coast',                  city: 'Big Sur',       region: 'California', latitude: 36.2704, longitude: -121.8075, ...w('1559090600') },
    { id: '1559090601', title: 'Pismo Beach',                    city: 'Pismo Beach',   region: 'California', latitude: 35.1428, longitude: -120.6413, ...w('1559090601') },
    // Mountain / Fire-watch
    { id: '1559090700', title: 'Lake Tahoe South Shore',         city: 'South Lake Tahoe', region: 'California', latitude: 38.9399, longitude: -119.9772, ...w('1559090700') },
    { id: '1559090701', title: 'Yosemite Valley',                city: 'Yosemite',      region: 'California', latitude: 37.7456, longitude: -119.5936, ...w('1559090701') },
    { id: '1559090702', title: 'Mount Shasta',                   city: 'Mount Shasta',  region: 'California', latitude: 41.3099, longitude: -122.3106, ...w('1559090702') },
  ];
}
