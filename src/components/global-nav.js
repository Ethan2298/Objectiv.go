/**
 * Global Navigation Component
 *
 * Provides omnibox-style search/navigation across the entire app.
 * Can navigate to objectives, folders, or web URLs.
 */

import AppState from '../state/app-state.js';
import * as BookmarkStorage from '../data/bookmark-storage.js';

// ========================================
// State
// ========================================

let selectedIndex = -1;
let currentResults = [];
let blurTimeout = null;

// DOM References
let navInput = null;
let dropdown = null;
let breadcrumb = null;
let btnBack = null;
let btnForward = null;
let btnRefresh = null;
let btnBookmark = null;

// Current web URL (for bookmark tracking)
let currentWebUrl = null;
let currentPageTitle = null;
let currentFaviconUrl = null;

// Callbacks
let _renderContentView = () => {};
let _renderSideList = () => {};

// ========================================
// Setup
// ========================================

export function setCallbacks({ renderContentView, renderSideList }) {
  if (renderContentView) _renderContentView = renderContentView;
  if (renderSideList) _renderSideList = renderSideList;
}

export function init() {
  navInput = document.getElementById('global-nav-input');
  dropdown = document.getElementById('global-nav-dropdown');
  breadcrumb = document.getElementById('global-nav-breadcrumb');
  btnBack = document.getElementById('nav-back');
  btnForward = document.getElementById('nav-forward');
  btnRefresh = document.getElementById('nav-refresh');
  btnBookmark = document.getElementById('nav-bookmark');

  if (!navInput || !dropdown) {
    console.warn('Global nav elements not found');
    return;
  }

  // Bookmark button click handler
  if (btnBookmark) {
    btnBookmark.addEventListener('click', handleBookmarkClick);
  }

  // Input event - show dropdown as user types
  navInput.addEventListener('input', handleInput);

  // Keyboard navigation
  navInput.addEventListener('keydown', handleKeydown);

  // Close dropdown on blur (with delay for click)
  navInput.addEventListener('blur', handleBlur);

  // Cancel blur timeout if focusing back
  navInput.addEventListener('focus', handleFocus);

  // Click on breadcrumb area to switch to search mode
  if (breadcrumb) {
    breadcrumb.addEventListener('click', (e) => {
      // Only switch to input if clicking on the breadcrumb container itself, not a segment
      if (e.target === breadcrumb) {
        showSearchInput();
      }
    });
  }

  // Navigation buttons - work for both browser history and webview
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      const viewMode = AppState.getViewMode();
      if (viewMode === 'web') {
        const webview = document.querySelector('.web-browser-frame');
        if (webview) webview.goBack();
      } else {
        // Use browser history for app navigation
        window.history.back();
      }
    });
  }

  if (btnForward) {
    btnForward.addEventListener('click', () => {
      const viewMode = AppState.getViewMode();
      if (viewMode === 'web') {
        const webview = document.querySelector('.web-browser-frame');
        if (webview) webview.goForward();
      } else {
        // Use browser history for app navigation
        window.history.forward();
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      const viewMode = AppState.getViewMode();
      if (viewMode === 'web') {
        const webview = document.querySelector('.web-browser-frame');
        if (webview) webview.reload();
      } else {
        // Refresh the current view
        window.location.reload();
      }
    });
  }
}

// ========================================
// Event Handlers
// ========================================

function handleInput() {
  const query = navInput.value.trim();
  if (query) {
    const results = getSearchResults(query);
    renderDropdown(results, query);
  } else {
    closeDropdown();
  }
}

function handleKeydown(e) {
  if (dropdown.style.display === 'none') {
    if (e.key === 'Enter') {
      const query = navInput.value.trim();
      if (query) {
        // Navigate to web
        navigateToResult({ type: 'web', url: query });
      }
    }
    return;
  }

  const resultEls = dropdown.querySelectorAll('.web-search-result');
  const resultCount = resultEls.length;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = (selectedIndex + 1) % resultCount;
    updateSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = selectedIndex <= 0 ? resultCount - 1 : selectedIndex - 1;
    updateSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < resultCount) {
      const el = resultEls[selectedIndex];
      navigateToResult(getResultFromElement(el));
    } else {
      // No selection - treat as web URL
      const query = navInput.value.trim();
      if (query) {
        navigateToResult({ type: 'web', url: query });
      }
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeDropdown();
    navInput.blur();
  }
}

