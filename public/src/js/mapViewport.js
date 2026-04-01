// ===== ACTIVE MAP VIEWPORT CONTRACT =====

let activeViewport = null;

/**
 * Register the currently active map-style viewport.
 *
 * The viewport should expose a `resize()` method. Keeping this contract small
 * lets tab and window layout logic stay renderer-agnostic so a future 3D globe
 * can plug in without forcing Leaflet assumptions into the rest of the app.
 *
 * @param {{ resize?: Function } | null} viewport
 */
export function registerMapViewport(viewport) {
  activeViewport = viewport ?? null;
}

/** Resize the active map viewport if one is registered. */
export function resizeMapViewport() {
  activeViewport?.resize?.();
}
