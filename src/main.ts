import { Camera } from 'cesium';
import { centerCameraOnSanDiego } from './sandboxConfig.js';

export interface SandboxBootstrapUser {
  id: string;
  displayName?: string;
  primaryVerifiedEmail?: string;
}

export interface SandboxBootstrapOptions {
  camera: Camera;
  user: SandboxBootstrapUser;
}

export function initializeAuthenticatedSanDiegoSandbox(options: SandboxBootstrapOptions): void {
  if (!options.user?.id) {
    throw new Error('An authenticated user is required before initializing the Cesium sandbox.');
  }
  centerCameraOnSanDiego(options.camera);
}
