// mapCamera (LatLng, LatLngBounds, CameraIntent, cameraIntent, MIN_CAMERA_ZOOM, …) was promoted
// to src/shared/map so the driver map can reuse it without a cross-feature import
// (rules/web-architecture.md#feature-folders). Re-exported here so existing customer imports
// (CustomerMapBackground, CustomerMapShell, TrackingPage, MapOrderPage, orderCamera, suggestLocation,
// useSuggest, DestinationSearch, markerInterpolation, …) keep resolving unchanged.
export * from '../../../shared/map/mapCamera'
