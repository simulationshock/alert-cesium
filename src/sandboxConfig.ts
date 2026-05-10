import { Camera, Cartesian3, Math as CesiumMath } from 'cesium';

export interface SandboxLocation {
  name: string;
  latitude: number;
  longitude: number;
  heightMeters: number;
  headingDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
}

export const SAN_DIEGO_SANDBOX_LOCATION: SandboxLocation = {
  name: 'San Diego, California',
  latitude: 32.7157,
  longitude: -117.1611,
  heightMeters: 12000,
  headingDegrees: 0,
  pitchDegrees: -55,
  rollDegrees: 0
};

export function sanDiegoDestination(location = SAN_DIEGO_SANDBOX_LOCATION): Cartesian3 {
  return Cartesian3.fromDegrees(location.longitude, location.latitude, location.heightMeters);
}

export function centerCameraOnSanDiego(camera: Camera, location = SAN_DIEGO_SANDBOX_LOCATION): void {
  camera.setView({
    destination: sanDiegoDestination(location),
    orientation: {
      heading: CesiumMath.toRadians(location.headingDegrees),
      pitch: CesiumMath.toRadians(location.pitchDegrees),
      roll: CesiumMath.toRadians(location.rollDegrees)
    }
  });
}
