/**
 * Side List Sortable - jQuery UI Sortable integration for drag-drop
 *
 * Uses flat folderId + orderIndex model for positioning.
 * On drop: determine target folder from neighbors, renumber all siblings.
 *
 * Drop zones:
 * - Top/bottom 25% of folder row = reorder (drop above/below)
 * - Center 50% of folder row = drop INTO folder
 *
 * Uses optimistic updates: UI updates immediately, persistence happens
 * in background. On failure, state is rolled back and error toast shown.
 */

import AppState from '../state/app-state.js';
import * as TreeUtils from '../data/tree-utils.js';
import * as OptimisticState from '../state/optimistic-state.js';
import { showErrorToast } from './toast.js';

// ========================================
// Configuration
// ========================================

// Track which folder we're hovering over during drag
let _hoverTargetFolderId = null;
let _draggedItemType = null;
let _draggedItemId = null;

const SORTABLE_OPTIONS = {
  items: '> .side-item[data-sortable="true"]',
  placeholder: 'sortable-placeholder',
  tolerance: 'pointer',
  revert: false,
  scrollSensitivity: 60,  // Start scrolling sooner when near edge
  scrollSpeed: 25,
  cursor: 'grabbing',
  zIndex: 1000,
  delay: 0,              // No delay - immediate drag response
  distance: 4,           // Minimal distance to prevent accidental drags
  connectWith: '.sortable-container',
  cursorAt: { top: 20, left: 20 }, // Offset helper from cursor for better visibility
  helper: function(e, item) {
    // For folders, hide children before creating helper
    if (item.hasClass('folder-row')) {
      item.next('.folder-children').addClass('drag-hidden');
    }
    // Use clone so original stays in place and doesn't interfere with drop detection
    const $clone = item.clone();
    $clone.css({
      width: item.outerWidth(),
      height: item.outerHeight()
    });
    return $clone;
  }
};

// ========================================
// Callbacks (set by side-list.js)
// ========================================

let _renderSideList = () => {};

export function setRenderCallback(renderFn) {
  _renderSideList = renderFn;
}

// ========================================
// Main Initialization
// ========================================

/**
 * Initialize jQuery UI Sortable on all sortable containers
 * Call this after renderSideList() completes
 */
export function initSortable() {
  // Initialize on main container
  const $mainContainer = $('#side-list-items');
  if (!$mainContainer.length) return;

  // Check if jQuery UI is loaded
  if (!$.fn.sortable) {
    console.error('jQuery UI Sortable not loaded!');
    return;
  }

  // Destroy all existing sortables first
  destroySortable();

  // Initialize sortable on main container
  initSortableContainer($mainContainer, null);

  // Initialize sortable on all nested folder containers
  $('.folder-children.sortable-container').each(function() {
    const $container = $(this);
    const parentId = $container.data('parentId');
    initSortableContainer($container, parentId);
  });

  // Initialize folder droppables for "drop into" functionality
  initFolderDroppables();

  // Make sortable items visually interactive
  $('.side-item[data-sortable="true"]').addClass('sortable-enabled');
}

/**
 * Initialize sortable on a single container
 */
function initSortableContainer($container, parentId) {
  $container.sortable({
    ...SORTABLE_OPTIONS,

    start: handleDragStart,
    change: handleDragChange,
    stop: handleDragStop,
    sort: handleSort, // Fires continuously during drag - used for folder hover detection
    receive: handleReceive
  });

  // Store parent ID on container for later reference
  $container.data('parentFolderId', parentId);
}

/**
 * Initialize folder droppables for dropping items INTO folders
 * Uses jQuery UI Droppable with hoverClass for visual feedback
 */
