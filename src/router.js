/**
 * Router Module
 *
 * Hash-based URL routing for browser navigation support.
 * Enables back/forward navigation and deep linking.
 *
 * URL Structure:
 * - /#/ or /#/home      -> Home view
 * - /#/objective/{id}   -> Objective view
 * - /#/folder/{id}      -> Folder view
 * - /#/settings         -> Settings view
 */

// ========================================
// State
// ========================================

let isUpdatingHash = false;
let onNavigateCallback = null;

// ========================================
// Route Parsing
// ========================================

/**
 * Parse current URL hash to extract route info
 * @returns {{viewMode: string, type: string, id: string|null}}
 */
export function getRouteFromURL() {
  const hash = window.location.hash || '#/';
  const path = hash.replace(/^#\/?/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0 || segments[0] === 'home') {
    return { viewMode: 'home', type: 'home', id: 'home' };
  }

  if (segments[0] === 'objective' && segments[1]) {
    return { viewMode: 'objective', type: 'objective', id: segments[1] };
  }

  if (segments[0] === 'folder' && segments[1]) {
    return { viewMode: 'folder', type: 'folder', id: segments[1] };
  }

  if (segments[0] === 'settings') {
    return { viewMode: 'settings', type: 'settings', id: 'settings' };
  }

  // Default to home for unknown routes
  return { viewMode: 'home', type: 'home', id: 'home' };
}

// ========================================
// URL Updates
// ========================================

/**
 * Update URL hash based on current view
 * @param {string} type - Selection type: 'home', 'objective', 'folder', 'settings'
 * @param {string|null} id - Item ID (for objective/folder)
 */
export function updateURL(type, id) {
  let newHash = '#/';

  switch (type) {
    case 'home':
      newHash = '#/home';
      break;
    case 'objective':
      if (id) newHash = `#/objective/${id}`;
      break;
    case 'folder':
      if (id) newHash = `#/folder/${id}`;
      break;
    case 'settings':
      newHash = '#/settings';
      break;
    case 'web':
    case 'bookmark':
      // Don't update URL for web/bookmark views
      return;
    default:
      newHash = '#/home';
  }

  // Guard against triggering hashchange handler
  if (window.location.hash !== newHash) {
    isUpdatingHash = true;
    window.location.hash = newHash;
    // Reset flag after a tick
    setTimeout(() => { isUpdatingHash = false; }, 0);
  }
}

// ========================================
// Window Title
// ========================================

/**
 * Update the browser window title
 * @param {string} title - Page-specific title
 */
export function updateWindowTitle(title) {
  if (title) {
    document.title = `${title} - Objectiv`;
  } else {
    document.title = 'Objectiv';
  }
}

/**
 * Update window title based on current selection
 * @param {string} type - Selection type
 * @param {string|null} name - Item name (for objective/folder)
 */
export function updateWindowTitleForSelection(type, name) {
  switch (type) {
    case 'home':
      document.title = 'Objectiv';
      break;
    case 'objective':
    case 'folder':
      if (name) {
        document.title = `${name} - Objectiv`;
      } else {
        document.title = 'Objectiv';
      }
      break;
    case 'settings':
      document.title = 'Settings - Objectiv';
      break;
    default:
      document.title = 'Objectiv';
  }
}

// ========================================
// Initialization
// ========================================

/**
 * Initialize router with navigation callback
 * @param {Function} onNavigate - Callback when route changes via back/forward
 *   Called with: { viewMode: string, type: string, id: string|null }
 */
export function initRouter(onNavigate) {
  onNavigateCallback = onNavigate;

  // Listen for hash changes (back/forward navigation)
  window.addEventListener('hashchange', () => {
    // Ignore if we programmatically updated the hash
    if (isUpdatingHash) return;

    const route = getRouteFromURL();
    if (onNavigateCallback) {
      onNavigateCallback(route);
    }
  });
}

/**
 * Check if current URL has a specific route (not just root)
 * @returns {boolean}
 */
export function hasInitialRoute() {
  const hash = window.location.hash || '';
  // Has route if hash exists and is not just empty or root
  return hash.length > 0 && hash !== '#' && hash !== '#/' && hash !== '#/home';
}

// ========================================
// Default Export
// ========================================

export default {
  getRouteFromURL,
  updateURL,
  updateWindowTitle,
  updateWindowTitleForSelection,
  initRouter,
  hasInitialRoute
};
