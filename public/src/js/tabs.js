// ===== TAB MANAGEMENT =====
import { resizeMapViewport } from './mapViewport.js';

/**
 * Switch to the specified tab.
 * @param {string} tabName - One of: map, space, seismic, env, correlation, research, settings
 */
export function switchTab(tabName, { updateHash = true } = {}) {
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

  if (updateHash && window.location.hash !== `#${tabName}`) {
    // Replace state so tab browsing does not flood the history stack.
    history.replaceState(null, '', `#${tabName}`);
  }

  window.dispatchEvent(new CustomEvent('space-earth:tabchange', {
    detail: { tabName },
  }));

  // Map-style renderers need an explicit size invalidation after becoming visible.
  // Keep this generic so the rest of the app is not hard-wired to Leaflet.
  if (tabName === 'map') {
    setTimeout(() => resizeMapViewport(), 100);
  }
}

/** Attach click handlers to all tab buttons and set initial ARIA state. */
export function initTabs() {
  const tabButtons = [...document.querySelectorAll('.tab-btn')];

  tabButtons.forEach((btn) => {
    const isActive = btn.classList.contains('active');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (!isActive) btn.setAttribute('tabindex', '-1');

    // Link panel -> button for screen readers.
    const tabName = btn.getAttribute('data-tab');
    const panel = tabName ? document.getElementById(`${tabName}-tab`) : null;
    if (panel && btn.id) {
      panel.setAttribute('aria-labelledby', btn.id);
    }

    btn.addEventListener('click', () => {
      if (tabName) switchTab(tabName);
    });
  });

  // Arrow-key roving tabindex per the WAI-ARIA tabs pattern.
  document.querySelector('.tab-header nav, nav[role="tablist"], [role="tablist"]')?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;

    const currentIndex = tabButtons.findIndex(btn => btn.getAttribute('aria-selected') === 'true');
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabButtons.length - 1;

    const nextButton = tabButtons[nextIndex];
    if (!nextButton) return;

    event.preventDefault();
    const tabName = nextButton.getAttribute('data-tab');
    if (tabName) switchTab(tabName);
    nextButton.focus();
  });

  // Ensure inactive panels start as hidden
  document.querySelectorAll('.tab-content').forEach(panel => {
    if (!panel.classList.contains('active')) panel.hidden = true;
  });

  // Deep-link support: opening #research (or back/forward) activates that tab.
  const activateFromHash = () => {
    const hashTab = window.location.hash.replace('#', '');
    if (hashTab && document.getElementById(`${hashTab}-tab`)) {
      switchTab(hashTab, { updateHash: false });
    }
  };
  window.addEventListener('hashchange', activateFromHash);
  activateFromHash();
}
