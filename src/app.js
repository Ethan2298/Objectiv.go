/**
 * Objectiv - Main Application Entry Point
 *
 * This module serves as the central entry point, importing and
 * re-exporting all modules for use by the application.
 */

// ========================================
// Module Imports - Data & State
// ========================================

import * as Repository from './data/repository.js';
import * as BookmarkStorage from './data/bookmark-storage.js';
import * as TabState from './state/tab-state.js';
import * as SideListState from './state/side-list-state.js';
import * as AppState from './state/app-state.js';

// ========================================
// Module Imports - Utils
// ========================================

import * as Utils from './utils.js';
import * as DomHelpers from './utils/dom-helpers.js';
import * as Markdown from './utils/markdown.js';
import * as Constants from './constants.js';

// ========================================
// Module Imports - Features
// ========================================

import * as Platform from './features/platform.js';
import * as Intro from './features/intro.js';
import * as Sidebar from './features/sidebar.js';
import * as Tabs from './features/tabs.js';
import * as Mobile from './features/mobile.js';
import * as Router from './router.js';

// ========================================
// Module Imports - Controllers
// ========================================

import * as PromptController from './controllers/prompt-controller.js';
import * as NavigationController from './controllers/navigation-controller.js';
import * as EditController from './controllers/edit-controller.js';

// ========================================
// Module Imports - Components
// ========================================

import * as ListItem from './components/list-item.js';
import * as ContextMenu from './components/context-menu.js';
import * as DeleteModal from './components/delete-modal.js';
import * as SideList from './components/side-list.js';
import * as ContentView from './components/content-view.js';
import * as NextStepTimer from './components/next-step-timer.js';
import * as GlobalNav from './components/global-nav.js';

// ========================================
// Global Window Reference
// ========================================

// Make modules available globally for gradual migration
// and for access from inline scripts during transition
window.Objectiv = {
  // Data & State
  Repository,
  BookmarkStorage,
  TabState,
  SideListState,
  AppState,

  // Utils
  Utils,
  DomHelpers,
  Markdown,
  Constants,

  // Features
  Platform,
  Intro,
  Sidebar,
  Mobile,
  Router,

  // Controllers
  PromptController,
  NavigationController,
  EditController,

  // Components
  ListItem,
  ContextMenu,
  DeleteModal,
  SideList,
  ContentView,
  NextStepTimer,
  GlobalNav,
  Tabs
};

// ========================================
// Callback Wiring
// ========================================

function wireCallbacks() {
  // Wire PromptController callbacks
  PromptController.setCallbacks({
    saveData,
    updateView,
    renderSideList: SideList.renderSideList,
    renderContentView: ContentView.renderContentView,
    updateStatusBar,
    showMessage
  });

  // Wire NavigationController callbacks
  NavigationController.setCallbacks({
    renderContentView: ContentView.renderContentView,
    updateView,
    updateTabTitle: updateTabTitleFromSelection
  });

  // Wire SideList callbacks
  SideList.setCallbacks({
    renderContentView: ContentView.renderContentView,
    updateView,
    playNotch: () => {}, // Sound disabled
    updateTabTitle: updateTabTitleFromSelection
  });

  // Wire ContentView callbacks
  ContentView.setCallbacks({
    startAddPriority: PromptController.startAddPriority,
    startLogStep: PromptController.startLogStep,
    refreshClarity: () => {} // Clarity disabled
  });

  // Wire NextStepTimer callbacks
  NextStepTimer.setCallbacks({
    saveData,
    renderContentView: ContentView.renderContentView
  });

  // Wire Tabs callbacks
  Tabs.setCallbacks({
    updateView
  });

  // Wire GlobalNav callbacks
  GlobalNav.setCallbacks({
    renderContentView: ContentView.renderContentView,
    renderSideList: SideList.renderSideList
  });
}

// ========================================
// Core Functions
// ========================================

/**
 * Save data to storage
 */
