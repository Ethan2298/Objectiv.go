/**
 * Tree Utilities
 *
 * Functions for converting between flat arrays and tree structure,
 * and for manipulating tree data.
 */

// ========================================
// Conversion Functions
// ========================================

/**
 * Convert flat arrays to tree structure
 * @param {Array} objectives - Flat array of objectives
 * @param {Array} folders - Flat array of folders
 * @param {Array} notes - Flat array of notes
 * @param {Array} bookmarks - Flat array of bookmarks (optional)
 * @returns {Array} Tree structure
 */
export function flatToTree(objectives = [], folders = [], notes = [], bookmarks = []) {
  // Build folder map with children arrays
  const folderMap = new Map();
  folders.forEach(f => {
    folderMap.set(f.id, {
      type: 'folder',
      ...f,
      children: []
    });
  });

  // Link child folders to parents
  folders.forEach(f => {
    if (f.parentId && folderMap.has(f.parentId)) {
      folderMap.get(f.parentId).children.push(folderMap.get(f.id));
    }
  });

  // Add objectives to their folders or root
  const rootItems = [];
  objectives.forEach(obj => {
    const item = { type: 'objective', ...obj };
    if (obj.folderId && folderMap.has(obj.folderId)) {
      folderMap.get(obj.folderId).children.push(item);
    } else {
      rootItems.push(item);
    }
  });

  // Add notes to their folders or root
  notes.forEach(note => {
    const item = { type: 'note', ...note };
    if (note.folderId && folderMap.has(note.folderId)) {
      folderMap.get(note.folderId).children.push(item);
    } else {
      rootItems.push(item);
    }
  });

  // Add bookmarks to their folders or root
  bookmarks.forEach(bookmark => {
    const item = { type: 'bookmark', ...bookmark };
    if (bookmark.folderId && folderMap.has(bookmark.folderId)) {
      folderMap.get(bookmark.folderId).children.push(item);
    } else {
      rootItems.push(item);
    }
  });

  // Add root-level folders
  folders.forEach(f => {
    if (!f.parentId) {
      rootItems.push(folderMap.get(f.id));
    }
  });

  // Sort all levels by orderIndex
  sortTreeByOrder(rootItems);

  return rootItems;
}

/**
 * Sort tree items by orderIndex recursively
 */
function sortTreeByOrder(items) {
  items.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  items.forEach(item => {
    if (item.children) {
      sortTreeByOrder(item.children);
    }
  });
}

/**
 * Convert tree structure back to flat arrays
 * @param {Array} tree - Tree structure
 * @returns {Object} { objectives, folders, notes, bookmarks }
 */
export function treeToFlat(tree) {
  const objectives = [];
  const folders = [];
  const notes = [];
  const bookmarks = [];

  function traverse(items, parentId = null, depth = 0) {
    items.forEach((item, index) => {
      const orderIndex = index * 1000; // Recalculate order from position

      switch (item.type) {
        case 'objective':
          objectives.push({
            ...item,
            folderId: parentId,
            orderIndex,
            type: undefined // Remove type field for storage
          });
          break;

        case 'folder':
          folders.push({
            id: item.id,
            name: item.name,
            parentId: parentId,
            orderIndex,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          });
          // Recurse into children
          if (item.children) {
            traverse(item.children, item.id, depth + 1);
          }
          break;

        case 'note':
          notes.push({
            ...item,
            folderId: parentId,
            orderIndex,
            type: undefined
          });
          break;

        case 'bookmark':
          bookmarks.push({
            ...item,
            folderId: parentId,
            orderIndex,
            type: undefined
          });
          break;
      }
    });
  }

  traverse(tree);

  // Clean up undefined type fields
  objectives.forEach(o => delete o.type);
  notes.forEach(n => delete n.type);
  bookmarks.forEach(b => delete b.type);

  return { objectives, folders, notes, bookmarks };
}

// ========================================
// Tree Manipulation Functions
// ========================================

/**
 * Find an item in the tree by ID and type
 * @param {Array} tree - Tree structure
 * @param {string} id - Item ID
 * @param {string} type - Item type (objective, folder, note, bookmark)
 * @returns {Object|null} { item, parent, index } or null if not found
 */
export function findInTree(tree, id, type) {
  function search(items, parent = null) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.id === id && item.type === type) {
        return { item, parent, index: i, siblings: items };
      }
      if (item.children) {
        const found = search(item.children, item);
        if (found) return found;
      }
    }
    return null;
  }
  return search(tree);
}

/**
 * Find a folder in the tree by ID
 * @param {Array} tree - Tree structure
 * @param {string} folderId - Folder ID
 * @returns {Object|null} The folder object or null
 */
export function findFolder(tree, folderId) {
  const result = findInTree(tree, folderId, 'folder');
  return result ? result.item : null;
}

/**
 * Get the children array for a given parent (null = root)
 * @param {Array} tree - Tree structure
 * @param {string|null} parentId - Parent folder ID or null for root
 * @returns {Array} Children array
 */
export function getChildren(tree, parentId) {
  if (!parentId) return tree;
  const folder = findFolder(tree, parentId);
  return folder ? folder.children : tree;
}

