// ===== SETTINGS MODULE =====
import { alertSettings } from './store.js';
import { SETTINGS_STORAGE_KEY, DEFAULT_ALERT_SETTINGS } from './config.js';
import { showInAppNotification } from './notifications.js';

// ===== PERSISTENCE =====

/** Load saved settings from localStorage and apply to the store. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(alertSettings, saved);
  } catch {
    // Corrupt storage – fall back to defaults
  }
}

/** Persist current alert settings to localStorage. */
function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...alertSettings }));
  } catch {
    // Storage may be unavailable (private browsing, quota exceeded)
  }
}

// ===== FORM SYNC =====

/** Populate settings form fields from the current alertSettings state. */
export function syncSettingsForm() {
  const eqEl = document.getElementById('alert-eq-mag');
  const kpEl = document.getElementById('alert-kp');
  const flareEl = document.getElementById('alert-flare');
  const enabledEl = document.getElementById('alert-enabled');

  if (eqEl) eqEl.value = alertSettings.earthquakeMagnitude;
  if (kpEl) kpEl.value = alertSettings.kpThreshold;
  if (flareEl) flareEl.value = alertSettings.solarFlareClass;
  if (enabledEl) enabledEl.checked = alertSettings.enabled;
}

/** Read settings form and save to store + localStorage. */
export function saveAlertSettings() {
  const eqEl = document.getElementById('alert-eq-mag');
  const kpEl = document.getElementById('alert-kp');
  const flareEl = document.getElementById('alert-flare');
  const enabledEl = document.getElementById('alert-enabled');

  if (eqEl) alertSettings.earthquakeMagnitude = parseFloat(eqEl.value);
  if (kpEl) alertSettings.kpThreshold = parseInt(kpEl.value, 10);
  if (flareEl) alertSettings.solarFlareClass = flareEl.value;
  if (enabledEl) alertSettings.enabled = enabledEl.checked;

  persistSettings();

  showInAppNotification(
    'Settings Saved',
    `EQ: M${alertSettings.earthquakeMagnitude}+, Kp: ${alertSettings.kpThreshold}+, Flare: ${alertSettings.solarFlareClass}+`,
    'success',
  );
}

/** Toggle alert notifications on/off. */
export function toggleAlerts() {
  const enabledEl = document.getElementById('alert-enabled');
  if (enabledEl) alertSettings.enabled = enabledEl.checked;
  persistSettings();
  showInAppNotification('Alert Settings', `Notifications ${alertSettings.enabled ? 'enabled' : 'disabled'}`, 'info');
}

/** Reset all settings to factory defaults. */
export function resetSettings() {
  Object.assign(alertSettings, DEFAULT_ALERT_SETTINGS);
  persistSettings();
  syncSettingsForm();
  showInAppNotification('Settings Reset', 'All settings restored to defaults', 'info');
}
