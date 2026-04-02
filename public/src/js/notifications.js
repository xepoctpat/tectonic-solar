// ===== NOTIFICATION SYSTEM =====
import { alertSettings } from './store.js';
import { setText } from './utils.js';

const MAX_VISIBLE_TOASTS = 4;
const ALERT_DEDUP_WINDOW_MS = 10 * 60 * 1000;
const recentAlertKeys = new Map();

function pruneRecentAlertKeys(now = Date.now()) {
  recentAlertKeys.forEach((timestamp, key) => {
    if (now - timestamp > ALERT_DEDUP_WINDOW_MS) {
      recentAlertKeys.delete(key);
    }
  });
}

function shouldSuppressAlert(key) {
  const now = Date.now();
  pruneRecentAlertKeys(now);
  const lastSeen = recentAlertKeys.get(key);
  if (lastSeen && now - lastSeen < ALERT_DEDUP_WINDOW_MS) {
    return true;
  }

  recentAlertKeys.set(key, now);
  return false;
}

/**
 * Request browser notification permission and update UI status.
 * @returns {Promise<boolean>}
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Your browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    setText('notification-status', '✓ Enabled');
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setText('notification-status', '✓ Enabled');
      showInAppNotification('Notifications Enabled', 'You will receive alerts for major events', 'success');
      return true;
    }
  }

  setText('notification-status', '✗ Disabled');
  return false;
}

/**
 * Send a browser push notification and always show an in-app toast.
 * @param {string} title
 * @param {string} message
 * @param {string} [icon]
 */
export function sendNotification(title, message, icon) {
  if (!alertSettings.enabled) return;

  const alertKey = `${title}::${message}`;
  if (shouldSuppressAlert(alertKey)) {
    return;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    const options = {
      body: message,
      tag: 'space-earth-monitor',
      requireInteraction: false,
    };

    if (icon) {
      options.icon = icon;
    }

    const notification = new Notification(title, options);
    notification.onclick = function () {
      window.focus();
      notification.close();
    };

    setTimeout(() => notification.close(), 10_000);
  }

  // Always show in-app toast regardless of browser permission
  const type = title.includes('Storm') ? 'warning'
    : title.includes('Earthquake') ? 'error'
      : 'info';
  showInAppNotification(title, message, type);
}

/**
 * Display an in-app toast notification.
 * @param {string} title
 * @param {string} message
 * @param {'info'|'warning'|'error'|'success'} [type='info']
 */
export function showInAppNotification(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastKey = `${type}::${title}::${message}`;
  const duplicateToast = [...container.children].find(node => node.dataset?.toastKey === toastKey);
  if (duplicateToast) {
    return;
  }

  while (container.children.length >= MAX_VISIBLE_TOASTS) {
    container.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.dataset.toastKey = toastKey;

  const header = document.createElement('div');
  header.className = 'toast-header';

  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Close notification');
  closeBtn.textContent = '×';
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'toast-body';
  body.textContent = message;

  toast.appendChild(header);
  toast.appendChild(body);

  closeBtn.addEventListener('click', () => toast.remove());

  container.appendChild(toast);
  // Trigger CSS enter transition
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 8_000);
}

/** Update notification status display on page load. */
export function initNotificationStatus() {
  if (!('Notification' in window)) {
    setText('notification-status', '✗ Not Supported');
    return;
  }
  if (Notification.permission === 'granted') {
    setText('notification-status', '✓ Enabled');
  } else if (Notification.permission === 'denied') {
    setText('notification-status', '✗ Blocked');
  } else {
    setText('notification-status', 'Click to Enable');
  }
}