function handleBlur() {
  blurTimeout = setTimeout(() => {
    closeDropdown();
    // Restore breadcrumb if input is empty
    if (navInput && !navInput.value.trim()) {
      updateFromSelection();
    }
  }, 150);
}

function handleFocus() {
  if (blurTimeout) {
    clearTimeout(blurTimeout);
    blurTimeout = null;
  }
  // Hide breadcrumb when focusing input
  if (breadcrumb) {
    breadcrumb.classList.remove('visible');
  }
  // Show dropdown if there's content
  const query = navInput.value.trim();
  if (query) {
    const results = getSearchResults(query);
    renderDropdown(results, query);
  }
}

// ========================================
// URL Detection
// ========================================

/**
 * Check if input looks like a URL (vs a search query)
 * Returns true for: google.com, http://..., https://..., localhost, IPs
 */
function looksLikeUrl(input) {
  const trimmed = input.trim();

  // Starts with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) return true;

  // Contains a dot followed by valid TLD-like chars (e.g., google.com, foo.co.uk)
  if (/^[^\s]+\.[a-z]{2,}(\/|$|\?|#)/i.test(trimmed)) return true;

  // localhost with optional port
  if (/^localhost(:\d+)?(\/|$)/i.test(trimmed)) return true;

  // IP address pattern
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/.test(trimmed)) return true;

  return false;
}

/**
 * Build the appropriate URL - either direct or Google search
 */
function buildWebUrl(input) {
  if (looksLikeUrl(input)) {
    // It's a URL - add https if needed
    if (!/^https?:\/\//i.test(input)) {
      return 'https://' + input;
    }
    return input;
  } else {
    // It's a search query - use Google
    return 'https://www.google.com/search?q=' + encodeURIComponent(input);
  }
}

// ========================================
// Search Logic
// ========================================

function getSearchResults(query) {
  const results = [];
  const q = query.toLowerCase().trim();

  if (!q) return results;

  const data = AppState.getData();

  // Search objectives
  data.objectives.forEach((obj, index) => {
    if (obj.name.toLowerCase().includes(q)) {
      results.push({ type: 'objective', id: obj.id, name: obj.name, index });
    }
  });

  // Search folders
  data.folders.forEach(folder => {
    if (folder.name.toLowerCase().includes(q)) {
      results.push({ type: 'folder', id: folder.id, name: folder.name });
    }
  });

  // Always add web option if query has content
  if (q.length > 0) {
    results.push({ type: 'web', url: query });
  }

  return results;
}

// ========================================
// Dropdown Rendering
// ========================================

function highlightMatch(name, query) {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerName.indexOf(lowerQuery);
  if (idx === -1) return escapeHtml(name);

  const before = name.substring(0, idx);
  const match = name.substring(idx, idx + query.length);
  const after = name.substring(idx + query.length);
  return escapeHtml(before) + '<mark>' + escapeHtml(match) + '</mark>' + escapeHtml(after);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDropdown(results, query) {
  currentResults = results;
  selectedIndex = -1;

  if (results.length === 0 || !query.trim()) {
    closeDropdown();
    return;
  }

  let html = '';

  // Group by type
  const objectives = results.filter(r => r.type === 'objective');
  const folders = results.filter(r => r.type === 'folder');
  const web = results.filter(r => r.type === 'web');

  let flatIndex = 0;

  if (objectives.length > 0) {
    html += '<div class="web-search-section">Objectives</div>';
    objectives.forEach(obj => {
      html += `<div class="web-search-result" data-index="${flatIndex}" data-type="objective" data-id="${obj.id}" data-obj-index="${obj.index}">
        <span class="web-search-result-icon">📋</span>
        <span class="web-search-result-name">${highlightMatch(obj.name, query)}</span>
      </div>`;
      flatIndex++;
    });
  }

  if (folders.length > 0) {
    html += '<div class="web-search-section">Folders</div>';
    folders.forEach(folder => {
      html += `<div class="web-search-result" data-index="${flatIndex}" data-type="folder" data-id="${folder.id}">
        <span class="web-search-result-icon">📁</span>
        <span class="web-search-result-name">${highlightMatch(folder.name, query)}</span>
      </div>`;
      flatIndex++;
    });
  }

  if (web.length > 0) {
    web.forEach(item => {
      const isUrl = looksLikeUrl(item.url);
      const icon = isUrl ? '🌐' : '🔍';
      const label = isUrl ? `Go to "${escapeHtml(item.url)}"` : `Search Google for "${escapeHtml(item.url)}"`;
      const section = isUrl ? 'Web' : 'Search';

      html += `<div class="web-search-section">${section}</div>`;
      html += `<div class="web-search-result" data-index="${flatIndex}" data-type="web" data-url="${escapeHtml(item.url)}">
        <span class="web-search-result-icon">${icon}</span>
        <span class="web-search-result-name">${label}</span>
      </div>`;
      flatIndex++;
    });
  }

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';

  // Add click handlers
  dropdown.querySelectorAll('.web-search-result').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent blur
      navigateToResult(getResultFromElement(el));
    });
  });
}

