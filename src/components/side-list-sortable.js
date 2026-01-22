/**
 * Side List Sortable - jQuery UI Sortable integration for drag-drop
 *
 * Uses tree data model for hierarchical drag-drop operations.
 * Nested sortable containers with connectWith for cross-container dragging.
 *
 * Folder-into-folder drops are handled via hover detection during sortable drag,
 * NOT via jQuery UI Droppable (which conflicts with Sortable).
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
  revert: 100,
  scrollSensitivity: 40,
  scrollSpeed: 20,
  cursor: 'grabbing',
  opacity: 0.9,
  zIndex: 1000,
  delay: 50,
  distance: 5,
  connectWith: '.sortable-container', // Allow dragging between containers
  helper: function(e, item) {
    // For folders, hide children before creating helper
    if (item.hasClass('folder-row')) {
      item.next('.folder-children').addClass('drag-hidden');
    }
    return item; // Use original element as helper
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
    receive: handleReceive, // Fired when item moves between containers
    over: handleDragOver,
    out: handleDragOut
  });

  // Store parent ID on container for later reference
  $container.data('parentFolderId', parentId);
}

/**
 * Initialize folder hover detection for dropping items INTO folders
 * Uses mouse events instead of jQuery UI Droppable (which conflicts with Sortable)
 */
function initFolderDroppables() {
  $('.side-item.folder-row').each(function() {
    const $folder = $(this);
    const folderId = $folder.data('folderId');

    // Use mouseenter/mouseleave for hover detection during drag
    $folder.off('mouseenter.folderdrop mouseleave.folderdrop');

    $folder.on('mouseenter.folderdrop', function(e) {
      // Only handle if we're dragging something
      if (!_draggedItemId) return;

      // Check if this is a valid drop target
      if (!isValidDropTarget(folderId)) {
        return;
      }

      // Set as hover target and show visual feedback
      _hoverTargetFolderId = folderId;
      $folder.addClass('folder-drop-hover');
    });

    $folder.on('mouseleave.folderdrop', function(e) {
      if (_hoverTargetFolderId === folderId) {
        _hoverTargetFolderId = null;
      }
      $folder.removeClass('folder-drop-hover');
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
  AppState.setDraggedItem({
    type,
    id,
    originalParentId: $item.closest('.sortable-container').data('parentFolderId') || null
  });

  // Visual feedback
  $item.addClass('dragging');

  // Add placeholder sizing based on item height
  ui.placeholder.height($item.outerHeight());

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

function handleDragOver(e, ui) {
  const $target = $(e.target);
  if ($target.hasClass('folder-row')) {
    $target.addClass('folder-drop-hover');
  }
}

function handleDragOut(e, ui) {
  const $target = $(e.target);
  $target.removeClass('folder-drop-hover');
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
    $('.sortable-container').each(function() {
      if ($(this).data('ui-sortable')) {
        $(this).sortable('cancel');
      }
    });

    await handleDropIntoFolder(type, id, dropIntoFolderId);
    return;
  }

  // Otherwise, handle as normal reorder
  const $newContainer = $item.closest('.sortable-container');
  const newParentId = $newContainer.data('parentFolderId') || null;

  // Get the new index among ONLY sortable items
  const $sortableItems = $newContainer.children('.side-item[data-sortable="true"]');
  const newIndex = $sortableItems.index($item);

  console.log('Drag stop (reorder):', { type, id, newParentId, newIndex, totalSortable: $sortableItems.length });

  // Update tree and persist
  await moveItemInTree(type, id, newParentId, newIndex);
}

// ========================================
// Tree Operations
// ========================================

/**
 * Move an item within the tree and persist changes
 */
async function moveItemInTree(type, id, newParentId, newIndex) {
  try {
    // Get current tree (make a copy to avoid mutation issues)
    const tree = AppState.getTree();

    console.log('Moving in tree:', { type, id, newParentId, newIndex });
    console.log('Tree before move:', JSON.stringify(tree.map(t => ({ type: t.type, id: t.id, name: t.name })), null, 2));

    // Move in tree
    const success = TreeUtils.moveInTree(tree, id, type, newParentId, newIndex);

    if (!success) {
      console.error('Failed to move item in tree:', { type, id, newParentId, newIndex });
      _renderSideList();
      return;
    }

    console.log('Tree after move:', JSON.stringify(tree.map(t => ({ type: t.type, id: t.id, name: t.name })), null, 2));

    // Update AppState with modified tree
    AppState.setTree(tree);

    // Persist to storage
    const Repository = window.Objectiv?.Repository;
    if (Repository?.saveTree) {
      await Repository.saveTree(tree);
      console.log('Tree saved to storage');
    }

    // Re-render to update UI
    _renderSideList();

  } catch (err) {
    console.error('Sortable move failed:', err);
    _renderSideList();
  }
}

/**
 * Handle dropping an item into a folder
 */
async function handleDropIntoFolder(type, id, folderId) {
  // Get current tree
  const tree = AppState.getTree();

  // Find the target folder to determine insertion index
  const folder = TreeUtils.findFolder(tree, folderId);
  const newIndex = folder && folder.children ? folder.children.length : 0;

  // Move item to end of folder
  await moveItemInTree(type, id, folderId, newIndex);
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
