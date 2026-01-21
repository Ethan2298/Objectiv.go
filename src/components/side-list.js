/**
 * Side List Component
 *
 * Renders the side list with objectives and folders, handles drag-drop.
 */

import AppState from '../state/app-state.js';
import * as TabState from '../state/tab-state.js';
import * as TabContentManager from '../state/tab-content-manager.js';
import * as BookmarkStorage from '../data/bookmark-storage.js';

// ========================================
// Callbacks (set by app.js)
// ========================================

let _renderContentView = () => {};
let _updateView = () => {};
let _playNotch = () => {};
let _updateTabTitle = () => {};

export function setCallbacks({ renderContentView, updateView, playNotch, updateTabTitle }) {
  if (renderContentView) _renderContentView = renderContentView;
  if (updateView) _updateView = updateView;
  if (playNotch) _playNotch = playNotch;
  if (updateTabTitle) _updateTabTitle = updateTabTitle;
}

// ========================================
// Main Render Function
// ========================================

/**
 * Render the unified side list (objectives + folders)
 */
export async function renderSideList() {
  const container = document.getElementById('side-list-items');
  if (!container) return;

  // Reset content load tracking when list is rebuilt
  AppState.resetContentLoadTracking();

  const SideListState = window.Objectiv?.SideListState;
  const data = AppState.getData();
  const promptMode = AppState.getPromptMode();
  const promptTargetSection = AppState.getPromptTargetSection();

  if (!SideListState) {
    // Fallback to basic render
    container.innerHTML = '';
    renderSideListBasic(container);
    return;
  }

  // Build the unified list
  const isAddingObjective = promptMode === 'add' && promptTargetSection === 'objectives';
  SideListState.rebuildItems({
    objectives: data.objectives,
    folders: data.folders || [],
    notes: data.notes || [],
    isAddingObjective
  });

  const items = SideListState.getItems();
  const selectedIdx = SideListState.getSelectedIndex();
  const isMobile = AppState.isMobile();

  // Build all items in a fragment
  const fragment = document.createDocumentFragment();
  items.forEach((itemData, idx) => {
    const isSelected = !isMobile && idx === selectedIdx;
    const element = createSideListItem(itemData, idx, isSelected);
    fragment.appendChild(element);
  });

  // Swap content
  container.innerHTML = '';
  container.appendChild(fragment);

  // Add insertion indicator for drag positioning
  let insertIndicator = container.querySelector('.drag-insert-indicator');
  if (!insertIndicator) {
    insertIndicator = document.createElement('div');
    insertIndicator.className = 'drag-insert-indicator';
    container.style.position = 'relative';
    container.appendChild(insertIndicator);
  }

  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

}

/**
 * Basic fallback render
 */
function renderSideListBasic(container) {
  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();
  const isMobile = AppState.isMobile();

  data.objectives.forEach((obj, index) => {
    const item = document.createElement('div');
    item.className = 'side-item' + (!isMobile && index === selectedIdx ? ' selected' : '');
    item.innerHTML = `
      <span class="side-item-name">${obj.name}</span>
      <span class="side-item-indicator">\u25CF</span>
    `;
    item.onclick = () => {
      AppState.setSelectedObjectiveIndex(index);
      _updateView();
    };
    container.appendChild(item);
  });
}

// ========================================
// Create Side List Item
// ========================================

/**
 * Create a side list item element based on type
 */
