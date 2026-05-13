// Re-export Cesium named symbols from the global loaded by the CDN <script> tag.
// This lets ESM dist files use `import { X } from 'cesium'` while Cesium itself
// is served as its normal IIFE bundle (which correctly sets up workers/assets).
const C = window.Cesium;
export const {
  Camera,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantProperty,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  EntityCluster,
  HeadingPitchRange,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  Math,
  NearFarScalar,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
} = C;
