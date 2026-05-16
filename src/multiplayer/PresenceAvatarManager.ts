import * as Cesium from 'cesium';
import type { PresenceState } from './types.js';

interface PeerAvatar {
  spriteEntity: Cesium.Entity;
  frustumEntity: Cesium.Entity;
  lastState: PresenceState | null;
}

export interface PresenceAvatarManagerOptions {
  selfPeerId: string;
}

export class PresenceAvatarManager {
  private readonly viewer: Cesium.Viewer;
  private readonly selfPeerId: string;
  private readonly avatars = new Map<string, PeerAvatar>();

  constructor(viewer: Cesium.Viewer, opts: PresenceAvatarManagerOptions) {
    this.viewer = viewer;
    this.selfPeerId = opts.selfPeerId;
  }

  addPeer(peerId: string, displayName: string, avatarUrl: string): void {
    if (this.avatars.has(peerId)) return;

    const initials = (displayName || '?').slice(0, 2).toUpperCase();
    const spriteCanvas = this.makeSpriteCanvas(initials, avatarUrl);

    const spriteEntity = this.viewer.entities.add({
      id: `presence-sprite-${peerId}`,
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
      billboard: {
        image: spriteCanvas,
        width: 36,
        height: 36,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e3, 1.0, 8e6, 0.5),
      },
      label: {
        text: displayName,
        font: '11px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -42),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e3, 1.0, 8e6, 0.3),
      },
      show: false,
    });

    // Frustum cone — only visible at city scale (< 100km altitude)
    const frustumEntity = this.viewer.entities.add({
      id: `presence-frustum-${peerId}`,
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
      show: false,
    });

    this.avatars.set(peerId, { spriteEntity, frustumEntity, lastState: null });
  }

  updatePresence(peerId: string, state: PresenceState): void {
    let avatar = this.avatars.get(peerId);
    if (!avatar) {
      this.addPeer(peerId, `Peer-${peerId.slice(0, 4)}`, '');
      avatar = this.avatars.get(peerId)!;
    }

    avatar.lastState = state;

    const position = Cesium.Cartesian3.fromDegrees(state.longitude, state.latitude, state.altitude);
    (avatar.spriteEntity.position as Cesium.ConstantPositionProperty).setValue(position);
    (avatar.frustumEntity.position as Cesium.ConstantPositionProperty).setValue(position);
    avatar.spriteEntity.show = true;

    const altitudeM = state.altitude;
    avatar.frustumEntity.show = altitudeM < 100_000;
  }

  removePeer(peerId: string): void {
    const avatar = this.avatars.get(peerId);
    if (!avatar) return;
    this.viewer.entities.remove(avatar.spriteEntity);
    this.viewer.entities.remove(avatar.frustumEntity);
    this.avatars.delete(peerId);
  }

  setPixelOffset(peerId: string, offset: Cesium.Cartesian2): void {
    const avatar = this.avatars.get(peerId);
    if (!avatar) return;
    if (avatar.spriteEntity.billboard) {
      (avatar.spriteEntity.billboard.pixelOffset as Cesium.ConstantProperty).setValue(offset);
    }
  }

  getLastState(peerId: string): PresenceState | null {
    return this.avatars.get(peerId)?.lastState ?? null;
  }

  getSpriteEntity(peerId: string): Cesium.Entity | undefined {
    return this.avatars.get(peerId)?.spriteEntity;
  }

  private makeSpriteCanvas(initials: string, avatarUrl: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 36;
    canvas.height = 36;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(18, 18, 17, 0, Math.PI * 2);
    ctx.fillStyle = '#1565C0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 18, 18);

    if (avatarUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(18, 18, 15, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 3, 3, 30, 30);
        ctx.restore();
      };
      img.src = avatarUrl;
    }

    return canvas;
  }

  destroy(): void {
    for (const peerId of this.avatars.keys()) {
      this.removePeer(peerId);
    }
  }
}
