// ===== NOTIFICATION SYSTEM =====
import { alertSettings } from './store.js';
import { setText } from './utils.js';

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
export function sendNotification(title, message) {
  if (!alertSettings.enabled) return;

  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: message,
      tag: 'space-earth-monitor',
      requireInteraction: false,
    });

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
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

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

  const container = document.getElementById('toast-container');
  if (!container) return;

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
