import { Cartesian3 } from 'cesium';
import type { ResolvedWildfireCamera, WildfireCamera } from './types';

export interface WildfireCameraDataSourceOptions {
  endpoint?: string;
  fetcher?: typeof fetch;
}

type UnknownRecord = Record<string, unknown>;

/**
 * Retrieves and normalizes wildfire camera georeferences.
 *
 * The normalizer accepts a plain array of camera objects, GeoJSON FeatureCollections,
 * or APIs that wrap their array under common keys such as `cameras`, `features`, or `data`.
 */
export class WildfireCameraDataSource {
  private endpoint?: string;
  private fetcher: typeof fetch;

  constructor(options: WildfireCameraDataSourceOptions = {}) {
    this.endpoint = options.endpoint;
    this.fetcher = options.fetcher ?? fetch;
  }

  async load(endpoint = this.endpoint): Promise<ResolvedWildfireCamera[]> {
    if (!endpoint) {
      return this.fromArray(defaultSanDiegoCameraSeed());
    }

    const response = await this.fetcher(endpoint, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Failed to load wildfire cameras: ${response.status} ${response.statusText}`);
    }

    return this.normalize(await response.json());
  }

  normalize(payload: unknown): ResolvedWildfireCamera[] {
    if (Array.isArray(payload)) return this.fromArray(payload);

    if (isRecord(payload)) {
      if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
        return this.fromGeoJsonFeatures(payload.features);
      }

      for (const key of ['cameras', 'features', 'data', 'results', 'items']) {
        const value = payload[key];
        if (Array.isArray(value)) {
          return key === 'features' ? this.fromGeoJsonFeatures(value) : this.fromArray(value);
        }
      }
    }

    return [];
  }

  fromArray(items: unknown[]): ResolvedWildfireCamera[] {
    return items
      .map((item, index) => this.resolveCamera(item, index))
      .filter((camera): camera is ResolvedWildfireCamera => Boolean(camera));
  }

  private fromGeoJsonFeatures(features: unknown[]): ResolvedWildfireCamera[] {
    return features
      .map((feature, index) => {
        if (!isRecord(feature)) return undefined;
        const properties = isRecord(feature.properties) ? feature.properties : {};
        const geometry = isRecord(feature.geometry) ? feature.geometry : undefined;
        const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : undefined;
        const longitude = numberFrom(coordinates?.[0]);
        const latitude = numberFrom(coordinates?.[1]);
        const height = numberFrom(coordinates?.[2]);
        return this.resolveCamera({ ...properties, longitude, latitude, height }, index);
      })
      .filter((camera): camera is ResolvedWildfireCamera => Boolean(camera));
  }

  private resolveCamera(item: unknown, index: number): ResolvedWildfireCamera | undefined {
    if (!isRecord(item)) return undefined;

    const latitude = firstNumber(item, ['latitude', 'lat', 'y']);
    const longitude = firstNumber(item, ['longitude', 'lng', 'lon', 'x']);
    if (latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;

    const height: number = firstNumber(item, ['height', 'altitude', 'elevation']) ?? 0;
    const id = String(firstValue(item, ['id', 'cameraId', 'metadataId', 'slug']) ?? `wildfire-camera-${index}`);
    const name = String(firstValue(item, ['name', 'title', 'label']) ?? `Wildfire Camera ${index + 1}`);
    const streamUrl = stringFrom(firstValue(item, ['streamUrl', 'stream_url', 'hlsUrl', 'url']));
    const thumbnailUrl = stringFrom(firstValue(item, ['thumbnailUrl', 'thumbnail_url', 'imageUrl', 'image']));

    return {
      id,
      name,
      latitude,
      longitude,
      height,
      streamUrl,
      thumbnailUrl,
      metadata: item,
      position: Cartesian3.fromDegrees(longitude, latitude, height ?? 0)
    };
  }
}

function defaultSanDiegoCameraSeed(): WildfireCamera[] {
  return [
    { id: 'sd-mt-woodson', name: 'Mt. Woodson', latitude: 33.0087, longitude: -116.9706 },
    { id: 'sd-cowles', name: 'Cowles Mountain', latitude: 32.8126, longitude: -117.0314 },
    { id: 'sd-palomar', name: 'Palomar Mountain', latitude: 33.3563, longitude: -116.8650 },
    { id: 'sd-jamul', name: 'Jamul Highlands', latitude: 32.7170, longitude: -116.8764 },
    { id: 'sd-laguna', name: 'Mount Laguna', latitude: 32.8673, longitude: -116.4194 }
  ];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function firstValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return undefined;
}

function firstNumber(record: UnknownRecord, keys: string[]): number | undefined {
  return numberFrom(firstValue(record, keys));
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