function saveData() {
  const data = AppState.getData();
  if (Repository.saveData) {
    Repository.saveData(data).catch(err => {
      console.error('Failed to save data:', err);
    });
  }
}

/**
 * Update active tab title and icon based on current selection
 * Also updates URL and browser window title
 */
function updateTabTitleFromSelection() {
  const selection = TabState.getSelection();
  const viewMode = AppState.getViewMode();

  let title = 'Objectiv';
  let icon = 'home';
  let windowTitle = null;

  if (selection.type === 'home') {
    title = 'Home';
    icon = 'home';
    windowTitle = null; // Will show just "Objectiv"
  } else if (selection.type === 'web') {
    // Web view - title/icon will be updated by webview events
    title = 'Web';
    icon = 'web';
    windowTitle = 'Web';
  } else if (selection.type === 'settings') {
    title = 'Settings';
    icon = 'settings';
    windowTitle = 'Settings';
  } else if (selection.type === 'objective' && selection.id) {
    // Look up objective by ID from data
    const objectives = AppState.getObjectives();
    const objective = objectives.find(o => o.id === selection.id);
    if (objective) {
      title = objective.name || 'Untitled';
      windowTitle = objective.name || 'Untitled';
    }
    icon = 'objective';
  } else if (selection.type === 'folder' && selection.id) {
    // Look up folder by ID from data
    const folders = AppState.getFolders();
    const folder = folders.find(f => f.id === selection.id);
    if (folder) {
      title = folder.name || 'Folder';
      windowTitle = folder.name || 'Folder';
    }
    icon = 'folder';
  } else if (viewMode === 'empty' || !selection.id) {
    title = 'Objectiv';
    icon = 'home';
    windowTitle = null;
  }

  Tabs.updateActiveTabTitle(title);
  Tabs.updateActiveTabIcon(icon);

  // Update URL and window title
  Router.updateURL(selection.type, selection.id);
  Router.updateWindowTitle(windowTitle);
}

/**
 * Main update function
 */
async function updateView() {
  await SideList.renderSideList();
  ContentView.renderContentView();
  PromptController.focusPromptInput();
  updateStatusBar();
  updateTabTitleFromSelection();
}

/**
 * Update status bar with shortcuts
 */
function updateStatusBar() {
  const promptMode = AppState.getPromptMode();
  let shortcuts = '';
  if (promptMode) {
    shortcuts = '[Enter] Confirm  [Esc] Cancel';
  }
  const shortcutsEl = document.getElementById('shortcuts');
  if (shortcutsEl) shortcutsEl.textContent = shortcuts;
}

/**
 * Show message toast
 */
function showMessage(text, duration = 1500) {
  const toast = document.getElementById('message-toast');
  if (toast) {
    toast.textContent = text;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, duration);
  }
}

// ========================================
// Storage Initialization
// ========================================

async function initStorage() {
  if (!Repository.initializeData) {
    console.log('Repository module not loaded yet');
    return;
  }

  try {
    const loadedData = await Repository.initializeData();
    if (loadedData && loadedData.objectives) {
      console.log('Loaded', loadedData.objectives.length, 'objectives from Supabase');
      AppState.setObjectives(loadedData.objectives);
    }

    // Load folders
    if (Repository.loadAllFolders) {
      const folders = await Repository.loadAllFolders();
      console.log('Loaded', folders.length, 'folders from Supabase');
      AppState.setFolders(folders);
    }

    updateView();
    Platform.updateStatusReporter();

    // Subscribe to realtime changes
    if (Repository.subscribeToChanges) {
      Repository.subscribeToChanges(async (payload) => {
        console.log('Realtime update received, refreshing...');
        const reloadedData = await Repository.reloadData();
        if (reloadedData && reloadedData.objectives) {
          AppState.setObjectives(reloadedData.objectives);
          updateView();
        }
      });
      console.log('Subscribed to realtime updates');
    }

    // Subscribe to folder changes
    if (Repository.subscribeToFolderChanges) {
      Repository.subscribeToFolderChanges(async (payload) => {
        console.log('Folder realtime update received, refreshing...');
        const folders = await Repository.loadAllFolders();
        AppState.setFolders(folders);
        updateView();
      });
      console.log('Subscribed to folder realtime updates');
    }
  } catch (e) {
    console.warn('Storage init failed:', e);
  }
}