function initFolderDroppables() {
  $('.side-item.folder-row').each(function() {
    const $folder = $(this);
    const folderId = $folder.data('folderId');

    // Skip if already a droppable
    if ($folder.data('ui-droppable')) {
      $folder.droppable('destroy');
    }

    $folder.droppable({
      accept: '.side-item[data-sortable="true"]',
      tolerance: 'pointer',
      greedy: true, // Prevents event bubbling to parent droppables

      over: function(e, ui) {
        // Check if cursor is in center zone (middle 50%) of folder
        // Top/bottom 25% reserved for reordering between items
        const folderRect = $folder[0].getBoundingClientRect();
        const cursorY = e.pageY - window.scrollY;
        const relativeY = cursorY - folderRect.top;
        const threshold = folderRect.height * 0.25;

        const inCenterZone = relativeY > threshold && relativeY < (folderRect.height - threshold);

        if (!inCenterZone || !isValidDropTarget(folderId)) {
          $folder.removeClass('folder-drop-hover');
          _hoverTargetFolderId = null;
          $('#side-list-items, .sortable-container').find('.sortable-placeholder').show();
          return;
        }

        $folder.addClass('folder-drop-hover');
        _hoverTargetFolderId = folderId;

        // Hide sortable placeholder when over center of a folder
        $('#side-list-items, .sortable-container').find('.sortable-placeholder').hide();
      },

      out: function(e, ui) {
        $folder.removeClass('folder-drop-hover');
        if (_hoverTargetFolderId === folderId) {
          _hoverTargetFolderId = null;
        }
        // Show sortable placeholder again
        $('#side-list-items, .sortable-container').find('.sortable-placeholder').show();
      },

      drop: function(e, ui) {
        // Drop is handled by sortable's stop event using _hoverTargetFolderId
        // This just provides the visual feedback
      }
    });
  });
}

/**
 * Check if a folder is a valid drop target for the currently dragged item
 */
function isValidDropTarget(targetFolderId) {
  // Can't drop folder into itself
  if (_draggedItemType === 'folder' && _draggedItemId === targetFolderId) {
    return false;
  }

  // Can't drop folder into its own descendants
  if (_draggedItemType === 'folder') {
    const tree = AppState.getTree();
    if (TreeUtils.isDescendantOf(tree, targetFolderId, _draggedItemId)) {
      return false;
    }
  }

  return true;
}

// ========================================
// Drag Event Handlers
// ========================================

function handleDragStart(e, ui) {
  const $item = $(ui.item);
  const type = $item.data('type');
  const id = getItemId($item);

  // Store drag state in module scope for hover detection
  _draggedItemType = type;
  _draggedItemId = id;
  _hoverTargetFolderId = null;

  // Store drag state in AppState
  const $parentContainer = $item.closest('.sortable-container').length
    ? $item.closest('.sortable-container')
    : $item.closest('#side-list-items');
  AppState.setDraggedItem({
    type,
    id,
    originalParentId: $parentContainer.data('parentFolderId') || null
  });

  // Visual feedback
  $item.addClass('dragging');
  $('#side-list-items').addClass('is-dragging');

  // Mark invalid drop targets when dragging a folder
  if (type === 'folder') {
    markInvalidDropTargets(id);
  }
}

function handleDragChange(e, ui) {
  // Placeholder is automatically moved by jQuery UI
}

/**
 * Mark folders that cannot accept the dragged folder (circular reference prevention)
 */
function markInvalidDropTargets(draggedFolderId) {
  const tree = AppState.getTree();

  $('.side-item.folder-row').each(function() {
    const $folder = $(this);
    const targetId = $folder.data('folderId');

    // Can't drop into self
    if (targetId === draggedFolderId) {
      $folder.addClass('drop-invalid');
      return;
    }

    // Can't drop into descendants
    if (TreeUtils.isDescendantOf(tree, targetId, draggedFolderId)) {
      $folder.addClass('drop-invalid');
    }
  });
}

/**
 * Handle sort event - fires continuously during drag
 * Checks cursor position to determine folder drop vs reorder
 */
function handleSort(e, ui) {
  const cursorY = e.pageY;

  // Check all folders to see if cursor is in their center zone
  let foundFolderDrop = false;

  $('.side-item.folder-row').each(function() {
    const $folder = $(this);
    const folderId = $folder.data('folderId');
    const folderRect = this.getBoundingClientRect();

    // Check if cursor is horizontally within folder
    const cursorX = e.pageX;
    if (cursorX < folderRect.left || cursorX > folderRect.right) {
      $folder.removeClass('folder-drop-hover');
      return true; // continue
    }

    // Check if cursor is vertically within folder
    const folderTop = folderRect.top + window.scrollY;
    const folderBottom = folderTop + folderRect.height;

    if (cursorY < folderTop || cursorY > folderBottom) {
      $folder.removeClass('folder-drop-hover');
      return true; // continue
    }

    // Cursor is over this folder - check if in center zone (middle 50%)
    const relativeY = cursorY - folderTop;
    const threshold = folderRect.height * 0.25;
    const inCenterZone = relativeY > threshold && relativeY < (folderRect.height - threshold);

    if (inCenterZone && isValidDropTarget(folderId)) {
      $folder.addClass('folder-drop-hover');
      _hoverTargetFolderId = folderId;
      foundFolderDrop = true;
      // Hide placeholder when dropping into folder
      $('.sortable-placeholder').hide();
      return false; // break
    } else {
      $folder.removeClass('folder-drop-hover');
    }
  });

  // If not over any folder center zone, clear hover state and show placeholder
  if (!foundFolderDrop) {
    _hoverTargetFolderId = null;
    $('.sortable-placeholder').show();
  }
}

