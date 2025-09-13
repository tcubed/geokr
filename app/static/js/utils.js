// static/js/utils.js

/**
 * ------------------------------
 * Cookie Utilities
 * ------------------------------
 */

/**
 * Get the value of a cookie by name
 * @param {string} name
 * @returns {string|null}
 */
export function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

/**
 * ------------------------------
 * Network Utilities
 * ------------------------------
 */

/**
 * Check if the device is on Wi-Fi
 * @returns {boolean|null} true if Wi-Fi, false if not, null if unknown
 */
export function isOnWifi() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return null;
  if (connection.type) return connection.type === 'wifi';
  if (connection.effectiveType) return connection.effectiveType === '4g';
  return null;
}

/**
 * ------------------------------
 * DOM / Async Utilities
 * ------------------------------
 */

/**
 * Wait until an element matching selector exists in the DOM, or timeout
 * @param {string} selector - CSS selector
 * @param {number} timeout - ms to wait before giving up (default 2000ms)
 * @returns {Promise<Element|null>}
 */
export function waitForSelector(selector, timeout = 2000) {
  const start = Date.now();
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - start > timeout) {
        clearInterval(interval);
        resolve(el || null);
      }
    }, 50);
  });
}

/**
 * Observe a container element for child additions and run callback
 * @param {Element|string} container - DOM element or selector string
 * @param {Function} callback - called whenever children are added
 * @param {Object} options - MutationObserver options (default: { childList: true, subtree: true })
 * @returns {MutationObserver|null} the observer instance, or null if container not found
 */
export function watchContainer(container, callback, options = { childList: true, subtree: true }) {
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  if (!container) return null;

  const observer = new MutationObserver(callback);
  observer.observe(container, options);
  return observer;
}

/**
 * Simple sleep/pause for async functions
 * @param {number} ms - milliseconds
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ------------------------------
 * Exported utilities summary:
 * getCookie(name)
 * isOnWifi()
 * waitForSelector(selector, timeout)
 * watchContainer(container, callback, options)
 * sleep(ms)
 * ------------------------------
 */