// ========================================
// Add Item Functions
// ========================================

/**
 * Add new folder
 */
async function addNewFolder() {
  try {
    const data = AppState.getData();

    if (!Repository.createFolder) {
      console.warn('Repository.createFolder not available');
      return;
    }

    const minOrder = data.folders.reduce((min, f) => Math.min(min, f.orderIndex || 0), 0);
    const topOrderIndex = minOrder - 1;

    const folder = await Repository.createFolder({
      name: 'New Folder',
      parentId: null,
      orderIndex: topOrderIndex
    });
    console.log('Created folder:', folder);

    const folders = await Repository.loadAllFolders();
    AppState.setFolders(folders);

    if (SideListState) {
      SideList.renderSideList();
      SideListState.selectItem(SideListState.ItemType.FOLDER, folder.id);
      DomHelpers.scrollToSelected();
    } else {
      SideList.renderSideList();
    }
  } catch (err) {
    console.error('Failed to create folder:', err);
    showMessage('Failed to create folder');
  }
}

/**
 * Add new objective
 */
async function addNewObjective() {
  await PromptController.startAddObjective();
}

// ========================================
// Event Handlers
// ========================================

function initEventHandlers() {
  // Plus button click handler
  document.getElementById('add-item-btn')?.addEventListener('click', (e) => {
    if (!ContextMenu) {
      console.warn('ContextMenu module not loaded');
      return;
    }

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    const menuItems = [
      { label: 'New Folder', action: () => addNewFolder() },
      { label: 'New Objective', action: () => addNewObjective() }
    ];

    const estimatedMenuHeight = menuItems.length * 29 + 8;

    ContextMenu.showContextMenu({
      x: rect.left,
      y: rect.top - estimatedMenuHeight - 4,
      items: menuItems
    });
  });

  // Edit button click handler (event delegation)
  document.getElementById('content-body')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('edit-btn')) {
      e.stopPropagation();
      const section = e.target.dataset.section;
      const index = parseInt(e.target.dataset.index, 10);
      AppState.setPromptTargetIndex(index);
      AppState.setPromptTargetSection(section);

      if (section === 'priorities') {
        const data = AppState.getData();
        const selectedIdx = AppState.getSelectedObjectiveIndex();
        const obj = data.objectives[selectedIdx];
        if (obj && obj.priorities[index]) {
          AppState.setPromptMode('edit');
          AppState.setPromptData({ type: 'priority', item: obj.priorities[index] });
          updateView();
        }
      }
    }
  });

  // Auto-pause timer when closing
  window.addEventListener('beforeunload', () => {
    NextStepTimer.autoPauseNextStepTimer();
  });
}

// ========================================
// Initialization
// ========================================

/**
 * Handle navigation from URL changes (back/forward buttons)
 */
function handleRouteNavigation(route) {
  const { type, id } = route;

  if (type === 'home') {
    TabState.setSelection('home', 'home');
    AppState.setViewMode('home');
  } else if (type === 'settings') {
    TabState.setSelection('settings', 'settings');
    AppState.setViewMode('settings');
  } else if (type === 'objective' && id) {
    // Verify objective exists
    const objectives = AppState.getObjectives();
    const objective = objectives.find(o => o.id === id);
    if (objective) {
      TabState.setSelection(id, 'objective');
      AppState.setViewMode('objective');
    } else {
      // Objective not found - go to home
      TabState.setSelection('home', 'home');
      AppState.setViewMode('home');
    }
  } else if (type === 'folder' && id) {
    // Verify folder exists
    const folders = AppState.getFolders();
    const folder = folders.find(f => f.id === id);
    if (folder) {
      TabState.setSelection(id, 'folder');
      AppState.setViewMode('folder');
    } else {
      // Folder not found - go to home
      TabState.setSelection('home', 'home');
      AppState.setViewMode('home');
    }
  } else {
    // Unknown route - go to home
    TabState.setSelection('home', 'home');
    AppState.setViewMode('home');
  }

  updateView();
}

