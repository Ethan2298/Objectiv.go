/**
 * Directory Listing Sortable - Drag-drop for directory views
 *
 * Uses the generic sortable module with app-specific callbacks for:
 * - Item data extraction (objectives, folders, notes)
 * - Folder drop-into validation (circular reference prevention)
 * - Optimistic state updates with Supabase persistence
 *
 * Drop zones:
 * - Top/bottom 25% of folder row = reorder (drop above/below)
 * - Center 50% of folder row = drop INTO folder
 */

import AppState from '../state/app-state.js';
import * as TreeUtils from '../data/tree-utils.js';
import * as OptimisticState from '../state/optimistic-state.js';
import { showErrorToast } from './toast.js';
import { makeSortable } from '../utils/sortable.js';

// ========================================
// Module State
// ========================================

let _sortableInstance = null;
let _currentFolderId = null;
let _renderCallback = null;

// ========================================
// Public API
// ========================================

/**
 * Initialize sortable on directory listing
 * @param {HTMLElement} container - The .directory-listing container
 * @param {string|null} folderId - Current folder ID (null for root)
 * @param {Function} renderCallback - Function to re-render the directory
 */
export function initDirectorySortable(container, folderId, renderCallback) {
  destroyDirectorySortable();

  if (!container) {
    console.warn('initDirectorySortable: container not found');
    return;
  }

  _currentFolderId = folderId;
  _renderCallback = renderCallback;

  _sortableInstance = makeSortable(container, {
    itemSelector: '.directory-item[data-sortable="true"]',
    placeholderClass: 'sortable-placeholder',
    draggingClass: 'dragging',
    containerDraggingClass: 'is-dragging',
    dropTargetClass: 'folder-drop-hover',
    dropInvalidClass: 'drop-invalid',
    dropZoneThreshold: 0.25,
    scrollSensitivity: 60,
    scrollSpeed: 25,
    distance: 4,

    // Extract item data from DOM element
    getItemData,

    // Folders are drop targets
    isDropTarget: (el) => el.dataset.type === 'folder',

    // Validate drop (prevent circular folder references)
    canDrop: (draggedEl, targetEl, draggedData) => {
      const targetId = targetEl.dataset.id;

      // Can't drop folder into itself
      if (draggedData.type === 'folder' && draggedData.id === targetId) {
        return false;
      }

      // Can't drop folder into its own descendants
      if (draggedData.type === 'folder') {
        const tree = AppState.getTree();
        if (TreeUtils.isDescendantOf(tree, targetId, draggedData.id)) {
          return false;
        }
      }

      return true;
    },

    // Mark invalid drop targets when dragging a folder
    markInvalidTargets: (draggedEl, draggedData, invalidClass) => {
      if (draggedData.type !== 'folder') return;

      const tree = AppState.getTree();
      const draggedId = draggedData.id;

      $('.directory-item[data-type="folder"]').each(function() {
        const $folder = $(this);
        const targetId = $folder.data('id');

        // Can't drop into self
        if (targetId === draggedId) {
          $folder.addClass(invalidClass);
          return;
        }

        // Can't drop into descendants
        if (TreeUtils.isDescendantOf(tree, targetId, draggedId)) {
          $folder.addClass(invalidClass);
        }
      });
    },

    // Handle reorder (drop above/below another item)
    onReorder: handleReorder,

    // Handle drop into folder
    onDropInto: handleDropInto
  });
}

/**
 * Destroy the sortable instance
 */
export function destroyDirectorySortable() {
  if (_sortableInstance) {
    _sortableInstance.destroy();
    _sortableInstance = null;
  }
}

/**
 * Refresh sortable after DOM changes
 */
export function refreshDirectorySortable() {
  if (_sortableInstance) {
    _sortableInstance.refresh();
  }
}

// ========================================
// Data Extraction
// ========================================

/**
 * Extract item data from a DOM element
 */