function createSideListItem(itemData, idx, isSelected) {
  const SideListState = window.Objectiv?.SideListState;
  const ItemType = SideListState?.ItemType || {};
  const promptMode = AppState.getPromptMode();
  const promptTargetSection = AppState.getPromptTargetSection();
  const promptTargetIndex = AppState.getPromptTargetIndex();

  const item = document.createElement('div');
  item.className = 'side-item' + (isSelected ? ' selected' : '');
  item.dataset.idx = idx;

  if (itemData.depth !== undefined) {
    item.dataset.depth = itemData.depth;
  }

  const indicator = '<span class="side-item-indicator">\u25CF</span>';

  switch (itemData.type) {
    case ItemType.HOME:
      item.className = 'side-item home-row' + (isSelected ? ' selected' : '');
      item.dataset.type = 'home';
      item.innerHTML = `
        <svg class="home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span class="side-item-name">Home</span>
        ${indicator}
      `;

      item.onclick = (e) => {
        e.stopPropagation();
        SideListState.setSelectedIndex(idx);
        AppState.setViewMode('home');
        updateSideListSelection();
        _renderContentView();
        _updateTabTitle();

        if (AppState.isMobile()) {
          const Mobile = window.Objectiv?.Mobile;
          if (Mobile?.setMobileView) Mobile.setMobileView('detail');
        }
      };
      break;

    case ItemType.UNFILED_HEADER:
      item.className = 'side-item unfiled-header';
      item.innerHTML = '<span class="side-item-name">Unfiled</span>';
      item.dataset.dropTarget = 'unfiled';
      setupDropTarget(item, 'unfiled', null);
      break;

    case ItemType.FOLDER:
      const isExpanded = SideListState.isFolderExpanded(itemData.folderId);
      item.className = 'side-item folder-row' + (isSelected ? ' selected' : '');
      item.dataset.type = 'folder';
      item.dataset.folderId = itemData.folderId;

      const folderIcon = isExpanded
        ? '<svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
        : '<svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';

      item.innerHTML = `
        <button class="folder-toggle">${folderIcon}</button><span class="folder-name">${itemData.name || 'Unnamed Folder'}</span>${indicator}
      `;

      item.onclick = (e) => {
        e.stopPropagation();

        if (e.target.closest('.folder-toggle')) {
          SideListState.toggleFolder(itemData.folderId);
          renderSideList();
          return;
        }

        SideListState.setSelectedIndex(idx);
        AppState.setViewMode('folder');
        updateSideListSelection();
        _renderContentView();
        _updateTabTitle();

        if (AppState.isMobile()) {
          const Mobile = window.Objectiv?.Mobile;
          if (Mobile?.setMobileView) Mobile.setMobileView('detail');
        }
      };

      // Right-click context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showFolderContextMenu(e, itemData);
      });

      setupDraggable(item, 'folder', itemData.folderId, itemData.data);
      setupDropTarget(item, 'folder', itemData.folderId);
      break;

    case ItemType.OBJECTIVE:
      const isEditing = promptMode === 'add' && promptTargetSection === 'objectives' && promptTargetIndex === itemData.index;
      item.dataset.type = 'objective';
      item.dataset.objIndex = itemData.index;
      item.dataset.objectiveId = itemData.objectiveId;
      item.dataset.folderId = itemData.folderId || '';

      const objectiveIcon = `<svg class="objective-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="1"/>
      </svg>`;

      if (isEditing) {
        item.innerHTML = `
          ${objectiveIcon}
          <span class="side-item-name" contenteditable="true" spellcheck="true" data-placeholder="Name your objective"></span>
        `;
        item.style.color = '#0891b2';
      } else {
        item.innerHTML = `
          ${objectiveIcon}
          <span class="side-item-name">${itemData.name}</span>${indicator}
        `;
        item.onclick = () => handleSideItemClick(idx, itemData);

        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showObjectiveContextMenu(e, itemData);
        });
      }

      setupDraggable(item, 'objective', itemData.objectiveId, itemData.data);
      setupDropTarget(item, 'objective', itemData.objectiveId);
      break;

    case ItemType.BOOKMARK:
      item.className = 'side-item bookmark-row' + (isSelected ? ' selected' : '');
      item.dataset.type = 'bookmark';
      item.dataset.bookmarkId = itemData.bookmarkId;
      item.dataset.folderId = itemData.folderId || '';

      // Favicon or globe fallback
      const faviconHtml = itemData.faviconUrl
        ? `<img class="bookmark-favicon" src="${itemData.faviconUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/><svg class="bookmark-globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="display:none"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
        : `<svg class="bookmark-globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

      item.innerHTML = `
        ${faviconHtml}
        <span class="side-item-name">${itemData.name}</span>${indicator}
      `;

      item.onclick = () => handleBookmarkClick(idx, itemData);

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showBookmarkContextMenu(e, itemData);
      });

      setupDraggable(item, 'bookmark', itemData.bookmarkId, itemData.data);
      setupDropTarget(item, 'bookmark', itemData.bookmarkId);
      break;

    case ItemType.NOTE:
      item.className = 'side-item note-row' + (isSelected ? ' selected' : '');
      item.dataset.type = 'note';
      item.dataset.noteId = itemData.noteId;
      item.dataset.folderId = itemData.folderId || '';

      // Note icon (document/page icon)
      const noteIcon = `<svg class="note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>`;

      item.innerHTML = `
        ${noteIcon}
        <span class="side-item-name">${itemData.name || 'Untitled Note'}</span>${indicator}
      `;

      item.onclick = () => handleNoteClick(idx, itemData);

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showNoteContextMenu(e, itemData);
      });

      setupDraggable(item, 'note', itemData.noteId, itemData.data);
      setupDropTarget(item, 'note', itemData.noteId);
      break;

    default:
      item.innerHTML = `<span class="side-item-name">${itemData.name || '?'}</span>`;
  }

  return item;
}

