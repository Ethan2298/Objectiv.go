/**
 * Side List State Module
 *
 * State management for the side list navigation.
 * Manages folders and objectives in a hierarchical structure.
 */

// ========================================
// State Shape
// ========================================

const state = {
  // Current selection index in the flat navigable list
  selectedIndex: 0,

  // Cached flat list of navigable items
  items: [],

  // Set of expanded folder IDs
  expandedFolders: new Set(),

  // Cached folders array
  folders: []
};

// ========================================
// Item Types
// ========================================

export const ItemType = {
  UNFILED_HEADER: 'unfiled-header',
  OBJECTIVE: 'objective',
  FOLDER: 'folder',
  ADD_OBJECTIVE: 'add-objective',
  ADD_FOLDER: 'add-folder'
};

// ========================================
// Getters
// ========================================

export function getSelectedIndex() {
  return state.selectedIndex;
}

export function getItems() {
  return state.items;
}

export function getSelectedItem() {
  return state.items[state.selectedIndex] || null;
}

export function getFolders() {
  return state.folders;
}

export function isFolderExpanded(folderId) {
  return state.expandedFolders.has(folderId);
}

export function getExpandedFolders() {
  return state.expandedFolders;
}

// ========================================
// Actions - Selection
// ========================================

export function setSelectedIndex(index) {
  if (index >= 0 && index < state.items.length) {
    state.selectedIndex = index;
  }
}

export function selectNext() {
  const newIndex = state.selectedIndex + 1;
  if (newIndex < state.items.length) {
    state.selectedIndex = newIndex;
    return true;
  }
  return false;
}

export function selectPrev() {
  const newIndex = state.selectedIndex - 1;
  if (newIndex >= 0) {
    state.selectedIndex = newIndex;
    return true;
  }
  return false;
}

/**
 * Select item by finding it in the list
 */
export function selectItem(type, identifier) {
  const index = state.items.findIndex(item => {
    if (item.type !== type) return false;
    if (type === ItemType.OBJECTIVE) return item.objectiveId === identifier;
    if (type === ItemType.FOLDER) return item.folderId === identifier;
    return false;
  });
  if (index !== -1) {
    state.selectedIndex = index;
    return true;
  }
  return false;
}

// ========================================
// Actions - Folder Expansion
// ========================================

export function toggleFolder(folderId) {
  if (state.expandedFolders.has(folderId)) {
    state.expandedFolders.delete(folderId);
  } else {
    state.expandedFolders.add(folderId);
  }
  saveExpandedFolders();
}

export function expandFolder(folderId) {
  state.expandedFolders.add(folderId);
  saveExpandedFolders();
}

export function collapseFolder(folderId) {
  state.expandedFolders.delete(folderId);
  saveExpandedFolders();
}

// ========================================
// Build Navigable Items List
// ========================================

/**
 * Build the flat list of all navigable items
 * Called whenever objectives or folders change
 *
 * Structure:
 * - Unfiled objectives (in a box at top, no label)
 * - Folders (with nested objectives and subfolders)
 * - Add objective button
 *
 * @param {Object} options
 * @param {Array} options.objectives - Array of objective objects
 * @param {Array} options.folders - Array of folder objects
 * @param {boolean} options.isAddingObjective - Whether currently adding an objective
 */
