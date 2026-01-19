/**
 * Platform Module
 *
 * Platform detection, PIN protection, theme toggle, and status reporter.
 */

import AppState from '../state/app-state.js';
import { createNewTab } from './tabs.js';

// ========================================
// Platform Detection
// ========================================

export const isElectron = !!(window.electronAPI);
export const isBrowser = !isElectron;

// ========================================
// PIN Protection
// ========================================

const APP_PIN = '2298';
const PIN_AUTH_KEY = 'objectiv-authenticated';

export function initPinProtection() {
  const pinModal = document.getElementById('pin-modal');
  const pinInput = document.getElementById('pin-input');
  const pinError = document.getElementById('pin-error');

  if (!pinModal || !pinInput) return;

  // Check if already authenticated
  if (localStorage.getItem(PIN_AUTH_KEY) === 'true') {
    pinModal.style.display = 'none';
    return;
  }

  // Show modal and focus input
  pinModal.style.display = 'flex';
  setTimeout(() => pinInput.focus(), 100);

  // Handle PIN input
  pinInput.addEventListener('input', () => {
    if (pinError) pinError.style.display = 'none';
    if (pinInput.value.length === 4) {
      if (pinInput.value === APP_PIN) {
        localStorage.setItem(PIN_AUTH_KEY, 'true');
        pinModal.style.display = 'none';
      } else {
        if (pinError) pinError.style.display = 'block';
        pinInput.value = '';
        pinInput.focus();
      }
    }
  });

  // Handle Enter key
  pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && pinInput.value.length === 4) {
      if (pinInput.value === APP_PIN) {
        localStorage.setItem(PIN_AUTH_KEY, 'true');
        pinModal.style.display = 'none';
      } else {
        if (pinError) pinError.style.display = 'block';
        pinInput.value = '';
      }
    }
  });
}

// ========================================
// Theme Management
// ========================================

/**
 * Apply saved theme on page load
 */
export function applyStoredTheme() {
  const stored = localStorage.getItem('objectiv-theme');
  // Remove both mode classes first
  document.body.classList.remove('light-mode', 'solarized-mode');

  if (stored === 'light') {
    document.body.classList.add('light-mode');
  } else if (stored === 'solarized') {
    document.body.classList.add('solarized-mode');
  }
  // 'dark' is the default (no class needed)
}

/**
 * Get current theme
 * @returns {'light' | 'dark' | 'solarized'}
 */
export function getCurrentTheme() {
  if (document.body.classList.contains('light-mode')) return 'light';
  if (document.body.classList.contains('solarized-mode')) return 'solarized';
  return 'dark';
}

/**
 * Set theme
 * @param {'light' | 'dark' | 'solarized'} theme
 */
export function setTheme(theme) {
  // Remove both mode classes first
  document.body.classList.remove('light-mode', 'solarized-mode');

  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else if (theme === 'solarized') {
    document.body.classList.add('solarized-mode');
  }
  // 'dark' is the default (no class needed)
  localStorage.setItem('objectiv-theme', theme);
}

// ========================================
// Settings Button
// ========================================

/**
 * Initialize settings button
 */
export function initSettingsButton() {
  const btn = document.getElementById('settings-btn');
  if (!btn) return;

  // Apply saved theme on load
  applyStoredTheme();

  // Open settings tab on click
  btn.addEventListener('click', openSettingsTab);
}

/**
 * Open settings tab (or switch to existing settings tab)
 */