/**
 * Insert an item into the tree
 * @param {Array} tree - Tree structure (mutated)
 * @param {Object} item - Item to insert (must have type)
 * @param {string|null} parentId - Parent folder ID or null for root
 * @param {number} index - Position to insert at (-1 for end)
 * @returns {Array} The modified tree
 */
export function insertInTree(tree, item, parentId = null, index = -1) {
  const children = getChildren(tree, parentId);

  if (index < 0 || index >= children.length) {
    children.push(item);
  } else {
    children.splice(index, 0, item);
  }

  return tree;
}

/**
 * Remove an item from the tree
 * @param {Array} tree - Tree structure (mutated)
 * @param {string} id - Item ID
 * @param {string} type - Item type
 * @returns {Object|null} The removed item or null
 */
export function removeFromTree(tree, id, type) {
  const found = findInTree(tree, id, type);
  if (!found) return null;

  found.siblings.splice(found.index, 1);
  return found.item;
}

/**
 * Check if a folder is a descendant of another folder
 * Used to prevent circular references when moving folders
 * @param {Array} tree - Tree structure
 * @param {string} potentialDescendantId - ID of the folder that might be a descendant
 * @param {string} potentialAncestorId - ID of the folder that might be an ancestor
 * @returns {boolean} True if potentialDescendantId is a descendant of potentialAncestorId
 */
export function isDescendantOf(tree, potentialDescendantId, potentialAncestorId) {
  if (potentialDescendantId === potentialAncestorId) return true;

  const ancestor = findFolder(tree, potentialAncestorId);
  if (!ancestor || !ancestor.children) return false;

  function checkDescendants(children) {
    for (const child of children) {
      if (child.id === potentialDescendantId) return true;
      if (child.type === 'folder' && child.children) {
        if (checkDescendants(child.children)) return true;
      }
    }
    return false;
  }

  return checkDescendants(ancestor.children);
}

/**
 * Move an item within the tree
 * @param {Array} tree - Tree structure (mutated)
 * @param {string} id - Item ID
 * @param {string} type - Item type
 * @param {string|null} newParentId - New parent folder ID or null for root
 * @param {number} newIndex - New position (-1 for end)
 * @returns {boolean} Success
 */
export function moveInTree(tree, id, type, newParentId, newIndex) {
  // Find and remove from current location
  const item = removeFromTree(tree, id, type);
  if (!item) return false;

  // Insert at new location
  insertInTree(tree, item, newParentId, newIndex);
  return true;
}

/**
 * Update an item in the tree
 * @param {Array} tree - Tree structure (mutated)
 * @param {string} id - Item ID
 * @param {string} type - Item type
 * @param {Object} updates - Properties to update
 * @returns {boolean} Success
 */
export function updateInTree(tree, id, type, updates) {
  const found = findInTree(tree, id, type);
  if (!found) return false;

  Object.assign(found.item, updates);
  return true;
}

// ========================================
// Tree Traversal Functions
// ========================================

/**
 * Flatten tree to array with depth info (for rendering)
 * @param {Array} tree - Tree structure
 * @param {Set} expandedFolders - Set of expanded folder IDs
 * @returns {Array} Flat array with depth metadata
 */
export function flattenForRender(tree, expandedFolders = new Set()) {
  const items = [];

  function traverse(nodes, depth = 0) {
    nodes.forEach((node, index) => {
      const item = {
        ...node,
        depth,
        index: items.length
      };

      if (node.type === 'folder') {
        item.hasChildren = node.children && node.children.length > 0;
        item.isExpanded = expandedFolders.has(node.id);
      }

      items.push(item);

      // Recurse into expanded folders
      if (node.type === 'folder' && expandedFolders.has(node.id) && node.children) {
        traverse(node.children, depth + 1);
      }
    });
  }

  traverse(tree);
  return items;
}

/**
 * Get all items of a specific type from tree
 * @param {Array} tree - Tree structure
 * @param {string} type - Item type
 * @returns {Array} All items of that type
 */
export function getAllOfType(tree, type) {
  const items = [];

  function traverse(nodes) {
    nodes.forEach(node => {
      if (node.type === type) {
        items.push(node);
      }
      if (node.children) {
        traverse(node.children);
      }
    });
  }

  traverse(tree);
  return items;
}

/**
 * Count items in tree by type
 * @param {Array} tree - Tree structure
 * @returns {Object} { objectives, folders, notes, bookmarks, total }
 */
export function countItems(tree) {
  const counts = { objectives: 0, folders: 0, notes: 0, bookmarks: 0, total: 0 };

  function traverse(nodes) {
    nodes.forEach(node => {
      counts.total++;
      switch (node.type) {
        case 'objective': counts.objectives++; break;
        case 'folder': counts.folders++; break;
        case 'note': counts.notes++; break;
        case 'bookmark': counts.bookmarks++; break;
      }
      if (node.children) {
        traverse(node.children);
      }
    });
  }

  traverse(tree);
  return counts;
}

// ========================================
// Export
// ========================================

export default {
  flatToTree,
  treeToFlat,
  findInTree,
  findFolder,
  getChildren,
  insertInTree,
  removeFromTree,
  moveInTree,
  updateInTree,
  flattenForRender,
  getAllOfType,
  countItems,
  isDescendantOf
};
