import type {
  Annotation,
  AnnotationType,
  StrokeGeometry,
  LineGeometry,
  CircleGeometry,
  RectGeometry,
  PinGeometry,
} from './types.js';

type DrawTool = AnnotationType | null;

import * as Cesium from 'cesium';

export interface AnnotationManagerOptions {
  authorPeerId: string;
  onComplete?: (annotation: Annotation) => void;
}

interface DrawState {
  tool: DrawTool;
  color: string;
  isDrawing: boolean;
  startCartographic: [number, number] | null;
  currentPos: [number, number] | null;
  points: [number, number][];
  previewEntity: unknown | null;
}

export class AnnotationManager {
  private readonly viewer: InstanceType<typeof Cesium.Viewer>;
  private readonly authorPeerId: string;
  onComplete?: (annotation: Annotation) => void;

  private readonly annotations = new Map<string, { entity: unknown; annotation: Annotation }>();
  private readonly draw: DrawState = {
    tool: null,
    color: '#ff0000',
    isDrawing: false,
    startCartographic: null,
    currentPos: null,
    points: [],
    previewEntity: null,
  };

  private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private pointerUpHandler: ((e: PointerEvent) => void) | null = null;

  constructor(viewer: InstanceType<typeof Cesium.Viewer>, opts: AnnotationManagerOptions) {
    this.viewer = viewer;
    this.authorPeerId = opts.authorPeerId;
    this.onComplete = opts.onComplete;
    this.attachListeners();
  }

  setTool(tool: DrawTool): void {
    this.draw.tool = tool;
    if (!tool) this.cancelDraw();
  }

  setColor(hex: string): void {
    this.draw.color = hex;
  }

  private attachListeners(): void {
    const canvas = this.viewer.scene.canvas;

    this.pointerDownHandler = (e: PointerEvent) => {
      if (!this.draw.tool) return;
      e.preventDefault();
      const pos = this.pickPosition(e.clientX, e.clientY);
      if (!pos) return;

      this.draw.isDrawing = true;
      this.draw.startCartographic = pos;
      this.draw.points = [pos];

      if (this.draw.tool === 'pin') {
        this.finishAnnotation([pos]);
        this.draw.isDrawing = false;
      }
    };

    this.pointerMoveHandler = (e: PointerEvent) => {
      if (!this.draw.isDrawing || !this.draw.tool) return;
      const pos = this.pickPosition(e.clientX, e.clientY);
      if (!pos) return;

      this.draw.currentPos = pos;
      if (this.draw.tool === 'stroke') {
        this.draw.points.push(pos);
      }
      // Create the preview entity once; CallbackProperty keeps it live each frame.
      if (!this.draw.previewEntity) {
        this.createPreviewEntity();
      }
    };

    this.pointerUpHandler = (e: PointerEvent) => {
      if (!this.draw.isDrawing) return;
      const pos = this.pickPosition(e.clientX, e.clientY);
      if (pos) this.draw.points.push(pos);
      this.draw.isDrawing = false;
      this.finishAnnotation(this.draw.points);
      this.cancelPreview();
      this.draw.points = [];
      this.draw.startCartographic = null;
      this.draw.currentPos = null;
    };

    canvas.addEventListener('pointerdown', this.pointerDownHandler);
    canvas.addEventListener('pointermove', this.pointerMoveHandler);
    canvas.addEventListener('pointerup', this.pointerUpHandler);
  }

  private pickPosition(clientX: number, clientY: number): [number, number] | null {
    const canvas = this.viewer.scene.canvas;
    const rect = canvas.getBoundingClientRect();
    const screenPos = new Cesium.Cartesian2(clientX - rect.left, clientY - rect.top);
    const cartesian = this.viewer.scene.globe.pick(
      this.viewer.camera.getPickRay(screenPos)!,
      this.viewer.scene
    ) ?? this.viewer.camera.pickEllipsoid(screenPos);
    if (!cartesian) return null;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    return [
      Cesium.Math.toDegrees(carto.longitude),
      Cesium.Math.toDegrees(carto.latitude),
    ];
  }

