/**
 * Navigation Controller Module
 *
 * Keyboard navigation, scroll-snap selection, and content loading.
 */

import AppState from '../state/app-state.js';
import * as TabState from '../state/tab-state.js';
import PromptController from './prompt-controller.js';

// ========================================
// Callbacks (set by app.js)
// ========================================

let _renderContentView = () => {};
let _updateView = () => {};
let _updateTabTitle = () => {};

export function setCallbacks({ renderContentView, updateView, updateTabTitle }) {
  if (renderContentView) _renderContentView = renderContentView;
  if (updateView) _updateView = updateView;
  if (updateTabTitle) _updateTabTitle = updateTabTitle;
}

// ========================================
// Scroll-Snap Selection
// ========================================

let _rafPending = false;

/**
 * Initialize scroll-snap based selection
 * Desktop only - mobile uses tap-to-select
 */
export function initScrollSnapSelection() {
  const sideListItems = document.getElementById('side-list-items');
  if (!sideListItems || AppState.isMobile()) return;

  sideListItems.addEventListener('scroll', () => {
    if (_rafPending) return;
    _rafPending = true;

    // Capture active tab ID before async work
    const scrollTabId = TabState.getActiveTabId();

    requestAnimationFrame(() => {
      _rafPending = false;

      // Only process if still on the same tab
      if (TabState.getActiveTabId() !== scrollTabId) return;

      const SideListState = window.Objectiv?.SideListState;
      if (!SideListState) return;

      const items = sideListItems.querySelectorAll('.side-item');
      if (!items.length) return;

      // Find item closest to snap line (30% from top)
      const containerRect = sideListItems.getBoundingClientRect();
      const snapLineY = containerRect.top + (window.innerHeight * 0.30);

      let closestIdx = 0;
      let closestDistance = Infinity;

      items.forEach((item, idx) => {
        const itemRect = item.getBoundingClientRect();
        const distance = Math.abs(itemRect.top - snapLineY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIdx = idx;
        }
      });

      const prevIdx = SideListState.getSelectedIndex();
      if (closestIdx !== prevIdx) {
        // Skip scroll-snap selection changes while editing
        if (AppState.isActivelyEditing()) {
          return;
        }

        // Update state
        SideListState.setSelectedIndex(closestIdx);

        // Update visual dot
        if (items[prevIdx]) items[prevIdx].classList.remove('selected');
        if (items[closestIdx]) items[closestIdx].classList.add('selected');

        // Update content immediately
        const itemData = SideListState.getItems()[closestIdx];
        if (itemData?.type === SideListState.ItemType.HOME) {
          AppState.setViewMode('home');
          _renderContentView();
          _updateTabTitle();
        } else if (itemData?.type === SideListState.ItemType.WEB) {
          AppState.setViewMode('web');
          _renderContentView();
          _updateTabTitle();
        } else if (itemData?.type === SideListState.ItemType.OBJECTIVE) {
          AppState.setSelectedObjectiveIndex(itemData.index);
          AppState.setViewMode('objective');
          _renderContentView();
          _updateTabTitle();
        } else if (itemData?.type === SideListState.ItemType.FOLDER) {
          AppState.setViewMode('folder');
          _renderContentView();
          _updateTabTitle();
        }

        playNotch();
      }
    });
  }, { passive: true });
}

// ========================================
// Content Load Debouncing
// ========================================

/**
 * Schedule content loading - debounced to run after scroll stops
 */
export function scheduleContentLoad(index) {
  AppState.clearContentLoadTimeout();

  const timeout = setTimeout(() => {
    loadContentForIndex(index);
  }, AppState.getContentLoadDebounce());

  AppState.setContentLoadTimeout(timeout);
}

/**
 * Actually load content for the selected index
 */
function loadContentForIndex(index) {
  // Skip if user is actively editing
  if (AppState.isActivelyEditing()) return;

  if (index === AppState.getLastLoadedIndex()) return;
  AppState.setLastLoadedIndex(index);

  const SideListState = window.Objectiv?.SideListState;
  if (!SideListState) return;

  const selectedItem = SideListState.getSelectedItem();
  if (!selectedItem) return;

  if (selectedItem.type === SideListState.ItemType.HOME) {
    AppState.setViewMode('home');
    _renderContentView();
    _updateTabTitle();
  } else if (selectedItem.type === SideListState.ItemType.WEB) {
    AppState.setViewMode('web');
    _renderContentView();
    _updateTabTitle();
  } else if (selectedItem.type === SideListState.ItemType.OBJECTIVE) {
    AppState.setSelectedObjectiveIndex(selectedItem.index);
    AppState.setViewMode('objective');
    _renderContentView();
    _updateTabTitle();
  } else if (selectedItem.type === SideListState.ItemType.FOLDER) {
    AppState.setViewMode('folder');
    _renderContentView();
    _updateTabTitle();
  }
}

