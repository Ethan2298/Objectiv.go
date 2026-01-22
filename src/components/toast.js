/**
 * Toast Component
 *
 * Simple error/notification toast that appears at the bottom of the screen.
 * Auto-dismisses after a configurable duration.
 */

// ========================================
// Constants
// ========================================

const DEFAULT_DURATION = 3000;

// ========================================
// State
// ========================================

let _toastElement = null;
let _dismissTimeout = null;

// ========================================
// DOM Setup
// ========================================

/**
 * Get or create the toast element
 * @returns {HTMLElement}
 */
function getToastElement() {
  if (_toastElement) {
    return _toastElement;
  }

  // Check if it already exists in DOM
  _toastElement = document.getElementById('error-toast');

  if (!_toastElement) {
    // Create the toast element
    _toastElement = document.createElement('div');
    _toastElement.id = 'error-toast';
    _toastElement.className = 'error-toast';
    document.body.appendChild(_toastElement);
  }

  return _toastElement;
}

// ========================================
// Public API
// ========================================

/**
 * Show an error toast
 * @param {string} message - The message to display
 * @param {number} duration - How long to show (ms), default 3000
 */
export function showErrorToast(message, duration = DEFAULT_DURATION) {
  const toast = getToastElement();

  // Clear any existing timeout
  if (_dismissTimeout) {
    clearTimeout(_dismissTimeout);
    _dismissTimeout = null;
  }

  // Set message and show
  toast.textContent = message;
  toast.classList.add('visible');

  // Auto-dismiss
  _dismissTimeout = setTimeout(() => {
    hideToast();
  }, duration);
}

/**
 * Hide the toast immediately
 */
export function hideToast() {
  if (_toastElement) {
    _toastElement.classList.remove('visible');
  }

  if (_dismissTimeout) {
    clearTimeout(_dismissTimeout);
    _dismissTimeout = null;
  }
}

/**
 * Show a success toast (green)
 * @param {string} message - The message to display
 * @param {number} duration - How long to show (ms), default 3000
 */
export function showSuccessToast(message, duration = DEFAULT_DURATION) {
  const toast = getToastElement();

  // Clear any existing timeout
  if (_dismissTimeout) {
    clearTimeout(_dismissTimeout);
    _dismissTimeout = null;
  }

  // Set message and show with success styling
  toast.textContent = message;
  toast.classList.remove('error');
  toast.classList.add('visible', 'success');

  // Auto-dismiss
  _dismissTimeout = setTimeout(() => {
    hideToast();
    toast.classList.remove('success');
  }, duration);
}

// ========================================
// Default Export
// ========================================

export default {
  showErrorToast,
  showSuccessToast,
  hideToast
};
