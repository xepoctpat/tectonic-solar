// ===== TAB MANAGEMENT =====
let mapRef = null;

/**
 * Register the Leaflet map instance so the tab module can invalidate its
 * size when the map tab becomes visible.
 * @param {L.Map} map
 */
export function registerMap(map) {
  mapRef = map;
}

/**
 * Switch to the specified tab.
 * @param {string} tabName - One of: map, space, seismic, env, correlation, settings
 */
export function switchTab(tabName) {
  // Hide all tab content panels
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  // De-activate all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  // Activate target
  const contentEl = document.getElementById(`${tabName}-tab`);
  const btnEl = document.querySelector(`[data-tab="${tabName}"]`);

  if (contentEl) contentEl.classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  // Leaflet maps need an explicit size invalidation after becoming visible
  if (tabName === 'map' && mapRef) {
    setTimeout(() => mapRef.invalidateSize(), 100);
  }
}

/** Attach click handlers to all tab buttons. */
export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });
}
