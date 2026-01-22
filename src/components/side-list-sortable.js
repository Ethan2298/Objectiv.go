/**
 * Side List Sortable - jQuery UI Sortable integration for drag-drop
 *
 * Uses flat folderId + orderIndex model for positioning.
 * On drop: determine target folder from neighbors, renumber all siblings.
 *
 * Drop zones:
 * - Top/bottom 25% of folder row = reorder (drop above/below)
 * - Center 50% of folder row = drop INTO folder
 */

import AppState from '../state/app-state.js';
import * as TreeUtils from '../data/tree-utils.js';

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
 */
async function updateItemPosition(type, id, targetParentId, $prev, $next) {
  const data = AppState.getData();
  const Repository = window.Layer?.Repository;
  const NoteStorage = window.Layer?.NoteStorage;
  const BookmarkStorage = window.Layer?.BookmarkStorage;

  // Get all siblings in the target parent (same folderId/parentId)
  // Use copies to avoid mutating original data
  let siblings = [];

  if (type === 'folder') {
    siblings = data.folders
      .filter(f => (f.parentId || null) === targetParentId)
      .map(f => ({ ...f }));
  } else if (type === 'objective') {
    siblings = data.objectives
      .filter(o => (o.folderId || null) === targetParentId)
      .map(o => ({ ...o }));
  } else if (type === 'note') {
    siblings = (data.notes || [])
      .filter(n => (n.folderId || null) === targetParentId)
      .map(n => ({ ...n }));
  } else if (type === 'bookmark') {
    siblings = (BookmarkStorage?.loadAllBookmarks() || [])
      .filter(b => (b.folderId || null) === targetParentId)
      .map(b => ({ ...b }));
  }

  // Sort by current orderIndex
  siblings.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  // Remove the dropped item from siblings (if it was already there)
  siblings = siblings.filter(s => s.id !== id);

  // Find the dropped item (make a copy)
  let droppedItem;
  if (type === 'folder') {
    const found = data.folders.find(f => f.id === id);
    droppedItem = found ? { ...found } : null;
  } else if (type === 'objective') {
    const found = data.objectives.find(o => o.id === id);
    droppedItem = found ? { ...found } : null;
  } else if (type === 'note') {
    const found = (data.notes || []).find(n => n.id === id);
    droppedItem = found ? { ...found } : null;
  } else if (type === 'bookmark') {
    const found = (BookmarkStorage?.loadAllBookmarks() || []).find(b => b.id === id);
    droppedItem = found ? { ...found } : null;
  }

  if (!droppedItem) {
    console.error('Could not find dropped item:', type, id);
    _renderSideList();
    return;
  }

  // Determine insert position based on prev/next
  let insertIndex = 0;

  if ($prev.length) {
    const prevId = getItemId($prev);
    const prevType = $prev.data('type');

    // Find prev item in siblings
    if (prevType === type) {
      const prevIndex = siblings.findIndex(s => s.id === prevId);
      if (prevIndex !== -1) {
        insertIndex = prevIndex + 1;
      }
    } else if (prevType === 'folder' && type !== 'folder') {
      // Dropping after a folder row - insert at beginning of folder contents
      insertIndex = 0;
    }
  }

  // Insert dropped item at position
  siblings.splice(insertIndex, 0, droppedItem);

  // Renumber all siblings and set parent
  const updates = siblings.map((item, index) => ({
    id: item.id,
    orderIndex: index * 1000,
    parentId: type === 'folder' ? targetParentId : undefined,
    folderId: type !== 'folder' ? targetParentId : undefined
  }));

  console.log('Saving updates:', updates);

  // Save to database first, then reload fresh data
  try {
    if (type === 'folder' && Repository?.updateFolder) {
      for (const update of updates) {
        await Repository.updateFolder({ id: update.id, orderIndex: update.orderIndex, parentId: update.parentId });
      }
    } else if (type === 'objective' && Repository?.updateObjectiveOrder) {
      for (const update of updates) {
        await Repository.updateObjectiveOrder(update.id, update.orderIndex, update.folderId);
      }
    } else if (type === 'note' && NoteStorage?.updateNoteOrder) {
      for (const update of updates) {
        await NoteStorage.updateNoteOrder(update.id, update.orderIndex, update.folderId);
      }
    } else if (type === 'bookmark' && BookmarkStorage?.updateBookmarkOrder) {
      for (const update of updates) {
        BookmarkStorage.updateBookmarkOrder(update.id, update.orderIndex, update.folderId);
      }
    }

    // Reload fresh data from database
    if (Repository?.reloadData) {
      const reloadedData = await Repository.reloadData();
      if (reloadedData) {
        AppState.setObjectives(reloadedData.objectives);
        AppState.setFolders(reloadedData.folders);
        if (reloadedData.notes) AppState.setNotes(reloadedData.notes);
      }
    }
  } catch (err) {
    console.error('Failed to save position updates:', err);
  }

  _renderSideList();
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