  private createPreviewEntity(): void {
    const { tool, color, startCartographic } = this.draw;
    if (!tool || !startCartographic) return;

    const draw = this.draw;
    const cesiumColor = Cesium.Color.fromCssColorString(color).withAlpha(0.5);
    const outlineColor = Cesium.Color.fromCssColorString(color);

    if (tool === 'line') {
      this.draw.previewEntity = this.viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            if (!draw.startCartographic || !draw.currentPos) return [];
            return Cesium.Cartesian3.fromDegreesArray([...draw.startCartographic, ...draw.currentPos]);
          }, false),
          width: 2,
          material: new Cesium.ColorMaterialProperty(cesiumColor),
          clampToGround: true,
        },
      });
    } else if (tool === 'stroke') {
      this.draw.previewEntity = this.viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            if (draw.points.length < 2) return [];
            return Cesium.Cartesian3.fromDegreesArray(draw.points.flatMap(p => p));
          }, false),
          width: 2,
          material: new Cesium.ColorMaterialProperty(cesiumColor),
          clampToGround: true,
        },
      });
    } else if (tool === 'circle') {
      this.draw.previewEntity = this.viewer.entities.add({
        position: new Cesium.CallbackProperty(() =>
          draw.startCartographic ? Cesium.Cartesian3.fromDegrees(...draw.startCartographic) : new Cesium.Cartesian3()
        , false) as unknown as Cesium.PositionProperty,
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(() => {
            if (!draw.startCartographic || !draw.currentPos) return 1;
            return Math.max(1, Cesium.Cartesian3.distance(
              Cesium.Cartesian3.fromDegrees(...draw.startCartographic),
              Cesium.Cartesian3.fromDegrees(...draw.currentPos),
            ));
          }, false),
          semiMinorAxis: new Cesium.CallbackProperty(() => {
            if (!draw.startCartographic || !draw.currentPos) return 1;
            return Math.max(1, Cesium.Cartesian3.distance(
              Cesium.Cartesian3.fromDegrees(...draw.startCartographic),
              Cesium.Cartesian3.fromDegrees(...draw.currentPos),
            ));
          }, false),
          material: cesiumColor,
          outline: true,
          outlineColor,
        },
      });
    } else if (tool === 'rectangle') {
      this.draw.previewEntity = this.viewer.entities.add({
        rectangle: {
          coordinates: new Cesium.CallbackProperty(() => {
            if (!draw.startCartographic || !draw.currentPos) return Cesium.Rectangle.fromDegrees(0, 0, 0.001, 0.001);
            const [sx, sy] = draw.startCartographic;
            const [cx, cy] = draw.currentPos;
            return Cesium.Rectangle.fromDegrees(
              Math.min(sx, cx), Math.min(sy, cy),
              Math.max(sx, cx), Math.max(sy, cy),
            );
          }, false),
          material: cesiumColor,
          outline: true,
          outlineColor,
        },
      });
    }
  }

  private cancelPreview(): void {
    if (this.draw.previewEntity) {
      this.viewer.entities.remove(this.draw.previewEntity as Parameters<typeof this.viewer.entities.remove>[0]);
      this.draw.previewEntity = null;
    }
  }

  private finishAnnotation(points: [number, number][]): void {
    const { tool, color } = this.draw;
    if (!tool || points.length === 0) return;

    let geometry: Annotation['geometry'];

    if (tool === 'pin') {
      geometry = { point: points[0] } as PinGeometry;
    } else if (tool === 'stroke') {
      if (points.length < 2) return;
      geometry = { points } as StrokeGeometry;
    } else if (tool === 'line') {
      if (points.length < 2) return;
      geometry = { start: points[0], end: points[points.length - 1] } as LineGeometry;
    } else if (tool === 'circle') {
      if (points.length < 2) return;
      const centerCart = Cesium.Cartesian3.fromDegrees(...points[0]);
      const edgeCart = Cesium.Cartesian3.fromDegrees(...points[points.length - 1]);
      const radiusKm = Cesium.Cartesian3.distance(centerCart, edgeCart) / 1000;
      geometry = { center: points[0], radiusKm } as CircleGeometry;
    } else if (tool === 'rectangle') {
      geometry = {
        sw: [Math.min(points[0][0], points[points.length-1][0]), Math.min(points[0][1], points[points.length-1][1])],
        ne: [Math.max(points[0][0], points[points.length-1][0]), Math.max(points[0][1], points[points.length-1][1])],
      } as RectGeometry;
    } else {
      return;
    }

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      annotationType: tool,
      geometry,
      color,
      authorPeerId: this.authorPeerId,
      createdAt: Date.now(),
    };

    this.addLocalEntity(annotation);
    this.onComplete?.(annotation);
  }

  private addLocalEntity(annotation: Annotation): void {
    const entity = this.createEntity(annotation);
    if (entity) this.annotations.set(annotation.id, { entity, annotation });
  }

  private createEntity(annotation: Annotation): unknown | null {
    const color = Cesium.Color.fromCssColorString(annotation.color);
    const { geometry, annotationType: type } = annotation;

    if (type === 'pin') {
      const { point } = geometry as PinGeometry;
      return this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(...point),
        billboard: {
          image: this.makePinCanvas(annotation.color),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 8e6, 0.4),
        },
      });
    } else if (type === 'stroke' || type === 'line') {
      const pts = type === 'stroke'
        ? (geometry as StrokeGeometry).points.flatMap(p => p)
        : [(geometry as LineGeometry).start, (geometry as LineGeometry).end].flatMap(p => p);
      return this.viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(pts),
          width: 2,
          material: new Cesium.ColorMaterialProperty(color.withAlpha(0.85)),
          clampToGround: true,
        },
      });
    } else if (type === 'circle') {
      const { center, radiusKm } = geometry as CircleGeometry;
      return this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(...center),
        ellipse: {
          semiMajorAxis: radiusKm * 1000,
          semiMinorAxis: radiusKm * 1000,
          material: color.withAlpha(0.25),
          outline: true,
          outlineColor: color,
          outlineWidth: 2,
        },
      });
    } else if (type === 'rectangle') {
      const { sw, ne } = geometry as RectGeometry;
      return this.viewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(sw[0], sw[1], ne[0], ne[1]),
          material: color.withAlpha(0.25),
          outline: true,
          outlineColor: color,
          outlineWidth: 2,
        },
      });
    }
    return null;
  }

  private makePinCanvas(color: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(12, 12, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(12, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(8, 20);
    ctx.lineTo(12, 32);
    ctx.lineTo(16, 20);
    ctx.closePath();
    ctx.fill();
    return canvas;
  }

  addRemote(annotation: Annotation): void {
    if (this.annotations.has(annotation.id)) return;
    const entity = this.createEntity(annotation);
    if (entity) this.annotations.set(annotation.id, { entity, annotation });
  }

  removeAnnotation(id: string): void {
    const entry = this.annotations.get(id);
    if (!entry) return;
    this.viewer.entities.remove(entry.entity as Parameters<typeof this.viewer.entities.remove>[0]);
    this.annotations.delete(id);
  }

  clearAll(): void {
    for (const { entity } of this.annotations.values()) {
      this.viewer.entities.remove(entity as Parameters<typeof this.viewer.entities.remove>[0]);
    }
    this.annotations.clear();
  }

  getAllAnnotations(): Annotation[] {
    return [...this.annotations.values()].map(e => e.annotation);
  }

  private cancelDraw(): void {
    this.draw.isDrawing = false;
    this.draw.points = [];
    this.draw.startCartographic = null;
    this.draw.currentPos = null;
    this.cancelPreview();
  }

  destroy(): void {
    const canvas = this.viewer.scene.canvas;
    if (this.pointerDownHandler) canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    if (this.pointerMoveHandler) canvas.removeEventListener('pointermove', this.pointerMoveHandler);
    if (this.pointerUpHandler) canvas.removeEventListener('pointerup', this.pointerUpHandler);
    this.clearAll();
  }
}
