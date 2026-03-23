// ===== ENVIRONMENT MODULE =====
import { LOCATIONS } from './config.js';
import { setText } from './utils.js';

/** Update displayed temperature when the user selects a location. */
export function updateLocation() {
  const select = document.getElementById('location-select');
  if (!select) return;
  const location = select.value;
  const data = LOCATIONS[location];
  setText('temp', data ? data.temp : '—');
}

/** Populate the location <select> element from config. */
export function initLocationSelector() {
  const select = document.getElementById('location-select');
  if (!select) return;

  select.innerHTML = Object.keys(LOCATIONS)
    .map(loc => `<option value="${loc}">${loc}</option>`)
    .join('');

  select.addEventListener('change', updateLocation);
  updateLocation();
}