function getItemData(el) {
  return {
    id: el.dataset.id,
    type: el.dataset.type,
    depth: parseInt(el.dataset.depth || '0', 10)
  };
}

// ========================================
// Drop Handlers
// ========================================

/**
 * Handle reorder - item dropped above/below another item
 */
async function handleReorder({ itemId, itemType, data, prevEl, nextEl, prevData, nextData }) {
  // In directory view, items are at the same level (within the current folder view)
  // Determine if we're moving within the same folder or into a different one

  // For now, directory reorder stays within the current folder view
  const targetParentId = _currentFolderId;

  console.log('Directory reorder:', {
    type: itemType,
    id: itemId,
    targetParentId,
    prev: prevData?.type,
    next: nextData?.type
  });

  // Update item and renumber siblings
  await updateItemPosition(itemType, itemId, targetParentId, prevEl, nextEl);
}

/**
 * Handle drop into folder (center zone)
 */
async function handleDropInto({ itemId, itemType, targetId }) {
  console.log('Directory: Dropping into folder:', { type: itemType, id: itemId, folderId: targetId });

  // Add item to end of folder (no prev/next)
  await updateItemPosition(itemType, itemId, targetId, null, null);
}

// ========================================
// Position Updates
// ========================================

/**
 * Update item position and renumber all siblings in the target folder
 * Uses optimistic updates: UI updates immediately, persistence is async
 */
function updateItemPosition(type, id, targetParentId, prevEl, nextEl) {
  const Repository = window.Layer?.Repository;
  const NoteStorage = window.Layer?.NoteStorage;
  const BookmarkStorage = window.Layer?.BookmarkStorage;

  // Build updates array before mutation
  const updates = buildUpdatesArray(type, id, targetParentId, prevEl, nextEl);

  if (!updates) {
    console.error('Could not build updates for:', type, id);
    triggerRerender();
    return;
  }

  console.log('Directory: Saving updates:', updates);

  // Optimistic update: local first, persist async
  OptimisticState.optimisticUpdate(
    // Local mutation (synchronous)
    () => {
      applyUpdatesLocally(type, updates);
      AppState.rebuildTree(BookmarkStorage?.loadAllBookmarks?.() || []);
      triggerRerender();
    },
    // Persist function (async)
    async () => {
      await persistUpdates(type, updates, Repository, NoteStorage, BookmarkStorage);
    },
    // Options
    {
      onError: (error) => {
        console.error('Directory drag-drop save failed:', error);
        showErrorToast('Move failed. Changes reverted.');
        triggerRerender();
      }
    }
  );
}

/**
 * Trigger re-render of both directory and sidebar
 */
function triggerRerender() {
  // Re-render directory listing
  if (_renderCallback) {
    _renderCallback();
  }

  // Also update sidebar to stay in sync
  if (window.Layer?.SideList?.renderSideList) {
    window.Layer.SideList.renderSideList();
  }
}

/**
 * Build the array of updates needed for the position change
 * Gets ALL items in the folder (all types) and renumbers them
 */