/**
 * Handle item received from another container
 */
function handleReceive(e, ui) {
  // This fires on the receiving container when an item moves between containers
  // The actual move is handled in handleDragStop
}

/**
 * Handle drag stop - update tree and persist
 */
async function handleDragStop(e, ui) {
  const $item = $(ui.item);
  const type = $item.data('type');
  const id = getItemId($item);

  // Capture hover target before cleanup
  const dropIntoFolderId = _hoverTargetFolderId;

  // Clean up visual state
  $item.removeClass('dragging');
  $('#side-list-items').removeClass('is-dragging');
  $('.folder-drop-hover').removeClass('folder-drop-hover');
  $('.drag-hidden').removeClass('drag-hidden');
  $('.drop-invalid').removeClass('drop-invalid');

  // Clear module-level drag state
  _draggedItemType = null;
  _draggedItemId = null;
  _hoverTargetFolderId = null;

  // Clear AppState drag state
  AppState.setDraggedItem(null);

  // If we're hovering over a valid folder, drop INTO that folder
  if (dropIntoFolderId) {
    console.log('Dropping into folder:', { type, id, folderId: dropIntoFolderId });

    // Cancel the sortable's DOM changes - we're doing a folder drop instead
    $('#side-list-items, .sortable-container').each(function() {
      if ($(this).data('ui-sortable')) {
        $(this).sortable('cancel');
      }
    });

    await handleDropIntoFolder(type, id, dropIntoFolderId);
    return;
  }

  // Otherwise, handle as normal reorder using flat folderId + orderIndex model
  const $prev = $item.prev('.side-item');
  const $next = $item.next('.side-item');

  // Determine target parent from neighbors
  const targetParentId = getTargetParentId($prev, $next, type);

  console.log('Drop reorder:', { type, id, targetParentId, prev: $prev.data('type'), next: $next.data('type') });

  // Update item and renumber siblings
  await updateItemPosition(type, id, targetParentId, $prev, $next);
}

/**
 * Handle dropping an item into a folder (center zone drop)
 * Adds item to end of folder
 */
async function handleDropIntoFolder(type, id, folderId) {
  // Use the same updateItemPosition logic but with no prev/next (adds to end)
  await updateItemPosition(type, id, folderId, $(), $());
}

// ========================================
// Utility Functions
// ========================================

/**
 * Get the item ID from data attributes
 * Note: jQuery .data() converts hyphenated names to camelCase
 */
function getItemId($item) {
  const type = $item.data('type');
  switch (type) {
    case 'objective': return $item.data('objectiveId');
    case 'folder': return $item.data('folderId');
    case 'bookmark': return $item.data('bookmarkId');
    case 'note': return $item.data('noteId');
    default: return null;
  }
}

/**
 * Get the target parent ID based on neighboring items
 */
function getTargetParentId($prev, $next, droppedType) {
  // If prev is an expanded folder and next is inside it, drop INTO the folder
  if ($prev.length && $prev.data('type') === 'folder') {
    const prevDepth = parseInt($prev.attr('data-depth') || '0', 10);
    const nextDepth = $next.length ? parseInt($next.attr('data-depth') || '0', 10) : -1;

    // Next item is deeper = we're inside the folder
    if (nextDepth > prevDepth) {
      return $prev.data('folderId');
    }
  }

  // If prev is a non-folder item, use its folder
  if ($prev.length && $prev.data('type') !== 'folder') {
    return $prev.data('folderId') || null;
  }

  // If next is a non-folder item, use its folder
  if ($next.length && $next.data('type') !== 'folder') {
    return $next.data('folderId') || null;
  }

  // Root level
  return null;
}

