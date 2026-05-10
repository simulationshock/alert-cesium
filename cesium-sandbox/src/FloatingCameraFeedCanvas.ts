import { Cartesian2, Cartesian3, Color, Entity, HorizontalOrigin, VerticalOrigin, Viewer } from 'cesium';
import type { FeedState, ResolvedWildfireCamera } from './types';

export interface FloatingCameraFeedOptions {
  width?: number;
  height?: number;
  pixelOffset?: Cartesian2;
}

/**
 * Draws a selected live camera feed to a canvas and exposes it as a floating Cesium billboard.
 * If video loading fails, an explicit Feed Offline frame is rendered instead.
 */
export class FloatingCameraFeedCanvas extends EventTarget {
  private readonly viewer: Viewer;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly options: Required<FloatingCameraFeedOptions>;
  private entity?: Entity;
  private frameRequest?: number;
  private state?: FeedState;

  constructor(viewer: Viewer, options: FloatingCameraFeedOptions = {}) {
    super();
    this.viewer = viewer;
    this.options = {
      width: options.width ?? 640,
      height: options.height ?? 360,
      pixelOffset: options.pixelOffset ?? new Cartesian2(0, -140)
    };
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    this.context = context;
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async open(camera: ResolvedWildfireCamera): Promise<FeedState> {
    this.close();
    this.state = { camera, status: 'loading' };
    this.drawLoading(camera);
    this.entity = this.createEntity(camera);
    this.viewer.entities.add(this.entity);

    if (!camera.streamUrl) {
      this.setOffline(camera, 'No stream URL available.');
      return this.state;
    }

    try {
      this.video.src = camera.streamUrl;
      await this.video.play();
      this.state = { camera, status: 'playing' };
      this.dispatchEvent(new CustomEvent('feedstate', { detail: this.state }));
      this.drawVideoLoop(camera);
    } catch {
      this.setOffline(camera, 'Feed Offline');
    }

    return this.state;
  }

  close(): void {
    if (this.frameRequest !== undefined) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = undefined;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    if (this.entity) this.viewer.entities.remove(this.entity);
    this.entity = undefined;
    if (this.state) {
      this.state = { ...this.state, status: 'closed' };
      this.dispatchEvent(new CustomEvent('feedstate', { detail: this.state }));
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getState(): FeedState | undefined {
    return this.state;
  }

  private createEntity(camera: ResolvedWildfireCamera): Entity {
    return new Entity({
      id: `wildfire-camera-feed:${camera.id}`,
      name: `${camera.name} live feed`,
      position: Cartesian3.fromDegrees(camera.longitude, camera.latitude, (camera.height ?? 0) + 350),
      billboard: {
        image: this.canvas,
        width: 320,
        height: 180,
        pixelOffset: this.options.pixelOffset,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: camera.name,
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        pixelOffset: new Cartesian2(this.options.pixelOffset.x, this.options.pixelOffset.y - 105),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  }

  private drawVideoLoop(camera: ResolvedWildfireCamera): void {
    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.drawChrome(camera.name, 'LIVE');
    (this.entity?.billboard?.image as any)?.setValue?.(this.canvas);
    this.frameRequest = requestAnimationFrame(() => this.drawVideoLoop(camera));
  }

  private drawLoading(camera: ResolvedWildfireCamera): void {
    this.drawPanel(camera.name, 'Loading feed…', '#203040');
  }

  private setOffline(camera: ResolvedWildfireCamera, message: string): void {
    this.state = { camera, status: 'offline', message };
    this.drawPanel(camera.name, message, '#3d1f1f');
    (this.entity?.billboard?.image as any)?.setValue?.(this.canvas);
    this.dispatchEvent(new CustomEvent('feedstate', { detail: this.state }));
  }

  private drawPanel(title: string, message: string, background: string): void {
    this.context.fillStyle = background;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = '#ffffff';
    this.context.font = 'bold 28px sans-serif';
    this.context.fillText(title, 24, 54);
    this.context.font = '22px sans-serif';
    this.context.fillText(message, 24, 112);
    this.drawChrome(title, message.toUpperCase());
  }

  private drawChrome(_title: string, badge: string): void {
    this.context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    this.context.fillRect(0, 0, this.canvas.width, 38);
    this.context.fillStyle = '#ffffff';
    this.context.font = 'bold 18px sans-serif';
    this.context.fillText('Wildfire Camera', 16, 25);
    this.context.fillStyle = badge === 'LIVE' ? '#e53935' : '#9e9e9e';
    this.context.fillRect(this.canvas.width - 92, 9, 72, 22);
    this.context.fillStyle = '#ffffff';
    this.context.font = 'bold 13px sans-serif';
    this.context.fillText(badge, this.canvas.width - 82, 25);
  }
}