// ========================================
// Side Item Click Handler
// ========================================

/**
 * Handle click on side list item
 */
async function handleSideItemClick(idx, itemData) {
  const SideListState = window.Objectiv?.SideListState;
  const ItemType = SideListState?.ItemType || {};
  const PromptController = window.Objectiv?.PromptController;

  // Clear hover preview
  AppState.setHoverPreviewActive(false);
  AppState.setHoverPreviewItemData(null);

  // Cancel pending content load
  AppState.clearContentLoadTimeout();
  AppState.resetContentLoadTracking();

  // Update selection
  SideListState.setSelectedIndex(idx);
  _playNotch();

  async function executeAction() {
    switch (itemData.type) {
      case ItemType.HOME:
        AppState.setViewMode('home');
        _renderContentView();
        _updateTabTitle();
        updateSideListSelection();
        if (AppState.isMobile()) {
          const Mobile = window.Objectiv?.Mobile;
          if (Mobile?.setMobileView) Mobile.setMobileView('detail');
        }
        break;

      case ItemType.OBJECTIVE:
        if (PromptController?.commitEditInPlace) PromptController.commitEditInPlace();
        AppState.setSelectedObjectiveIndex(itemData.index);
        AppState.setViewMode('objective');
        _renderContentView();
        _updateTabTitle();
        updateSideListSelection();
        if (AppState.isMobile()) {
          const Mobile = window.Objectiv?.Mobile;
          if (Mobile?.setMobileView) Mobile.setMobileView('detail');
        }
        break;

      case ItemType.FOLDER:
        AppState.setViewMode('folder');
        _renderContentView();
        _updateTabTitle();
        updateSideListSelection();
        if (AppState.isMobile()) {
          const Mobile = window.Objectiv?.Mobile;
          if (Mobile?.setMobileView) Mobile.setMobileView('detail');
        }
        break;
    }
  }

  // Execute immediately - no scroll manipulation
  executeAction();
}

// ========================================
// Selection Update
// ========================================

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
    } else {
      item.classList.remove('selected');
    }
  });
}

// ========================================
// Context Menus
// ========================================

