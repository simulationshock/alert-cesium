import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  EntityCluster,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer
} from 'cesium';

export type CameraLoadStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'stale' | 'unavailable' | 'partial-invalid';

export interface WildfireCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  status?: string;
  agency?: string;
  feedUrl?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CameraLoadState {
  status: CameraLoadStatus;
  message: string;
  loadedAt?: Date;
  staleSince?: Date;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
}

export interface CameraLoadResult {
  cameras: WildfireCamera[];
  state: CameraLoadState;
}

export type CameraDataProvider = () => Promise<unknown[]>;

export interface WildfireCameraDataSourceOptions {
  /** Authoritative camera endpoint. The endpoint may return an array, GeoJSON FeatureCollection, or an object with a cameras/data/features array. */
  url?: string;
  /** Custom provider for tests, authenticated APIs, or pre-fetched camera records. */
  provider?: CameraDataProvider;
  /** Fetch implementation override. Defaults to global fetch. */
  fetcher?: typeof fetch;
  /** Optional request timeout in milliseconds. */
  timeoutMs?: number;
}

export interface WildfireCameraLayerOptions extends WildfireCameraDataSourceOptions {
  name?: string;
  clusterPixelRange?: number;
  minimumClusterSize?: number;
  onStateChange?: (state: CameraLoadState) => void;
  onCameraSelected?: (camera: WildfireCamera, entity: Entity) => void;
  onClusterSelected?: (entities: Entity[]) => void;
}

type RawCamera = Record<string, unknown>;

const DEFAULT_STATE: CameraLoadState = {
  status: 'idle',
  message: 'Camera layer is idle.',
  totalRecords: 0,
  validRecords: 0,
  invalidRecords: 0
};

export class WildfireCameraDataService {
  private options: WildfireCameraDataSourceOptions;

  constructor(options: WildfireCameraDataSourceOptions = {}) {
    this.options = options;
  }

