// ===== UTILITY FUNCTIONS =====

/**
 * Map a date value onto a pixel x-coordinate within a canvas range.
 * @param {Date} date - The date to map.
 * @param {Date} startDate - Start of the range.
 * @param {Date} endDate - End of the range.
 * @param {number} minX - Left pixel bound.
 * @param {number} maxX - Right pixel bound.
 * @returns {number} Pixel x position.
 */
export function mapDateToX(date, startDate, endDate, minX, maxX) {
  const totalTime = endDate - startDate;
  const elapsed = date - startDate;
  return minX + (elapsed / totalTime) * (maxX - minX);
}

/**
 * Return a human-readable Kp storm status label.
 * @param {number} kp - Kp index value.
 * @returns {string}
 */
export function getKpStatus(kp) {
  if (kp < 4) return 'Quiet';
  if (kp < 5) return 'Unsettled';
  if (kp < 6) return 'Active';
  if (kp < 7) return 'Minor Storm (G1)';
  if (kp < 8) return 'Moderate Storm (G2)';
  if (kp < 9) return 'Strong Storm (G3)';
  return 'Severe Storm (G4+)';
}

/**
 * Detect solar flare events from GOES X-ray flux data array.
 * @param {Array} xrayData - Array of flux data objects from NOAA.
 * @returns {Array} Array of detected flare objects.
 */
export function detectFlares(xrayData) {
  const flares = [];
  const threshold = 1e-6; // C-class threshold

  for (let i = 1; i < xrayData.length && i < 500; i++) {
    const current = parseFloat(xrayData[i].flux);
    const previous = parseFloat(xrayData[i - 1].flux);

    if (current > threshold && current > previous * 2) {
      let flareClass = 'C';
      let flareLevel = (current / 1e-6).toFixed(1);
      if (current > 1e-5) {
        flareClass = 'M';
        flareLevel = (current / 1e-5).toFixed(1);
      }
      if (current > 1e-4) {
        flareClass = 'X';
        flareLevel = (current / 1e-4).toFixed(1);
      }
      flares.push({ class: flareClass, level: flareLevel, flux: current, time: xrayData[i].time_tag });
    }
  }

  return flares.slice(-10);
}

/**
 * Safely set text content on an element, no-op if element not found.
 * @param {string} id - Element ID.
 * @param {string|number} text - Value to set.
 */
export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Safely set a style property on an element.
 * @param {string} id - Element ID.
 * @param {string} prop - CSS property name.
 * @param {string} value - CSS value.
 */
export function setStyle(id, prop, value) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = value;
}

/**
 * Get a CSS custom property value from the root element.
 * @param {string} varName - Variable name including leading --.
 * @returns {string}
 */
export function getCSSVar(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * Fetch with timeout using AbortController.
 * @param {string} url - URL to fetch.
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000).
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

/**
 * Fetch with exponential backoff retry.
 * @param {string} url - URL to fetch.
 * @param {number} maxRetries - Max retry attempts (default 3).
 * @param {number} baseDelay - Base delay in ms (default 2000).
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, maxRetries = 3, baseDelay = 2000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(url);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