function showObjectiveContextMenu(e, itemData) {
  const ContextMenu = window.Objectiv?.ContextMenu;
  const DeleteModal = window.Objectiv?.DeleteModal;

  if (!ContextMenu) return;

  ContextMenu.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: 'Delete',
        danger: true,
        action: () => {
          if (!DeleteModal) return;

          DeleteModal.showDeleteModal({
            itemName: itemData.name || 'Unnamed Objective',
            itemType: 'objective',
            onConfirm: async () => {
              try {
                const data = AppState.getData();
                const objective = data.objectives.find(o => o.id === itemData.objectiveId);
                if (!objective) return;

                if (window.Objectiv?.Repository?.deleteOneObjective) {
                  await window.Objectiv.Repository.deleteOneObjective(objective);
                }

                data.objectives = data.objectives.filter(o => o.id !== itemData.objectiveId);

                let selectedIdx = AppState.getSelectedObjectiveIndex();
                if (selectedIdx >= data.objectives.length) {
                  selectedIdx = Math.max(0, data.objectives.length - 1);
                  AppState.setSelectedObjectiveIndex(selectedIdx);
                }

                _updateView();
              } catch (err) {
                console.error('Failed to delete objective:', err);
              }
            }
          });
        }
      }
    ]
  });
}

function showFolderContextMenu(e, itemData) {
  const ContextMenu = window.Objectiv?.ContextMenu;
  const DeleteModal = window.Objectiv?.DeleteModal;

  if (!ContextMenu) return;

  ContextMenu.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: 'Delete',
        danger: true,
        action: () => {
          if (!DeleteModal) return;

          DeleteModal.showDeleteModal({
            itemName: itemData.name || 'Unnamed Folder',
            itemType: 'folder',
            onConfirm: async () => {
              try {
                const data = AppState.getData();

                if (window.Objectiv?.Repository?.deleteFolder) {
                  await window.Objectiv.Repository.deleteFolder(itemData.folderId);
                }

                data.folders = data.folders.filter(f => f.id !== itemData.folderId);

                // Move objectives in this folder to unfiled
                const Repository = window.Objectiv?.Repository;
                for (const obj of data.objectives) {
                  if (obj.folderId === itemData.folderId) {
                    obj.folderId = null;
                    if (Repository?.saveOneObjective) {
                      await Repository.saveOneObjective(obj);
                    }
                  }
                }

                _updateView();
              } catch (err) {
                console.error('Failed to delete folder:', err);
              }
            }
          });
        }
      }
    ]
  });
}

/**
 * Handle click on a bookmark item
 */
function handleBookmarkClick(idx, itemData) {
  const SideListState = window.Objectiv?.SideListState;
  const GlobalNav = window.Objectiv?.GlobalNav;

  // Update selection
  SideListState.setSelectedIndex(idx);
  _playNotch();

  // Switch to web mode and load the URL
  AppState.setViewMode('web');
  const app = document.getElementById('app');
  app?.classList.add('web-mode');

  updateSideListSelection();
  _renderContentView();
  _updateTabTitle();

  // Load the URL in the webview after render
  setTimeout(() => {
    const activeTabId = TabState.getActiveTabId();
    const webview = TabContentManager.getWebview(activeTabId);
    if (webview && itemData.url) {
      webview.src = itemData.url;

      // Update nav bar
      if (GlobalNav?.setUrl) {
        GlobalNav.setUrl(itemData.url);
      }
    }
  }, 50);

  if (AppState.isMobile()) {
    const Mobile = window.Objectiv?.Mobile;
    if (Mobile?.setMobileView) Mobile.setMobileView('detail');
  }
}

/**
 * Handle click on a note item
 */
function handleNoteClick(idx, itemData) {
  const SideListState = window.Objectiv?.SideListState;

  // Update selection
  SideListState.setSelectedIndex(idx);
  _playNotch();

  // Switch to note view mode
  AppState.setViewMode('note');

  updateSideListSelection();
  _renderContentView();
  _updateTabTitle();

  if (AppState.isMobile()) {
    const Mobile = window.Objectiv?.Mobile;
    if (Mobile?.setMobileView) Mobile.setMobileView('detail');
  }
}

/**
 * Show context menu for bookmark items
 */