// ========================================
// Keyboard Handling
// ========================================

/**
 * Initialize keyboard handlers for prompts and navigation
 */
export function initKeyboardHandlers() {
  document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e) {
  const promptMode = AppState.getPromptMode();
  const promptTargetSection = AppState.getPromptTargetSection();

  // Handle prompt input modes
  if (promptMode === 'add' || promptMode === 'edit' || promptMode === 'refine') {
    // Special handling for objective title editing/adding
    if ((promptMode === 'edit' || promptMode === 'add') && promptTargetSection === 'objectives') {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleObjectiveTitleEscape();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        PromptController.commitObjectiveTitleEdit();
        return;
      }
      return;
    }

    // Special handling for folder title editing
    if (promptMode === 'edit' && promptTargetSection === 'folders') {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleFolderTitleEscape();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        PromptController.commitFolderTitleEdit();
        return;
      }
      return;
    }

    // General prompt handling
    if (e.key === 'Escape') {
      e.preventDefault();
      PromptController.cancelPrompt();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const contentEditable = document.querySelector('.list-item-content[contenteditable="true"]');
      if (contentEditable) {
        PromptController.processPromptInput(contentEditable.textContent);
        return;
      }
      const input = document.querySelector('.prompt-input');
      if (input) PromptController.processPromptInput(input.value);
      return;
    }
    return;
  }

  // Handle confirm mode
  if (promptMode === 'confirm') {
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      PromptController.processConfirm(true);
      return;
    }
    if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
      e.preventDefault();
      PromptController.processConfirm(false);
      return;
    }
    return;
  }
}

function handleObjectiveTitleEscape() {
  const promptMode = AppState.getPromptMode();
  const data = AppState.getData();

  if (promptMode === 'edit') {
    // Restore original and cancel
    const titleEl = document.getElementById('content-header-title');
    const selectedIdx = AppState.getSelectedObjectiveIndex();
    const obj = data.objectives[selectedIdx];
    if (titleEl && obj) {
      titleEl.textContent = obj.name;
      titleEl.removeAttribute('contenteditable');
      titleEl.removeAttribute('spellcheck');
    }
  } else if (promptMode === 'add') {
    // Remove placeholder objective
    const promptTargetIndex = AppState.getPromptTargetIndex();
    data.objectives.splice(promptTargetIndex, 1);
    AppState.setSelectedObjectiveIndex(Math.max(0, data.objectives.length - 1));
    // Need to notify to re-render side list
    const SideListState = window.Objectiv?.SideListState;
    if (SideListState) {
      // This would be handled by the app
    }
  }

  AppState.resetPromptState();
  _updateView();
}

function handleFolderTitleEscape() {
  const titleEl = document.getElementById('content-header-title');
  const promptData = AppState.getPromptData();
  const folder = promptData?.item;

  if (titleEl && folder) {
    titleEl.textContent = folder.name;
    titleEl.removeAttribute('contenteditable');
    titleEl.removeAttribute('spellcheck');
  }

  AppState.resetPromptState();
  _updateView();
}

// ========================================
// Mouse Handling
// ========================================

/**
 * Initialize mousedown handler for edit transitions
 */
export function initMouseHandler() {
  document.addEventListener('mousedown', handleMouseDown);
}

