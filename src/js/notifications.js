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
export function sendNotification(title, message, icon) {
  if (!alertSettings.enabled) return;

  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: message,
      icon: icon || '🌍',
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
  toast.innerHTML = `
    <div class="toast-header">
      <strong>${title}</strong>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    </div>
    <div class="toast-body">${message}</div>
  `;

  const closeBtn = toast.querySelector('.toast-close');
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