function showBookmarkContextMenu(e, itemData) {
  const ContextMenu = window.Objectiv?.ContextMenu;
  const DeleteModal = window.Objectiv?.DeleteModal;

  if (!ContextMenu) return;

  ContextMenu.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: 'Delete',
        danger: true,
        action: () => {
          if (!DeleteModal) return;

          DeleteModal.showDeleteModal({
            itemName: itemData.name || 'Bookmark',
            itemType: 'bookmark',
            onConfirm: async () => {
              try {
                BookmarkStorage.deleteBookmark(itemData.bookmarkId);
                _updateView();
              } catch (err) {
                console.error('Failed to delete bookmark:', err);
              }
            }
          });
        }
      }
    ]
  });
}

/**
 * Show context menu for note items
 */
function showNoteContextMenu(e, itemData) {
  const ContextMenu = window.Objectiv?.ContextMenu;
  const DeleteModal = window.Objectiv?.DeleteModal;
  const NoteStorage = window.Objectiv?.NoteStorage;

  if (!ContextMenu) return;

  ContextMenu.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: 'Delete',
        danger: true,
        action: () => {
          if (!DeleteModal) return;

          DeleteModal.showDeleteModal({
            itemName: itemData.name || 'Untitled Note',
            itemType: 'note',
            onConfirm: async () => {
              try {
                if (NoteStorage?.deleteNote) {
                  await NoteStorage.deleteNote(itemData.noteId);
                }

                // Update local state
                const data = AppState.getData();
                data.notes = data.notes.filter(n => n.id !== itemData.noteId);

                _updateView();
              } catch (err) {
                console.error('Failed to delete note:', err);
              }
            }
          });
        }
      }
    ]
  });
}

// ========================================
// Drag and Drop
// ========================================

/**
 * Hide the insertion indicator line
 */
function hideInsertionIndicator() {
  const container = document.getElementById('side-list-items');
  const indicator = container?.querySelector('.drag-insert-indicator');
  if (indicator) {
    indicator.classList.remove('visible');
  }
}

/**
 * Show the insertion indicator line
 */
function showInsertionIndicator(element, position) {
  const container = document.getElementById('side-list-items');
  const indicator = container?.querySelector('.drag-insert-indicator');
  if (!indicator) return;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const y = position === 'before'
    ? elementRect.top - containerRect.top - 1
    : elementRect.bottom - containerRect.top - 1;

  indicator.style.top = `${y}px`;
  indicator.classList.add('visible');
}

/**
 * Setup drag handlers
 */
function setupDraggable(element, type, id, itemData) {
  element.draggable = true;

  element.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ type, id }));
    element.classList.add('dragging');
    AppState.setDraggedItem({ type, id, data: itemData });
  });

  element.addEventListener('dragend', (e) => {
    element.classList.remove('dragging');
    AppState.setDraggedItem(null);
    AppState.setDragInsertPosition(null);
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
    hideInsertionIndicator();
  });
}

/**
 * Setup drop target handlers
 */
