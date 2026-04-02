// ===== DASHBOARD LAYOUT CONTROLS =====

const STORAGE_PREFIX = 'space-earth-layout';
const DEFAULT_MIN_LEFT_PX = 320;
const DEFAULT_MIN_RIGHT_PX = 280;
const DEFAULT_MIN_PANEL_HEIGHT = 160;

function readNumber(value, fallback = null) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStorageKey(key) {
  return `${STORAGE_PREFIX}:${key}`;
}

function loadStoredValue(key) {
  try {
    const raw = localStorage.getItem(getStorageKey(key));
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeValue(key, value) {
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch {
    // Ignore storage failures; layout should still work without persistence.
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(getStorageKey(key));
  } catch {
    // Ignore storage failures.
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createRefreshScheduler(callback) {
  let refreshTimer = null;
  return function scheduleRefresh(delay = 90) {
    if (typeof callback !== 'function') return;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => callback(), delay);
  };
}

function initSplitLayouts(scheduleRefresh) {
  document.querySelectorAll('[data-split-layout]').forEach(layout => {
    const splitId = layout.dataset.splitId;
    const splitter = layout.querySelector('[data-splitter]');
    const defaultLeftPercent = readNumber(layout.dataset.defaultSplit, 58);
    const storedLeftPercent = splitId ? readNumber(loadStoredValue(`split:${splitId}`), null) : null;

    const getMinLeftPercent = boundsWidth => {
      const minLeftPx = readNumber(layout.dataset.minLeftPx, DEFAULT_MIN_LEFT_PX);
      return clamp((minLeftPx / boundsWidth) * 100, 20, 70);
    };

    const getMaxLeftPercent = boundsWidth => {
      const minRightPx = readNumber(layout.dataset.minRightPx, DEFAULT_MIN_RIGHT_PX);
      return clamp(100 - (minRightPx / boundsWidth) * 100, 30, 80);
    };

    const applyLeftPercent = (rawPercent, persist = true) => {
      const bounds = layout.getBoundingClientRect();
      if (!bounds.width) return;

      const minPercent = getMinLeftPercent(bounds.width);
      const maxPercent = getMaxLeftPercent(bounds.width);
      const nextPercent = clamp(rawPercent, minPercent, maxPercent);

      layout.style.setProperty('--split-left', `${nextPercent}%`);

      if (splitter) {
        splitter.setAttribute('aria-valuemin', String(Math.round(minPercent)));
        splitter.setAttribute('aria-valuemax', String(Math.round(maxPercent)));
        splitter.setAttribute('aria-valuenow', String(Math.round(nextPercent)));
      }

      if (persist && splitId) {
        storeValue(`split:${splitId}`, nextPercent);
      }

      scheduleRefresh(120);
    };

    applyLeftPercent(storedLeftPercent ?? defaultLeftPercent, false);

    if (!splitter) return;

    let activePointerId = null;

    const handlePointerMove = event => {
      if (activePointerId !== event.pointerId) return;
      const bounds = layout.getBoundingClientRect();
      if (!bounds.width) return;
      const leftPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      applyLeftPercent(leftPercent);
    };

    const stopDragging = event => {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      splitter.classList.remove('is-dragging');
      if (splitter.hasPointerCapture(event.pointerId)) {
        splitter.releasePointerCapture(event.pointerId);
      }
      scheduleRefresh(150);
    };

    splitter.addEventListener('pointerdown', event => {
      if (window.matchMedia('(max-width: 960px)').matches) return;
      activePointerId = event.pointerId;
      splitter.classList.add('is-dragging');
      splitter.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    splitter.addEventListener('pointermove', handlePointerMove);
    splitter.addEventListener('pointerup', stopDragging);
    splitter.addEventListener('pointercancel', stopDragging);
    splitter.addEventListener('lostpointercapture', () => {
      activePointerId = null;
      splitter.classList.remove('is-dragging');
    });

    splitter.addEventListener('dblclick', () => {
      applyLeftPercent(defaultLeftPercent);
    });

    splitter.addEventListener('keydown', event => {
      if (window.matchMedia('(max-width: 960px)').matches) return;

      const currentPercent = readNumber(layout.style.getPropertyValue('--split-left'), defaultLeftPercent);
      const step = event.shiftKey ? 5 : 2;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        applyLeftPercent(currentPercent - step);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        applyLeftPercent(currentPercent + step);
      } else if (event.key === 'Home') {
        event.preventDefault();
        applyLeftPercent(defaultLeftPercent);
      } else if (event.key === 'End') {
        event.preventDefault();
        applyLeftPercent(72);
      }
    });
  });
}

function initResizablePanels(scheduleRefresh) {
  if (!('ResizeObserver' in window)) return;

  const observer = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const panel = entry.target;
      const panelId = panel.dataset.panelId;
      const height = Math.round(entry.contentRect.height);
      if (panelId && height >= DEFAULT_MIN_PANEL_HEIGHT) {
        storeValue(`panel:${panelId}`, height);
      }
    });

    scheduleRefresh(140);
  });

  document.querySelectorAll('[data-resizable-panel]').forEach(panel => {
    const panelId = panel.dataset.panelId;
    const storedHeight = panelId ? readNumber(loadStoredValue(`panel:${panelId}`), null) : null;

    if (storedHeight && storedHeight >= DEFAULT_MIN_PANEL_HEIGHT) {
      panel.style.height = `${storedHeight}px`;
    }

    observer.observe(panel);

    panel.addEventListener('dblclick', event => {
      if (!event.altKey) return;
      panel.style.removeProperty('height');
      if (panelId) {
        removeStoredValue(`panel:${panelId}`);
      }
      scheduleRefresh(100);
    });
  });
}

export function initLayoutControls({ onLayoutChange } = {}) {
  const scheduleRefresh = createRefreshScheduler(onLayoutChange);
  initSplitLayouts(scheduleRefresh);
  initResizablePanels(scheduleRefresh);
}
