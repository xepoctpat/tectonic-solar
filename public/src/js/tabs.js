// ===== TAB MANAGEMENT =====
import { resizeMapViewport } from './mapViewport.js';

/**
 * Switch to the specified tab.
 * @param {string} tabName - One of: map, space, seismic, env, correlation, settings
 */
export function switchTab(tabName) {
  // Hide all tab content panels and update ARIA
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
    tab.hidden = true;
  });
  // De-activate all tab buttons and mark unselected
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('tabindex', '-1');
  });

  // Activate target
  const contentEl = document.getElementById(`${tabName}-tab`);
  const btnEl = document.querySelector(`[data-tab="${tabName}"]`);

  if (contentEl) {
    contentEl.classList.add('active');
    contentEl.hidden = false;
  }
  if (btnEl) {
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-selected', 'true');
    btnEl.removeAttribute('tabindex');
  }

  // Map-style renderers need an explicit size invalidation after becoming visible.
  // Keep this generic so the rest of the app is not hard-wired to Leaflet.
  if (tabName === 'map') {
    setTimeout(() => resizeMapViewport(), 100);
  }
}

/** Attach click handlers to all tab buttons and set initial ARIA state. */
export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.classList.contains('active');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (!isActive) btn.setAttribute('tabindex', '-1');

    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // Ensure inactive panels start as hidden
  document.querySelectorAll('.tab-content').forEach(panel => {
    if (!panel.classList.contains('active')) panel.hidden = true;
  });
}