export function rebuildItems({ objectives = [], folders = [], isAddingObjective = false }) {
  const items = [];

  // Store folders for reference
  state.folders = folders;

  // Separate unfiled objectives (folderId is null or undefined)
  const unfiledObjectives = objectives.filter(obj => !obj.folderId);
  const filedObjectives = objectives.filter(obj => obj.folderId);

  // Build folder tree structure
  const folderMap = new Map();
  folders.forEach(f => folderMap.set(f.id, { ...f, children: [], objectives: [] }));

  // Assign objectives to folders
  filedObjectives.forEach(obj => {
    const folder = folderMap.get(obj.folderId);
    if (folder) {
      folder.objectives.push(obj);
    } else {
      // Folder not found, treat as unfiled
      unfiledObjectives.push(obj);
    }
  });

  // Build folder hierarchy (assign children to parents)
  const rootFolders = [];
  folderMap.forEach(folder => {
    if (folder.parentId) {
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children.push(folder);
      } else {
        rootFolders.push(folder);
      }
    } else {
      rootFolders.push(folder);
    }
  });

  // Combine unfiled objectives and root folders, then sort by orderIndex
  const rootItems = [
    ...unfiledObjectives.map(obj => ({ type: 'objective', data: obj, orderIndex: obj.orderIndex || 0 })),
    ...rootFolders.map(folder => ({ type: 'folder', data: folder, orderIndex: folder.orderIndex || 0 }))
  ].sort((a, b) => a.orderIndex - b.orderIndex);

  // Recursively add folders and their contents
  function addFolderItems(folder, depth) {
    items.push({
      type: ItemType.FOLDER,
      folderId: folder.id,
      data: folder,
      name: folder.name,
      parentId: folder.parentId,
      depth,
      hasChildren: folder.children.length > 0 || folder.objectives.length > 0
    });

    // Only show contents if folder is expanded
    if (state.expandedFolders.has(folder.id)) {
      // Combine objectives and child folders, then sort by orderIndex
      const folderContents = [
        ...folder.objectives.map(obj => ({ type: 'objective', data: obj, orderIndex: obj.orderIndex || 0 })),
        ...folder.children.map(child => ({ type: 'folder', data: child, orderIndex: child.orderIndex || 0 }))
      ].sort((a, b) => a.orderIndex - b.orderIndex);

      folderContents.forEach(item => {
        if (item.type === 'objective') {
          const obj = item.data;
          const objIndex = objectives.indexOf(obj);
          items.push({
            type: ItemType.OBJECTIVE,
            index: objIndex,
            objectiveId: obj.id,
            data: obj,
            name: obj.name,
            folderId: folder.id,
            depth: depth + 1
          });
        } else {
          addFolderItems(item.data, depth + 1);
        }
      });
    }
  }

  // Add root items (interleaved objectives and folders)
  rootItems.forEach(item => {
    if (item.type === 'objective') {
      const obj = item.data;
      const objIndex = objectives.indexOf(obj);
      items.push({
        type: ItemType.OBJECTIVE,
        index: objIndex,
        objectiveId: obj.id,
        data: obj,
        name: obj.name,
        folderId: null,
        depth: 0
      });
    } else {
      addFolderItems(item.data, 0);
    }
  });

  state.items = items;

  // Clamp selection index
  if (state.selectedIndex >= items.length) {
    state.selectedIndex = Math.max(0, items.length - 1);
  }

  return items;
}

// ========================================
// Persistence
// ========================================

const STORAGE_KEY = 'objectiv-sidelist-state';
const EXPANDED_FOLDERS_KEY = 'objectiv-expanded-folders';

export function saveState() {
  try {
    const data = {
      selectedIndex: state.selectedIndex
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save side list state:', e);
  }
}

export function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      state.selectedIndex = data.selectedIndex || 0;
    }
  } catch (e) {
    console.warn('Failed to load side list state:', e);
  }
}

function saveExpandedFolders() {
  try {
    const data = Array.from(state.expandedFolders);
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save expanded folders:', e);
  }
}

function loadExpandedFolders() {
  try {
    const stored = localStorage.getItem(EXPANDED_FOLDERS_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      state.expandedFolders = new Set(data);
    }
  } catch (e) {
    console.warn('Failed to load expanded folders:', e);
  }
}

// ========================================
// Initialization
// ========================================

export function init() {
  loadState();
  loadExpandedFolders();
}

// ========================================
// Default Export
// ========================================

export default {
  ItemType,

  // Getters
  getSelectedIndex,
  getItems,
  getSelectedItem,
  getFolders,
  isFolderExpanded,
  getExpandedFolders,

  // Selection
  setSelectedIndex,
  selectNext,
  selectPrev,
  selectItem,

  // Folder expansion
  toggleFolder,
  expandFolder,
  collapseFolder,

  // Building
  rebuildItems,

  // Persistence
  saveState,
  loadState,
  init
};