function buildUpdatesArray(type, id, targetParentId, prevEl, nextEl) {
  const data = AppState.getData();
  const BookmarkStorage = window.Layer?.BookmarkStorage;

  // Get ALL items in the target folder (all types share the same orderIndex space)
  let allItems = [];

  // Folders (children of targetParentId)
  data.folders
    .filter(f => (f.parentId || null) === targetParentId)
    .forEach(f => allItems.push({ ...f, _type: 'folder' }));

  // Objectives
  data.objectives
    .filter(o => (o.folderId || null) === targetParentId)
    .forEach(o => allItems.push({ ...o, _type: 'objective' }));

  // Notes
  (data.notes || [])
    .filter(n => (n.folderId || null) === targetParentId)
    .forEach(n => allItems.push({ ...n, _type: 'note' }));

  // Bookmarks (not shown in directory but keep their positions)
  (BookmarkStorage?.loadAllBookmarks() || [])
    .filter(b => (b.folderId || null) === targetParentId)
    .forEach(b => allItems.push({ ...b, _type: 'bookmark' }));

  // Sort all by current orderIndex
  allItems.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  // Remove the dropped item from the list (if it was already there)
  allItems = allItems.filter(item => item.id !== id);

  // Find the dropped item from its original location
  let droppedItem;
  if (type === 'folder') {
    droppedItem = data.folders.find(f => f.id === id);
  } else if (type === 'objective') {
    droppedItem = data.objectives.find(o => o.id === id);
  } else if (type === 'note') {
    droppedItem = (data.notes || []).find(n => n.id === id);
  } else if (type === 'bookmark') {
    droppedItem = (BookmarkStorage?.loadAllBookmarks() || []).find(b => b.id === id);
  }

  if (!droppedItem) {
    return null;
  }

  // Add type marker to dropped item
  const droppedWithType = { ...droppedItem, _type: type };

  // Determine insert position based on prev/next
  let insertIndex = 0;

  if (prevEl) {
    const prevId = prevEl.dataset.id;
    // Find prev item in allItems (any type)
    const prevIndex = allItems.findIndex(item => item.id === prevId);
    if (prevIndex !== -1) {
      insertIndex = prevIndex + 1;
    }
  } else if (!nextEl) {
    // No prev and no next = dropping INTO folder (center zone drop)
    // Insert at end
    insertIndex = allItems.length;
  }

  // Insert dropped item at position
  allItems.splice(insertIndex, 0, droppedWithType);

  // Renumber ALL items and build updates with correct parent field per type
  return allItems.map((item, index) => ({
    id: item.id,
    _type: item._type,
    orderIndex: index * 1000,
    parentId: item._type === 'folder' ? targetParentId : undefined,
    folderId: item._type !== 'folder' ? targetParentId : undefined
  }));
}

/**
 * Apply updates to local state (mutate AppState directly)
 */
function applyUpdatesLocally(type, updates) {
  const data = AppState.getData();
  const BookmarkStorage = window.Layer?.BookmarkStorage;

  for (const update of updates) {
    const itemType = update._type || type;

    if (itemType === 'folder') {
      const folder = data.folders.find(f => f.id === update.id);
      if (folder) {
        folder.orderIndex = update.orderIndex;
        folder.parentId = update.parentId;
      }
    } else if (itemType === 'objective') {
      const objective = data.objectives.find(o => o.id === update.id);
      if (objective) {
        objective.orderIndex = update.orderIndex;
        objective.folderId = update.folderId;
      }
    } else if (itemType === 'note') {
      const note = (data.notes || []).find(n => n.id === update.id);
      if (note) {
        note.orderIndex = update.orderIndex;
        note.folderId = update.folderId;
      }
    } else if (itemType === 'bookmark') {
      BookmarkStorage?.updateBookmarkOrder?.(update.id, update.orderIndex, update.folderId);
    }
  }
}

/**
 * Persist updates to database
 */
async function persistUpdates(type, updates, Repository, NoteStorage, BookmarkStorage) {
  const savePromises = [];

  for (const update of updates) {
    const itemType = update._type || type;

    if (itemType === 'folder' && Repository?.updateFolder) {
      savePromises.push(
        Repository.updateFolder({ id: update.id, orderIndex: update.orderIndex, parentId: update.parentId })
      );
    } else if (itemType === 'objective' && Repository?.updateObjectiveOrder) {
      savePromises.push(
        Repository.updateObjectiveOrder(update.id, update.orderIndex, update.folderId)
      );
    } else if (itemType === 'note' && NoteStorage?.updateNoteOrder) {
      savePromises.push(
        NoteStorage.updateNoteOrder(update.id, update.orderIndex, update.folderId)
      );
    }
    // Bookmarks are localStorage-only, already updated in applyUpdatesLocally
  }

  await Promise.all(savePromises);
}

// ========================================
// Export
// ========================================

export default {
  initDirectorySortable,
  destroyDirectorySortable,
  refreshDirectorySortable
};