function handleMouseDown(e) {
  const promptMode = AppState.getPromptMode();
  const viewMode = AppState.getViewMode();
  const data = AppState.getData();

  // Skip confirm mode
  if (promptMode === 'confirm') return;

  const currentEditable = document.querySelector('[contenteditable="true"]');
  const clickedListItem = e.target.closest('.list-item[data-section]');
  const clickedSideItem = e.target.closest('.side-item:not(.add-option)');
  const clickedAddOption = e.target.closest('.add-option');
  const clickedTitle = e.target.closest('#content-header-title');

  // CASE 1: Not currently editing
  if (!currentEditable || !promptMode) {
    // Header title and list items are always contenteditable
    // Browser handles focus naturally, inline-edit utility handles save on blur
    if (clickedTitle || clickedListItem) {
      return; // Let browser handle naturally
    }
    return;
  }

  const promptTargetSection = AppState.getPromptTargetSection();

  // Currently editing title
  if (clickedTitle && promptTargetSection === 'objectives') {
    return;
  }

  const currentItem = currentEditable.closest('.list-item') || currentEditable.closest('.side-item');

  // Clicking on same item
  if (currentItem && currentItem.contains(e.target)) {
    return;
  }

  // CASE 3: Clicking on different list item
  // List items are always contenteditable - let blur/focus handlers manage state
  if (clickedListItem) {
    const section = clickedListItem.dataset.section;
    const index = parseInt(clickedListItem.dataset.index, 10);
    const promptTargetIndex = AppState.getPromptTargetIndex();

    // Handle title editing first
    if (promptTargetSection === 'objectives') {
      PromptController.commitObjectiveTitleEdit();
      // Let focus event on new element handle starting edit
      return;
    }
    if (promptTargetSection === 'folders') {
      PromptController.commitFolderTitleEdit();
      // Let focus event on new element handle starting edit
      return;
    }

    // For list item edits, check if we need to re-render (e.g., empty item removed)
    const { needsRerender, removedElement } = PromptController.commitEditInPlace();

    if (needsRerender) {
      let adjustedIndex = index;
      if (removedElement && promptTargetSection === section && promptTargetIndex < index) {
        adjustedIndex = index - 1;
      }
      _updateView();
      // After re-render, focus the target element
      setTimeout(() => {
        const newListItem = document.querySelector(`.list-item[data-section="${section}"][data-index="${adjustedIndex}"]`);
        const contentEl = newListItem?.querySelector('.list-item-content');
        if (contentEl) {
          contentEl.focus();
        }
      }, 0);
    }
    // If no re-render needed, browser will naturally handle blur/focus transition
    return;
  }

  // CASE 4: Clicking on add option
  if (clickedAddOption) {
    if (promptTargetSection === 'objectives') {
      PromptController.commitObjectiveTitleEdit();
    } else if (promptTargetSection === 'folders') {
      PromptController.commitFolderTitleEdit();
    } else {
      const { needsRerender } = PromptController.commitEditInPlace();
      if (needsRerender) {
        _updateView();
      }
    }
    return;
  }

  // CASE 5: Clicking on side item
  if (clickedSideItem) {
    if (promptTargetSection === 'objectives') {
      PromptController.commitObjectiveTitleEdit();
    } else if (promptTargetSection === 'folders') {
      PromptController.commitFolderTitleEdit();
    } else {
      const { needsRerender } = PromptController.commitEditInPlace();
      if (needsRerender) {
        _updateView();
      }
    }
    return;
  }

  // CASE 6: Clicking elsewhere
  if (promptTargetSection === 'objectives') {
    PromptController.commitObjectiveTitleEdit();
  } else if (promptTargetSection === 'folders') {
    PromptController.commitFolderTitleEdit();
  } else {
    const { needsRerender } = PromptController.commitEditInPlace();
    if (needsRerender) {
      _updateView();
    }
  }
}

// ========================================
// Selection Helpers
// ========================================

/**
 * Select objective by index
 */
export function selectObjective(index) {
  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();

  // Commit any current edit
  PromptController.commitEditInPlace();

  // Auto-pause timer before switching
  // This would need to call into timer module

  if (index === selectedIdx) return;

  const SideListState = window.Objectiv?.SideListState;
  if (SideListState) {
    SideListState.selectItem(SideListState.ItemType.OBJECTIVE, index);
  }

  AppState.setSelectedObjectiveIndex(index);
  AppState.setViewMode('objective');
  updateSideListSelection();
  _renderContentView();
}

/**
 * Update visual selection without full re-render
 */
export function updateSideListSelection() {
  if (AppState.isMobile()) return;

  const SideListState = window.Objectiv?.SideListState;
  if (!SideListState) return;

  const selectedIdx = SideListState.getSelectedIndex();
  const items = document.querySelectorAll('#side-list-items .side-item[data-idx]');

  items.forEach((item) => {
    const idx = parseInt(item.dataset.idx, 10);
    if (idx === selectedIdx) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'start' });
    } else {
      item.classList.remove('selected');
    }
  });
}

// ========================================
// Sound (disabled)
// ========================================

function playNotch() {
  // Sound disabled
}

// ========================================
// Initialize
// ========================================

export function init() {
  initScrollSnapSelection();
  initKeyboardHandlers();
  initMouseHandler();
}

// ========================================
// Default Export
// ========================================

export default {
  setCallbacks,
  initScrollSnapSelection,
  scheduleContentLoad,
  initKeyboardHandlers,
  initMouseHandler,
  selectObjective,
  updateSideListSelection,
  init
};