function getResultFromElement(el) {
  const type = el.dataset.type;
  if (type === 'objective') {
    return { type: 'objective', id: el.dataset.id, index: parseInt(el.dataset.objIndex, 10) };
  } else if (type === 'folder') {
    return { type: 'folder', id: el.dataset.id };
  } else {
    return { type: 'web', url: el.dataset.url };
  }
}

function closeDropdown() {
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  currentResults = [];
  selectedIndex = -1;
}

function updateSelection() {
  dropdown.querySelectorAll('.web-search-result').forEach((el, idx) => {
    el.classList.toggle('selected', idx === selectedIndex);
  });

  // Scroll selected into view
  const selected = dropdown.querySelector('.web-search-result.selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

// ========================================
// Navigation
// ========================================

function navigateToResult(result) {
  const SideListState = window.Objectiv?.SideListState;
  const app = document.getElementById('app');

  if (result.type === 'objective') {
    AppState.setSelectedObjectiveIndex(result.index);
    AppState.setViewMode('objective');

    // Remove web-mode class
    app?.classList.remove('web-mode');

    // Update side list selection
    if (SideListState) {
      const flatList = SideListState.getFlatList?.() || SideListState.getItems?.() || [];
      const sideListIndex = flatList.findIndex(item =>
        item.type === SideListState.ItemType.OBJECTIVE && item.objectiveId === result.id
      );
      if (sideListIndex >= 0) {
        SideListState.setSelectedIndex(sideListIndex);
      }
    }

    // Re-render sidebar and content
    _renderSideList();
    _renderContentView();
  } else if (result.type === 'folder') {
    AppState.setViewMode('folder');

    // Remove web-mode class
    app?.classList.remove('web-mode');

    // Update side list selection
    if (SideListState) {
      SideListState.selectItem(SideListState.ItemType.FOLDER, result.id);
    }

    // Re-render sidebar and content
    _renderSideList();
    _renderContentView();
  } else if (result.type === 'web') {
    // Switch to web view
    AppState.setViewMode('web');

    // Add web-mode class
    app?.classList.add('web-mode');

    // Update side list selection
    if (SideListState) {
      SideListState.selectItem(SideListState.ItemType.WEB);
    }

    // Re-render and then load URL
    _renderSideList();
    _renderContentView();

    // Load the URL in the webview after render
    setTimeout(() => {
      const webview = document.querySelector('.web-browser-frame');
      if (webview) {
        const url = buildWebUrl(result.url);
        webview.src = url;

        // Update the input to show the URL
        if (navInput) {
          navInput.value = url;
        }

        // Set initial tab title from URL hostname
        try {
          const Tabs = window.Objectiv?.Tabs;
          const hostname = new URL(url).hostname;
          if (Tabs && hostname) {
            Tabs.updateActiveTabTitle(hostname);
          }
        } catch (e) { /* ignore */ }
      }
    }, 50);
  }

  closeDropdown();
  navInput?.blur();
}

// ========================================
// Breadcrumb Path Building
// ========================================

/**
 * Build breadcrumb path for an item based on folder hierarchy
 * Returns: "Folder > Subfolder > Item Name"
 */
function buildBreadcrumbPath(item, folders) {
  if (!item) return '';

  // Get the item name
  const itemName = item.name || item.data?.name || '';

  // Determine parent folder ID based on item type
  // For folders: use parentId (the folder's parent)
  // For objectives: use folderId (the folder containing the objective)
  let currentFolderId;
  if (item.type === 'folder') {
    currentFolderId = item.parentId || item.data?.parentId;
  } else {
    currentFolderId = item.folderId || item.data?.folderId;
  }

  // Build folder chain from bottom up
  const folderChain = [];
  while (currentFolderId) {
    const folder = folders.find(f => f.id === currentFolderId);
    if (folder) {
      folderChain.unshift(folder.name);
      currentFolderId = folder.parentId;
    } else {
      break;
    }
  }

  // Return the full path: parent folders + item name
  return [...folderChain, itemName].join(' › ');
}

/**
 * Show the search input and hide breadcrumb
 */
function showSearchInput() {
  if (breadcrumb) breadcrumb.classList.remove('visible');
  if (navInput) {
    navInput.style.display = '';
    navInput.focus();
  }
}

/**
 * Show breadcrumb and hide search input
 */
function showBreadcrumb() {
  if (breadcrumb && breadcrumb.children.length > 0) {
    breadcrumb.classList.add('visible');
  }
}

/**
 * Navigate to a folder by ID
 */
function navigateToFolder(folderId) {
  const SideListState = window.Objectiv?.SideListState;
  if (!SideListState) return;

  AppState.setViewMode('folder');

  // Update side list selection
  SideListState.selectItem(SideListState.ItemType.FOLDER, folderId);

  // Expand the folder
  SideListState.expandFolder(folderId);

  // Re-render
  _renderSideList();
  _renderContentView();
}

/**
 * Build breadcrumb data structure
 * Returns array of { name, folderId, isCurrent }
 */
function buildBreadcrumbData(item, folders) {
  const segments = [];

  if (!item) return segments;

  const itemName = item.name || item.data?.name || '';

  // Determine parent folder ID
  let currentFolderId;
  if (item.type === 'folder') {
    currentFolderId = item.parentId || item.data?.parentId;
  } else {
    currentFolderId = item.folderId || item.data?.folderId;
  }

  // Build folder chain from bottom up
  const folderChain = [];
  while (currentFolderId) {
    const folder = folders.find(f => f.id === currentFolderId);
    if (folder) {
      folderChain.unshift({ name: folder.name, folderId: folder.id });
      currentFolderId = folder.parentId;
    } else {
      break;
    }
  }

  // Add folder segments (clickable)
  folderChain.forEach(f => {
    segments.push({ name: f.name, folderId: f.folderId, isCurrent: false });
  });

  // Add current item (not clickable if it's the current page)
  segments.push({ name: itemName, folderId: null, isCurrent: true });

  return segments;
}

/**
 * Render breadcrumb segments into the breadcrumb container
 */
function renderBreadcrumb(segments) {
  if (!breadcrumb) return;

  breadcrumb.innerHTML = '';

  if (segments.length === 0) {
    breadcrumb.classList.remove('visible');
    return;
  }

  segments.forEach((seg, idx) => {
    // Add separator before non-first segments
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '›';
      breadcrumb.appendChild(sep);
    }

    const span = document.createElement('span');
    span.className = 'breadcrumb-segment' + (seg.isCurrent ? ' current' : '');
    span.textContent = seg.name;

    if (!seg.isCurrent && seg.folderId) {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToFolder(seg.folderId);
      });
    }

    breadcrumb.appendChild(span);
  });

  breadcrumb.classList.add('visible');
}