/**
 * Apply initial route from URL (deep linking)
 * Called after data is loaded
 */
function applyInitialRoute() {
  if (!Router.hasInitialRoute()) {
    return false;
  }

  const route = Router.getRouteFromURL();
  handleRouteNavigation(route);
  return true;
}

/**
 * Initialize the application
 */
export async function init() {
  console.log('Objectiv modules loaded');

  // Set platform class for CSS (e.g., traffic light padding on macOS)
  if (window.electronAPI?.platform) {
    document.body.classList.add(`platform-${window.electronAPI.platform}`);
  }

  // Listen for fullscreen changes to adjust header layout
  if (window.electronAPI?.onFullscreenChange) {
    window.electronAPI.onFullscreenChange((isFullscreen) => {
      document.body.classList.toggle('fullscreen', isFullscreen);
    });
  }

  // Initialize state modules
  SideListState.init();

  // Wire all callbacks
  wireCallbacks();

  // Initialize router for back/forward navigation
  Router.initRouter(handleRouteNavigation);

  // Initialize platform features
  Platform.init();

  // Initialize sidebar
  Sidebar.init();

  // Initialize tabs
  Tabs.initTabs();

  // Initialize mobile
  Mobile.init();

  // Show intro animation
  await Intro.showIntro();

  // Initialize storage (async, non-blocking)
  // After storage loads, apply initial route if present
  setTimeout(async () => {
    await initStorage();
    // Apply initial route after data is loaded (deep linking)
    applyInitialRoute();
  }, 100);

  // Initialize navigation controller
  NavigationController.init();

  // Initialize global nav bar
  GlobalNav.init();

  // Initialize event handlers
  initEventHandlers();

  // Initial render - check if TabState has a saved selection
  const selection = TabState.getSelection();
  const savedViewMode = TabState.getViewMode();

  // If there's a saved selection, use it; otherwise default to home
  if (selection.type && savedViewMode) {
    // Selection exists from persisted state - viewMode should also be correct
  } else {
    // No saved selection - default to home
    TabState.setSelection('home', 'home');
    AppState.setViewMode('home');
  }

  updateView();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ========================================
// Exports
// ========================================

export {
  // Data & State
  Repository,
  BookmarkStorage,
  TabState,
  SideListState,
  AppState,

  // Utils
  Utils,
  DomHelpers,
  Markdown,
  Constants,

  // Features
  Platform,
  Intro,
  Sidebar,
  Mobile,
  Router,

  // Controllers
  PromptController,
  NavigationController,
  EditController,

  // Components
  ListItem,
  ContextMenu,
  DeleteModal,
  SideList,
  ContentView,
  NextStepTimer,

  // Core functions
  saveData,
  updateView,
  updateStatusBar,
  showMessage,
  addNewFolder,
  addNewObjective
};

export default {
  Repository,
  BookmarkStorage,
  TabState,
  SideListState,
  AppState,
  Utils,
  DomHelpers,
  Markdown,
  Constants,
  Platform,
  Intro,
  Sidebar,
  Mobile,
  Router,
  PromptController,
  NavigationController,
  EditController,
  ListItem,
  ContextMenu,
  DeleteModal,
  SideList,
  ContentView,
  NextStepTimer,
  init,
  saveData,
  updateView,
  updateStatusBar,
  showMessage,
  addNewFolder,
  addNewObjective
};
