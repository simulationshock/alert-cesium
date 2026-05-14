import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import type { FlightPoint, LiveFlight, LiveFlightMarkerManagerOptions } from './types.js';

const DEFAULT_MAX_ALT = 2_000_000; // hide above 2 000 km camera altitude

/** Renders live ADS-B flight positions as rotating aircraft icons with click-to-show trajectory. */
export class LiveFlightMarkerManager {
  private readonly viewer: Viewer;
  private readonly onSelect: (flight: LiveFlight | null) => void;
  private readonly maxAlt: number;
  private readonly entities  = new Map<string, ReturnType<Viewer['entities']['add']>>();
  private readonly flightMap = new WeakMap<object, LiveFlight>();
  private trackEntity: ReturnType<Viewer['entities']['add']> | undefined;
  private selectedIcao24: string | undefined;
  private getTrack?: (icao24: string) => FlightPoint[];
  private readonly handler: ScreenSpaceEventHandler;
  private readonly planeImg: HTMLCanvasElement;
  private readonly heliImg:  HTMLCanvasElement;
  private _visible = true;

  constructor(viewer: Viewer, options: LiveFlightMarkerManagerOptions = {}) {
    this.viewer   = viewer;
    this.onSelect = options.onSelect ?? (() => {});
    this.maxAlt   = options.visibilityMaxAltitude ?? DEFAULT_MAX_ALT;
    this.planeImg = buildAircraftCanvas('plane');
    this.heliImg  = buildAircraftCanvas('helicopter');

    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction(
      (e: ScreenSpaceEventHandler.PositionedEvent) => this._onClick(e),
      ScreenSpaceEventType.LEFT_CLICK,
    );
    viewer.camera.changed.addEventListener(this._syncVisibility, this);
  }

  setTrackProvider(fn: (icao24: string) => FlightPoint[]): void {
    this.getTrack = fn;
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    for (const e of this.entities.values()) e.show = visible && this._underMaxAlt();
    if (this.trackEntity) this.trackEntity.show = visible && this._underMaxAlt();
  }

  get visible(): boolean { return this._visible; }

  update(flights: LiveFlight[]): void {
    const show = this._visible && this._underMaxAlt();
    const seen = new Set<string>();

    for (const f of flights) {
      const pos      = Cartesian3.fromDegrees(f.longitude, f.latitude, Math.max(0, f.altitude));
      const rotation = CesiumMath.toRadians(-f.heading); // CW heading → CCW screen rotation
      const image    = f.kind === 'helicopter' ? this.heliImg : this.planeImg;

      let entity = this.entities.get(f.icao24);
      if (!entity) {
        entity = this.viewer.entities.add({
          id: `lf-${f.icao24}`,
          position: new ConstantPositionProperty(pos),
          show,
          billboard: {
            image,
            rotation,
            width: 28,
            height: 28,
            verticalOrigin: VerticalOrigin.CENTER,
            scaleByDistance:        new NearFarScalar(5e4, 1.2, 1.6e6, 0.4),
            translucencyByDistance: new NearFarScalar(1.6e6, 1.0, 2e6, 0.0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: f.callsign,
            font: '10px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.TOP,
            pixelOffset: new Cartesian2(0, 15),
            scaleByDistance:        new NearFarScalar(5e4, 1.1, 4e5, 0.5),
            translucencyByDistance: new NearFarScalar(3e5, 1.0, 8e5, 0.0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        this.entities.set(f.icao24, entity);
      } else {
        (entity.position as ConstantPositionProperty).setValue(pos);
        entity.billboard!.rotation = new ConstantProperty(rotation);
        entity.show = show;
      }
      this.flightMap.set(entity, f);
      seen.add(f.icao24);
    }

    // Remove entities for aircraft that left the bbox
    for (const [id, entity] of this.entities) {
      if (!seen.has(id)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(id);
        if (this.selectedIcao24 === id) { this._clearTrack(); this.selectedIcao24 = undefined; this.onSelect(null); }
      }
    }

    // Refresh polyline if a flight is selected (new track points may have arrived)
    if (this.selectedIcao24) this._renderTrack(this.selectedIcao24);
  }

  destroy(): void {
    this.handler.destroy();
    this.viewer.camera.changed.removeEventListener(this._syncVisibility, this);
    for (const e of this.entities.values()) this.viewer.entities.remove(e);
    this.entities.clear();
    this._clearTrack();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _underMaxAlt(): boolean {
    return this.viewer.camera.positionCartographic.height <= this.maxAlt;
  }

  private readonly _syncVisibility = (): void => {
    const show = this._visible && this._underMaxAlt();
    for (const e of this.entities.values()) e.show = show;
    if (this.trackEntity) this.trackEntity.show = show;
  };

  private _onClick(event: ScreenSpaceEventHandler.PositionedEvent): void {
    const picked = this.viewer.scene.pick(event.position);
    if (!picked?.id) return; // empty space — don't disturb other handlers
    const flight = this.flightMap.get(picked.id as object);
    if (!flight) return; // different entity type — ignore

    if (this.selectedIcao24 === flight.icao24) {
      this._clearTrack();
      this.selectedIcao24 = undefined;
      this.onSelect(null);
    } else {
      this.selectedIcao24 = flight.icao24;
      this._renderTrack(flight.icao24);
      this.onSelect(flight);
    }
  }

  private _renderTrack(icao24: string): void {
    this._clearTrack();
    const points = this.getTrack?.(icao24) ?? [];
    if (points.length < 2) return;

    const positions = points.map(p =>
      Cartesian3.fromDegrees(p.longitude, p.latitude, Math.max(0, p.altitude))
    );
    this.trackEntity = this.viewer.entities.add({
      polyline: {
        positions,
        width: 2,
        material: new PolylineGlowMaterialProperty({ glowPower: 0.3, color: Color.YELLOW.withAlpha(0.85) }),
        clampToGround: false,
        arcType: ArcType.NONE,
      },
    });
  }

  private _clearTrack(): void {
    if (this.trackEntity) {
      this.viewer.entities.remove(this.trackEntity);
      this.trackEntity = undefined;
    }
  }
}

/** Top-down aircraft silhouette (nose pointing up = north). Plane=blue, helicopter=amber. */
function buildAircraftCanvas(kind: 'plane' | 'helicopter'): HTMLCanvasElement {
  const SIZE = 28;
  const c    = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx  = c.getContext('2d')!;
  const cx   = SIZE / 2;

  const fill   = kind === 'plane' ? '#81d4fa' : '#ffcc80';
  const stroke = kind === 'plane' ? '#0277bd' : '#e65100';

  ctx.save();
  ctx.translate(cx, cx);
  ctx.fillStyle   = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur  = 3;

  // Fuselage + wings + tail, nose at top (north)
  ctx.beginPath();
  ctx.moveTo(0, -11);    // nose
  ctx.lineTo(2, -3);
  ctx.lineTo(11,  3);    // right wing tip
  ctx.lineTo( 9,  5);
  ctx.lineTo( 2.5, 2);
  ctx.lineTo( 3,  9);    // right tail fin
  ctx.lineTo( 0,  7);
  ctx.lineTo(-3,  9);    // left tail fin
  ctx.lineTo(-2.5, 2);
  ctx.lineTo(-9,   5);
  ctx.lineTo(-11,  3);   // left wing tip
  ctx.lineTo(-2,  -3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (kind === 'helicopter') {
    // Main rotor hub dot
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = stroke;
    ctx.beginPath();
    ctx.arc(0, -7, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return c;
}