function setupDropTarget(element, targetType, targetId) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggedItem = AppState.getDraggedItem();
    if (!draggedItem) return;

    const { type: dragType, id: dragId } = draggedItem;

    // Can't drop on self
    if (dragType === 'folder' && targetType === 'folder' && dragId === targetId) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    if (dragType === 'objective' && targetType === 'objective' && dragId === targetId) {
      e.dataTransfer.dropEffect = 'none';
      hideInsertionIndicator();
      return;
    }

    e.dataTransfer.dropEffect = 'move';

    if (targetType === 'objective' && (dragType === 'objective' || dragType === 'folder')) {
      const rect = element.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? 'before' : 'after';
      const targetFolderId = element.dataset.folderId || null;

      AppState.setDragInsertPosition({
        targetId,
        targetType,
        position,
        folderId: targetFolderId
      });

      showInsertionIndicator(element, position);
      element.classList.remove('drag-over');
    } else if (targetType === 'folder') {
      element.classList.add('drag-over-folder');
      hideInsertionIndicator();
      AppState.setDragInsertPosition({
        targetId,
        targetType: 'folder',
        position: 'into',
        folderId: targetId
      });
    } else {
      element.classList.add('drag-over');
      hideInsertionIndicator();
      AppState.setDragInsertPosition({
        targetId,
        targetType,
        position: 'into',
        folderId: null
      });
    }
  });

  element.addEventListener('dragleave', (e) => {
    element.classList.remove('drag-over');
    element.classList.remove('drag-over-folder');
  });

  element.addEventListener('drop', async (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
    element.classList.remove('drag-over-folder');
    hideInsertionIndicator();

    const draggedItem = AppState.getDraggedItem();
    if (!draggedItem) return;

    const { type: dragType, id: dragId, data: dragData } = draggedItem;
    const insertPosition = AppState.getDragInsertPosition();
    AppState.setDraggedItem(null);
    AppState.setDragInsertPosition(null);

    try {
      if (dragType === 'objective') {
        await handleObjectiveDrop(dragId, dragData, insertPosition);
      } else if (dragType === 'folder') {
        await handleFolderDrop(dragId, dragData, insertPosition);
      } else if (dragType === 'bookmark') {
        await handleBookmarkDrop(dragId, dragData, insertPosition);
      } else if (dragType === 'note') {
        await handleNoteDrop(dragId, dragData, insertPosition);
      }
    } catch (err) {
      console.error('Drop failed:', err);
    }
  });
}

// ========================================
// Drop Handlers
// ========================================

async function handleObjectiveDrop(dragId, dragData, insertPosition) {
  if (!insertPosition) return;

  const Repository = window.Objectiv?.Repository;
  if (!Repository?.updateObjectiveOrder) return;

  const data = AppState.getData();
  const { targetId, targetType, position, folderId } = insertPosition;

  const newFolderId = targetType === 'unfiled' ? null :
                      targetType === 'folder' ? targetId : folderId;

  let newOrderIndex;

  if (targetType === 'objective' && (position === 'before' || position === 'after')) {
    newOrderIndex = calculateOrderIndex(targetId, position, newFolderId, data.objectives);
  } else if (targetType === 'folder') {
    newOrderIndex = calculateOrderIndexForFolderEnd(targetId, data.objectives);
  } else {
    newOrderIndex = calculateOrderIndexForUnfiledEnd(data.objectives);
  }

  await Repository.updateObjectiveOrder(dragId, newOrderIndex, newFolderId);

  const reloadedData = await Repository.reloadData();
  if (reloadedData) AppState.setObjectives(reloadedData.objectives);
  renderSideList();
}

async function handleFolderDrop(dragId, dragData, insertPosition) {
  if (!insertPosition) return;

  const Repository = window.Objectiv?.Repository;
  if (!Repository?.updateFolder) return;

  const data = AppState.getData();
  const { targetId, targetType, position, folderId } = insertPosition;

  let newParentId;
  if (targetType === 'unfiled') {
    newParentId = null;
  } else if (targetType === 'folder' && position === 'into') {
    newParentId = targetId;
  } else {
    newParentId = folderId;
  }

  let newOrderIndex;
  if (targetType === 'objective' && (position === 'before' || position === 'after')) {
    const targetObj = data.objectives.find(o => o.id === targetId);
    if (targetObj) {
      const targetOrder = targetObj.orderIndex || 0;
      newOrderIndex = position === 'before' ? (targetOrder > 0 ? targetOrder - 1 : 0) : targetOrder + 1;
    } else {
      newOrderIndex = data.folders.length * 1000;
    }
  } else {
    newOrderIndex = data.folders.length * 1000;
  }

  await Repository.updateFolder({ id: dragId, orderIndex: newOrderIndex, parentId: newParentId });

  const folders = await Repository.loadAllFolders();
  AppState.setFolders(folders);
  renderSideList();
}