/**
 * Update nav bar based on current selection
 */
export function updateFromSelection() {
  if (!navInput) return;

  const SideListState = window.Objectiv?.SideListState;
  const viewMode = AppState.getViewMode();
  const folders = SideListState?.getFolders() || [];

  // Handle based on view mode
  if (viewMode === 'home') {
    renderBreadcrumb([{ name: 'Home', folderId: null, isCurrent: true }]);
    navInput.value = '';
    setIcon('home');
    return;
  }

  if (viewMode === 'web') {
    // Hide breadcrumb, show input with URL
    if (breadcrumb) breadcrumb.classList.remove('visible');
    if (!navInput.value) {
      navInput.placeholder = 'Search or enter URL';
    }
    // Icon will be set by favicon event, default to web globe
    setIcon('web');
    return;
  }

  if (viewMode === 'folder') {
    const selectedItem = SideListState?.getSelectedItem();
    if (selectedItem && selectedItem.type === 'folder') {
      const segments = buildBreadcrumbData(selectedItem, folders);
      renderBreadcrumb(segments);
      navInput.value = '';
    }
    setIcon('folder');
    return;
  }

  if (viewMode === 'objective') {
    const data = AppState.getData();
    const objIndex = AppState.getSelectedObjectiveIndex();
    const obj = data.objectives[objIndex];

    if (obj) {
      const item = {
        type: 'objective',
        name: obj.name,
        folderId: obj.folderId
      };
      const segments = buildBreadcrumbData(item, folders);
      renderBreadcrumb(segments);
      navInput.value = '';
    }
    setIcon('objective');
    return;
  }

  // Fallback - hide breadcrumb
  if (breadcrumb) breadcrumb.classList.remove('visible');
  navInput.value = '';
  navInput.placeholder = 'Search or enter URL';
  setIcon('search');
}