export function openSettingsTab() {
  const TabState = window.Objectiv?.TabState;
  const SideListState = window.Objectiv?.SideListState;
  const Router = window.Objectiv?.Router;

  if (!TabState) return;

  // Check if there's already a settings tab open
  const tabIds = TabState.getTabIds();
  for (const tabId of tabIds) {
    const tab = TabState.getTabById(tabId);
    if (tab && tab.selection && tab.selection.type === 'settings') {
      // Switch to existing settings tab
      TabState.switchTab(tabId);

      // Update DOM active class
      const tabs = document.querySelectorAll('.header-tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tabId === tabId));

      // Update URL and window title
      if (Router) {
        Router.updateURL('settings', 'settings');
        Router.updateWindowTitle('Settings');
      }

      // Trigger view update
      const updateView = window.Objectiv?.updateView;
      if (updateView) updateView();
      return;
    }
  }

  // No existing settings tab - create a new tab
  createNewTab('Settings', 'settings');

  // Set the new tab to settings view
  AppState.setViewMode('settings');
  TabState.setSelection('settings', 'settings');

  // Update URL and window title
  if (Router) {
    Router.updateURL('settings', 'settings');
    Router.updateWindowTitle('Settings');
  }

  // Clear side list selection by setting index to -1
  if (SideListState && SideListState.setSelectedIndex) {
    SideListState.setSelectedIndex(-1);
  }
}

// ========================================
// Status Reporter
// ========================================

export function updateStatusReporter() {
  const container = document.getElementById('status-items');
  if (!container) return;

  const systemStatus = AppState.getSystemStatus();

  // Get Supabase storage status
  const storageStatus = window.Objectiv?.Repository?.getStorageStatus?.() || { isReady: false };
  const storageLabel = storageStatus.isReady ? 'connected' : 'not configured';
  const storageSt = storageStatus.isReady ? 'ok' : 'warn';

  const items = [
    { label: 'Platform', value: 'web', status: 'ok' },
    { label: 'Supabase', value: storageLabel, status: storageSt },
    { label: 'Taglines', value: systemStatus.taglines ? 'loaded' : 'fallback', status: systemStatus.taglines ? 'ok' : 'warn' }
  ];

  container.innerHTML = items.map(item =>
    `<div class="status-item"><span>${item.label}</span><span class="status-${item.status}">${item.value}</span></div>`
  ).join('');

  if (systemStatus.errors.length > 0) {
    container.innerHTML += `<div style="margin-top:8px;color:#ff5555;font-size:10px;">Errors: ${systemStatus.errors.length}</div>`;
    systemStatus.errors.slice(-3).forEach(err => {
      container.innerHTML += `<div style="color:#ff5555;font-size:9px;word-break:break-all;">${err}</div>`;
    });
  }
}

export function toggleStatusReporter() {
  const reporter = document.getElementById('status-reporter');
  if (reporter) {
    reporter.classList.toggle('visible');
    updateStatusReporter();
  }
}

export function initStatusReporter() {
  // Status toggle button
  document.getElementById('status-toggle')?.addEventListener('click', toggleStatusReporter);
  document.getElementById('status-close')?.addEventListener('click', toggleStatusReporter);

  // Keyboard shortcut 'i' for inspect
  document.addEventListener('keydown', (e) => {
    if (e.key === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const active = document.activeElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.contentEditable === 'true') return;
      e.preventDefault();
      toggleStatusReporter();
    }
  });
}

// ========================================
// Window Controls (Electron)
// ========================================

export function initWindowControls() {
  if (!window.electronAPI) return;

  document.getElementById('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => window.electronAPI.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => window.electronAPI.close());
}

// ========================================
// Browser Zoom Prevention
// ========================================

export function initZoomPrevention() {
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  });
}

// ========================================
// LocalStorage Test
// ========================================

export function testLocalStorage() {
  try {
    localStorage.setItem('_test', '1');
    localStorage.removeItem('_test');
    AppState.updateSystemStatus('localStorage', true);
    return true;
  } catch (e) {
    AppState.reportError('Storage', e);
    return false;
  }
}

// ========================================
// Initialize Platform Module
// ========================================

export function init() {
  // Apply browser mode class
  if (isBrowser) {
    document.body.classList.add('browser-mode');
  }

  // Update system status
  AppState.updateSystemStatus('platform', isBrowser ? 'browser' : 'electron');
  AppState.updateSystemStatus('clarityAPI', isElectron && !!window.electronAPI?.calculateClarity);

  // Test localStorage
  testLocalStorage();

  // Initialize features
  initPinProtection();
  initSettingsButton();
  initStatusReporter();
  initWindowControls();
  initZoomPrevention();
}

// ========================================
// Default Export
// ========================================

export default {
  isElectron,
  isBrowser,
  initPinProtection,
  applyStoredTheme,
  getCurrentTheme,
  setTheme,
  initSettingsButton,
  openSettingsTab,
  updateStatusReporter,
  toggleStatusReporter,
  initStatusReporter,
  initWindowControls,
  initZoomPrevention,
  testLocalStorage,
  init
};