async function handleBookmarkDrop(dragId, dragData, insertPosition) {
  if (!insertPosition) return;

  const { targetId, targetType, position, folderId } = insertPosition;

  const newFolderId = targetType === 'unfiled' ? null :
                      targetType === 'folder' ? targetId : folderId;

  // Calculate new order index based on position
  const bookmarks = BookmarkStorage.loadAllBookmarks();
  let newOrderIndex;

  if (targetType === 'folder') {
    // Moving into a folder - put at end
    const folderBookmarks = bookmarks.filter(b => b.folderId === targetId);
    newOrderIndex = folderBookmarks.length > 0
      ? Math.max(...folderBookmarks.map(b => b.orderIndex || 0)) + 1000
      : 1000;
  } else {
    // Use a simple timestamp-based order
    newOrderIndex = Date.now();
  }

  BookmarkStorage.updateBookmarkOrder(dragId, newOrderIndex, newFolderId);
  renderSideList();
}

async function handleNoteDrop(dragId, dragData, insertPosition) {
  if (!insertPosition) return;

  const NoteStorage = window.Objectiv?.NoteStorage;
  if (!NoteStorage?.updateNoteOrder) return;

  const { targetId, targetType, position, folderId } = insertPosition;

  const newFolderId = targetType === 'unfiled' ? null :
                      targetType === 'folder' ? targetId : folderId;

  // Calculate new order index based on position
  const data = AppState.getData();
  const notes = data.notes || [];
  let newOrderIndex;

  if (targetType === 'folder') {
    // Moving into a folder - put at end
    const folderNotes = notes.filter(n => n.folderId === targetId);
    newOrderIndex = folderNotes.length > 0
      ? Math.max(...folderNotes.map(n => n.orderIndex || 0)) + 1000
      : 1000;
  } else {
    // Use a simple timestamp-based order
    newOrderIndex = Date.now();
  }

  await NoteStorage.updateNoteOrder(dragId, newOrderIndex, newFolderId);

  // Reload notes
  const reloadedNotes = await NoteStorage.loadAllNotes();
  AppState.setNotes(reloadedNotes);
  renderSideList();
}

// ========================================
// Order Index Calculations
// ========================================

function calculateOrderIndex(targetId, position, folderId, objectives) {
  const contextObjs = objectives
    .filter(o => (o.folderId || null) === folderId)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  const targetIdx = contextObjs.findIndex(o => o.id === targetId);
  if (targetIdx === -1) {
    return (contextObjs.length + 1) * 1000;
  }

  const target = contextObjs[targetIdx];
  const targetOrder = target.orderIndex || 0;

  if (position === 'before') {
    if (targetIdx === 0) {
      return Math.floor(targetOrder / 2);
    } else {
      const prev = contextObjs[targetIdx - 1];
      return Math.floor(((prev.orderIndex || 0) + targetOrder) / 2);
    }
  } else {
    if (targetIdx === contextObjs.length - 1) {
      return targetOrder + 1000;
    } else {
      const next = contextObjs[targetIdx + 1];
      return Math.floor((targetOrder + (next.orderIndex || 0)) / 2);
    }
  }
}

function calculateOrderIndexForFolderEnd(folderId, objectives) {
  const folderObjs = objectives
    .filter(o => o.folderId === folderId)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  if (folderObjs.length === 0) return 1000;
  return (folderObjs[folderObjs.length - 1].orderIndex || 0) + 1000;
}

function calculateOrderIndexForUnfiledEnd(objectives) {
  const unfiledObjs = objectives
    .filter(o => !o.folderId)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  if (unfiledObjs.length === 0) return 1000;
  return (unfiledObjs[unfiledObjs.length - 1].orderIndex || 0) + 1000;
}

// ========================================
// Default Export
// ========================================

export default {
  setCallbacks,
  renderSideList,
  updateSideListSelection
};