// ========================================
// Public API
// ========================================

/**
 * Update the nav input to reflect current URL (for web view)
 */
export function setUrl(url) {
  if (navInput) {
    navInput.value = url;
    navInput.placeholder = 'Search or enter URL';
  }

  // Track current URL for bookmark feature
  currentWebUrl = url;
  checkBookmarkStatus(url);
}

/**
 * Set the current page title (for bookmark feature)
 */
export function setPageTitle(title) {
  currentPageTitle = title;
}

/**
 * Set the current favicon URL (for bookmark feature)
 */
export function setFavicon(faviconUrl) {
  currentFaviconUrl = faviconUrl;
}

// ========================================
// Bookmark Functions
// ========================================

/**
 * Handle bookmark button click - toggle bookmark state
 */
function handleBookmarkClick() {
  if (!currentWebUrl) return;

  const existingBookmark = BookmarkStorage.findBookmarkByUrl(currentWebUrl);

  if (existingBookmark) {
    // Remove bookmark
    BookmarkStorage.deleteBookmark(existingBookmark.id);
    updateBookmarkIcon(false);
  } else {
    // Add bookmark
    const title = currentPageTitle || currentWebUrl;
    const bookmark = BookmarkStorage.createBookmark(
      currentWebUrl,
      title,
      currentFaviconUrl,
      null, // folderId - unfiled by default
      Date.now() // orderIndex - use timestamp to put at end
    );
    BookmarkStorage.addBookmark(bookmark);
    updateBookmarkIcon(true);
  }

  // Re-render side list to show/hide bookmark
  _renderSideList();
}

/**
 * Update the bookmark button icon state
 */
function updateBookmarkIcon(isBookmarked) {
  if (!btnBookmark) return;

  if (isBookmarked) {
    btnBookmark.classList.add('bookmarked');
    btnBookmark.title = 'Remove bookmark';
  } else {
    btnBookmark.classList.remove('bookmarked');
    btnBookmark.title = 'Bookmark this page';
  }
}

/**
 * Check if the current URL is bookmarked and update icon
 */
function checkBookmarkStatus(url) {
  if (!url) {
    updateBookmarkIcon(false);
    return;
  }

  const existingBookmark = BookmarkStorage.findBookmarkByUrl(url);
  updateBookmarkIcon(!!existingBookmark);
}

/**
 * Clear the nav input
 */
export function clear() {
  if (navInput) {
    navInput.value = '';
  }
}

/**
 * Update the nav bar icon
 * @param {string} icon - Icon type ('search', 'home', 'folder', 'objective', 'web') or favicon URL
 */
export function setIcon(icon) {
  const navBar = document.getElementById('global-nav-bar');
  if (!navBar) return;

  let iconEl = navBar.querySelector('.global-nav-icon');
  if (!iconEl) return;

  // Check if it's a URL (favicon)
  if (icon && (icon.startsWith('http') || icon.startsWith('data:'))) {
    // Replace SVG with img if needed
    if (iconEl.tagName === 'SVG') {
      const img = document.createElement('img');
      img.className = 'global-nav-icon global-nav-favicon';
      img.src = icon;
      img.alt = '';
      iconEl.replaceWith(img);
    } else {
      iconEl.src = icon;
    }
  } else {
    // Built-in icon - restore SVG if needed
    const svgIcons = {
      search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
      home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      objective: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      web: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
    };

    const svgContent = svgIcons[icon] || svgIcons.search;

    if (iconEl.tagName === 'IMG') {
      // Replace img with SVG
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'global-nav-icon');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.5');
      svg.innerHTML = svgContent;
      iconEl.replaceWith(svg);
    } else {
      iconEl.innerHTML = svgContent;
    }
  }
}

export default {
  init,
  setCallbacks,
  setUrl,
  setPageTitle,
  setFavicon,
  setIcon,
  clear,
  updateFromSelection
};