/**
 * Update item position and renumber all siblings in the target folder
 * Uses optimistic updates: UI updates immediately, persistence is async
 */
function updateItemPosition(type, id, targetParentId, $prev, $next) {
  const Repository = window.Layer?.Repository;
  const NoteStorage = window.Layer?.NoteStorage;
  const BookmarkStorage = window.Layer?.BookmarkStorage;

  // Capture scroll position for restoration
  const $container = $('#side-list-items');
  const scrollTop = $container.length ? $container[0].scrollTop : 0;

  // Build updates array before mutation (needed for both local and persist)
  const updates = buildUpdatesArray(type, id, targetParentId, $prev, $next);

  if (!updates) {
    console.error('Could not build updates for:', type, id);
    _renderSideList();
    restoreScroll(scrollTop);
    return;
  }

  console.log('Saving updates:', updates);

  // Optimistic update: local first, persist async
  OptimisticState.optimisticUpdate(
    // Local mutation (synchronous)
    () => {
      applyUpdatesLocally(type, updates);
      AppState.rebuildTree(BookmarkStorage?.loadAllBookmarks?.() || []);
      _renderSideList();
      restoreScroll(scrollTop);
    },
    // Persist function (async)
    async () => {
      await persistUpdates(type, updates, Repository, NoteStorage, BookmarkStorage);
    },
    // Options
    {
      onError: (error) => {
        console.error('Drag-drop save failed:', error);
        showErrorToast('Move failed. Changes reverted.');
        _renderSideList();
        restoreScroll(scrollTop);
      }
    }
  );
}

/**
 * Build the array of updates needed for the position change
 * Gets ALL items in the folder (all types) and renumbers them
 */
function buildUpdatesArray(type, id, targetParentId, $prev, $next) {
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

  // Bookmarks
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

  if ($prev.length) {
    const prevId = getItemId($prev);
    // Find prev item in allItems (any type)
    const prevIndex = allItems.findIndex(item => item.id === prevId);
    if (prevIndex !== -1) {
      insertIndex = prevIndex + 1;
    }
  } else if (!$next.length) {
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
 * Handles mixed types since updates now include _type field
 */
function applyUpdatesLocally(type, updates) {
  const data = AppState.getData();
  const BookmarkStorage = window.Layer?.BookmarkStorage;

  for (const update of updates) {
    // Use _type from update if available, otherwise fall back to passed type
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
      // Bookmarks use localStorage - update directly
      BookmarkStorage?.updateBookmarkOrder?.(update.id, update.orderIndex, update.folderId);
    }
  }
}

/**
 * Persist updates to database
 * Handles mixed types since updates now include _type field
 */
async function persistUpdates(type, updates, Repository, NoteStorage, BookmarkStorage) {
  const savePromises = [];

  for (const update of updates) {
    // Use _type from update if available, otherwise fall back to passed type
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

  // Run all saves in parallel
  await Promise.all(savePromises);
}

/**
 * Restore scroll position after re-render
 */
function restoreScroll(scrollTop) {
  const $container = $('#side-list-items');
  if ($container.length && scrollTop > 0) {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      $container[0].scrollTop = scrollTop;
    });
  }
}

// ========================================
// Refresh/Cleanup
// ========================================

/**
 * Refresh sortable after list re-render
 */
export function refreshSortable() {
  initSortable();
}

/**
 * Destroy all sortable instances
 */
export function destroySortable() {
  // Destroy main container sortable
  const $mainContainer = $('#side-list-items');
  if ($mainContainer.data('ui-sortable')) {
    $mainContainer.sortable('destroy');
  }

  // Destroy nested container sortables
  $('.folder-children.sortable-container').each(function() {
    if ($(this).data('ui-sortable')) {
      $(this).sortable('destroy');
    }
  });

  // Remove folder hover event handlers
  $('.side-item.folder-row').off('mouseenter.folderdrop mouseleave.folderdrop');

  // Reset module state
  _hoverTargetFolderId = null;
  _draggedItemType = null;
  _draggedItemId = null;
}

// ========================================
// Export
// ========================================

export default {
  initSortable,
  refreshSortable,
  destroySortable,
  setRenderCallback
};