  async load(): Promise<CameraLoadResult> {
    let records: unknown[];

    try {
      records = await this.fetchRawRecords();
    } catch (error) {
      return {
        cameras: [],
        state: {
          ...DEFAULT_STATE,
          status: 'unavailable',
          message: `Camera data is unavailable: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }

    const { cameras, invalidRecords } = normalizeCameraRecords(records);
    const status: CameraLoadStatus = cameras.length === 0
      ? 'empty'
      : invalidRecords > 0
        ? 'partial-invalid'
        : 'loaded';

    return {
      cameras,
      state: {
        status,
        message: createLoadMessage(status, cameras.length, invalidRecords),
        loadedAt: new Date(),
        totalRecords: records.length,
        validRecords: cameras.length,
        invalidRecords
      }
    };
  }

  private async fetchRawRecords(): Promise<unknown[]> {
    if (this.options.provider) {
      return this.options.provider();
    }

    if (!this.options.url) {
      throw new Error('No wildfire camera data source URL or provider configured.');
    }

    const fetcher = this.options.fetcher ?? globalThis.fetch;
    if (!fetcher) {
      throw new Error('No fetch implementation is available.');
    }

    const controller = new AbortController();
    const timeout = this.options.timeoutMs
      ? setTimeout(() => controller.abort(), this.options.timeoutMs)
      : undefined;

    try {
      const response = await fetcher(this.options.url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      return extractRecords(await response.json());
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

export class WildfireCameraLayer {
  readonly dataSource: CustomDataSource;

  private viewer: Viewer;
  private service: WildfireCameraDataService;
  private options: WildfireCameraLayerOptions;
  private state: CameraLoadState = DEFAULT_STATE;
  private selectedEntity: Entity | null = null;
  private clickHandler?: ScreenSpaceEventHandler;
  private clusterMembership = new Map<string, Entity[]>();

  constructor(viewer: Viewer, options: WildfireCameraLayerOptions = {}) {
    this.viewer = viewer;
    this.options = options;
    this.service = new WildfireCameraDataService(options);
    this.dataSource = new CustomDataSource(options.name ?? 'Wildfire Cameras');
    this.configureClustering();
    this.viewer.dataSources.add(this.dataSource);
    this.installSelectionHandler();
  }

  getState(): CameraLoadState {
    return this.state;
  }

  async refresh(): Promise<CameraLoadResult> {
    const previousCameras = this.getCameras();
    this.setState({
      ...this.state,
      status: 'loading',
      message: 'Loading wildfire camera data...'
    });

    const result = await this.service.load();

    if (result.state.status === 'unavailable' && previousCameras.length > 0) {
      this.setState({
        ...result.state,
        status: 'stale',
        staleSince: result.state.loadedAt ?? new Date(),
        validRecords: previousCameras.length,
        message: 'Camera data could not be refreshed. Showing last loaded cameras.'
      });
      return { cameras: previousCameras, state: this.state };
    }

    this.render(result.cameras);
    this.setState(result.state);
    return result;
  }

  render(cameras: WildfireCamera[]): void {
    this.selectedEntity = null;
    this.clusterMembership.clear();
    this.dataSource.entities.removeAll();

    for (const camera of cameras) {
      this.dataSource.entities.add(createCameraEntity(camera));
    }
  }

  getCameras(): WildfireCamera[] {
    return this.dataSource.entities.values
      .map(entity => getEntityCamera(entity))
      .filter((camera): camera is WildfireCamera => Boolean(camera));
  }

  selectCamera(id: string): WildfireCamera | undefined {
    const entity = this.dataSource.entities.getById(cameraEntityId(id));
    if (!entity) return undefined;
    return this.applyCameraSelection(entity);
  }

  destroy(): void {
    if (this.clickHandler && !this.clickHandler.isDestroyed()) {
      this.clickHandler.destroy();
    }
    this.viewer.dataSources.remove(this.dataSource, true);
  }

  private configureClustering(): void {
    const clustering = new EntityCluster({
      enabled: true,
      pixelRange: this.options.clusterPixelRange ?? 56,
      minimumClusterSize: this.options.minimumClusterSize ?? 3,
      clusterBillboards: false,
      clusterLabels: true,
      clusterPoints: true
    });

    clustering.clusterEvent.addEventListener((entities, cluster) => {
      const key = entities.map(entity => entity.id).sort().join('|');
      this.clusterMembership.set(key, entities);

      cluster.label.show = true;
      cluster.label.text = entities.length.toLocaleString();
      cluster.label.fillColor = Color.WHITE;
      cluster.label.outlineColor = Color.BLACK;
      cluster.label.outlineWidth = 3;
      cluster.label.style = LabelStyle.FILL_AND_OUTLINE;
      cluster.point.show = true;
      cluster.point.pixelSize = Math.min(52, 26 + entities.length.toString().length * 6);
      cluster.point.color = Color.ORANGE.withAlpha(0.9);
      cluster.point.outlineColor = Color.WHITE;
      cluster.point.outlineWidth = 2;
      cluster.billboard.show = false;
    });

    this.dataSource.clustering = clustering;
  }

  private installSelectionHandler(): void {
    this.clickHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.clickHandler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(event.position);
      const entity = picked?.id instanceof Entity ? picked.id : undefined;

      if (entity && getEntityCamera(entity)) {
        this.applyCameraSelection(entity);
        return;
      }

      const clusterEntities = this.findClusterEntities(entity);
      if (clusterEntities.length > 0) {
        this.options.onClusterSelected?.(clusterEntities);
        this.viewer.flyTo(clusterEntities);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  private findClusterEntities(entity: Entity | undefined): Entity[] {
    if (!entity) return [];
    const match = [...this.clusterMembership.values()].find(entities => entities.some(candidate => candidate.id === entity.id));
    return match ?? [];
  }

  private applyCameraSelection(entity: Entity): WildfireCamera | undefined {
    const camera = getEntityCamera(entity);
    if (!camera) return undefined;

    if (this.selectedEntity?.point) {
      (this.selectedEntity.point as any).pixelSize = 11;
      (this.selectedEntity.point as any).outlineColor = Color.WHITE;
    }

    if (entity.point) {
      (entity.point as any).pixelSize = 17;
      (entity.point as any).outlineColor = Color.YELLOW;
    }

    this.selectedEntity = entity;
    this.viewer.selectedEntity = entity;
    this.options.onCameraSelected?.(camera, entity);
    return camera;
  }

  private setState(state: CameraLoadState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }
}

export function normalizeCameraRecords(records: unknown[]): { cameras: WildfireCamera[]; invalidRecords: number } {
  const cameras = new Map<string, WildfireCamera>();
  let invalidRecords = 0;

  for (const rawRecord of records) {
    const camera = normalizeCameraRecord(rawRecord as RawCamera);
    if (!camera) {
      invalidRecords += 1;
      continue;
    }
    cameras.set(camera.id, camera);
  }

  return { cameras: [...cameras.values()], invalidRecords };
}

export function normalizeCameraRecord(raw: RawCamera): WildfireCamera | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const properties = (raw.properties && typeof raw.properties === 'object' ? raw.properties : raw) as RawCamera;
  const geometry = raw.geometry as { coordinates?: unknown[] } | undefined;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : undefined;

  const longitude = toNumber(firstDefined(
    properties.longitude,
    properties.lon,
    properties.lng,
    properties.x,
    coordinates?.[0]
  ));
  const latitude = toNumber(firstDefined(
    properties.latitude,
    properties.lat,
    properties.y,
    coordinates?.[1]
  ));

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return undefined;

  const idValue = firstDefined(properties.id, properties.cameraId, properties.camera_id, properties.uuid, properties.name);
  const id = sanitizeId(idValue ?? `${latitude.toFixed(6)},${longitude.toFixed(6)}`);
  const name = String(firstDefined(properties.name, properties.displayName, properties.title, properties.cameraName, id) ?? id);

  return {
    id,
    name,
    latitude,
    longitude,
    altitude: toNumber(firstDefined(properties.altitude, properties.height, coordinates?.[2])),
    status: stringifyOptional(firstDefined(properties.status, properties.operationalStatus, properties.state)),
    agency: stringifyOptional(firstDefined(properties.agency, properties.owner, properties.provider)),
    feedUrl: stringifyOptional(firstDefined(properties.feedUrl, properties.feed_url, properties.url, properties.streamUrl)),
    updatedAt: stringifyOptional(firstDefined(properties.updatedAt, properties.updated_at, properties.lastUpdated)),
    metadata: properties
  };
}

export function extractRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const objectPayload = payload as Record<string, unknown>;
  for (const key of ['features', 'cameras', 'data', 'results', 'items']) {
    if (Array.isArray(objectPayload[key])) return objectPayload[key] as unknown[];
  }

  return [];
}

function createCameraEntity(camera: WildfireCamera): Entity.ConstructorOptions {
  return {
    id: cameraEntityId(camera.id),
    name: camera.name,
    position: Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.altitude ?? 0),
    description: createCameraDescription(camera),
    properties: { wildfireCamera: camera },
    point: {
      pixelSize: 11,
      color: camera.status?.toLowerCase().includes('offline') ? Color.GRAY : Color.RED,
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: new NearFarScalar(1_000, 1.25, 2_000_000, 0.6)
    },
    label: {
      text: camera.name,
      font: '13px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.CENTER,
      pixelOffset: new Cartesian2(14, 0),
      distanceDisplayCondition: new DistanceDisplayCondition(0, 250_000)
    }
  };
}

function createCameraDescription(camera: WildfireCamera): string {
  const rows = [
    ['Name', camera.name],
    ['Status', camera.status],
    ['Agency', camera.agency],
    ['Feed', camera.feedUrl ? `<a href="${escapeHtml(camera.feedUrl)}" target="_blank" rel="noopener noreferrer">Open feed</a>` : undefined],
    ['Updated', camera.updatedAt],
    ['Coordinates', `${camera.latitude.toFixed(5)}, ${camera.longitude.toFixed(5)}`]
  ].filter(([, value]) => Boolean(value));

  return `<table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(String(label))}</th><td>${String(value)}</td></tr>`).join('')}</table>`;
}

function getEntityCamera(entity: Entity): WildfireCamera | undefined {
  const raw = entity.properties?.getValue ? entity.properties.getValue().wildfireCamera : undefined;
  return raw as WildfireCamera | undefined;
}

function cameraEntityId(id: string): string {
  return `wildfire-camera-${id}`;
}

function createLoadMessage(status: CameraLoadStatus, validRecords: number, invalidRecords: number): string {
  switch (status) {
    case 'empty':
      return 'No wildfire cameras are available for the current source.';
    case 'partial-invalid':
      return `Loaded ${validRecords} wildfire cameras; ignored ${invalidRecords} invalid records.`;
    case 'loaded':
      return `Loaded ${validRecords} wildfire cameras.`;
    default:
      return 'Camera data state changed.';
  }
}

function firstDefined(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isValidLatitude(value: number | undefined): value is number {
  return value !== undefined && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | undefined): value is number {
  return value !== undefined && value >= -180 && value <= 180;
}

function sanitizeId(value: unknown): string {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'camera';
}

function stringifyOptional(value: unknown): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : String(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
