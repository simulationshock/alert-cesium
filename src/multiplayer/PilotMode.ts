import * as Cesium from 'cesium';
import type { PresenceState, PilotResult } from './types.js';
import type { DataChannels } from './DataChannels.js';
import type { PresenceAvatarManager } from './PresenceAvatarManager.js';

const LERP = 0.25;

export interface PilotModeOptions {
  selfPeerId: string;
  dataChannels: DataChannels;
  avatarManager: PresenceAvatarManager;
  getPeerIds: () => string[];
  getPresenceState: (peerId: string) => PresenceState | null;
}

export class PilotMode {
  private readonly viewer: Cesium.Viewer;
  private readonly opts: PilotModeOptions;
  private activePilotPeerId: string | null = null;
  private rafId: number | null = null;

  private readonly followerMap = new Map<string, string>(); // followerPeerId → targetPeerId
  private postUpdateRemover: (() => void) | null = null;

  constructor(viewer: Cesium.Viewer, opts: PilotModeOptions) {
    this.viewer = viewer;
    this.opts = opts;
    this.setupPostUpdate();
  }

  get currentPilotPeerId(): string | null {
    return this.activePilotPeerId;
  }

  followPeer(targetPeerId: string): PilotResult {
    if (targetPeerId === this.opts.selfPeerId) return 'peer-not-found';
    if (this.activePilotPeerId === targetPeerId) return 'already-following';
    if (this.opts.getPresenceState(targetPeerId) === null) return 'peer-not-found';

    this.stopFollow();
    this.activePilotPeerId = targetPeerId;
    this.startRAF();

    this.opts.dataChannels.sendPilotFollow(
      this.opts.getPeerIds(),
      this.opts.selfPeerId,
      targetPeerId,
    );

    return 'following';
  }

  leavePilotMode(): void {
    if (!this.activePilotPeerId) return;
    this.opts.dataChannels.sendPilotLeave(this.opts.getPeerIds(), this.opts.selfPeerId);
    this.stopFollow();
  }

  handlePilotFollow(followerPeerId: string, targetPeerId: string): void {
    this.followerMap.set(followerPeerId, targetPeerId);
    this.recalculateClustering();
  }

  handlePilotLeave(followerPeerId: string): void {
    this.followerMap.delete(followerPeerId);
    this.opts.avatarManager.setPixelOffset(followerPeerId, Cesium.Cartesian2.ZERO);
    this.recalculateClustering();
  }

  private startRAF(): void {
    const tick = () => {
      if (!this.activePilotPeerId) return;
      const state = this.opts.getPresenceState(this.activePilotPeerId);
      if (state) {
        const targetPos = Cesium.Cartesian3.fromDegrees(state.longitude, state.latitude, state.altitude);
        const cam = this.viewer.camera;
        const currentPos = cam.position.clone();
        const lerped = Cesium.Cartesian3.lerp(currentPos, targetPos, LERP, new Cesium.Cartesian3());
        cam.setView({
          destination: lerped,
          orientation: {
            heading: state.heading,
            pitch: state.pitch,
            roll: state.roll,
          },
        });
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopFollow(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.activePilotPeerId = null;
  }

  private setupPostUpdate(): void {
    const listener = () => this.recalculateClustering();
    this.viewer.scene.postUpdate.addEventListener(listener);
    this.postUpdateRemover = () => this.viewer.scene.postUpdate.removeEventListener(listener);
  }

  private recalculateClustering(): void {
    // Group followers by their pilot
    const pilotFollowers = new Map<string, string[]>(); // pilotPeerId → [followerPeerIds]
    for (const [follower, pilot] of this.followerMap) {
      if (!pilotFollowers.has(pilot)) pilotFollowers.set(pilot, []);
      pilotFollowers.get(pilot)!.push(follower);
    }

    // Pilot stays at center, followers radiate outward
    const RADIUS = 28;
    for (const [pilotPeerId, followers] of pilotFollowers) {
      this.opts.avatarManager.setPixelOffset(pilotPeerId, Cesium.Cartesian2.ZERO);
      const n = followers.length;
      followers.forEach((followerPeerId, i) => {
        const angle = (i / n) * 2 * Math.PI;
        const offset = new Cesium.Cartesian2(
          Math.round(RADIUS * Math.cos(angle)),
          Math.round(RADIUS * Math.sin(angle)),
        );
        this.opts.avatarManager.setPixelOffset(followerPeerId, offset);
      });
    }
  }

  destroy(): void {
    this.stopFollow();
    this.postUpdateRemover?.();
    this.postUpdateRemover = null;
    this.followerMap.clear();
  }
}
