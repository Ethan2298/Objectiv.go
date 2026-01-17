/**
 * Data Repository Module
 *
 * Supabase-based persistence layer.
 * Stores objectives in PostgreSQL database.
 */

import {
  loadAllObjectives,
  saveObjective as saveObjectiveFile,
  deleteObjective as deleteObjectiveFile,
  updateObjectiveOrder,
  isStorageAvailable,
  getStorageStatus,
  subscribeToChanges
} from './supabase-storage.js';

import {
  loadAllFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveObjectiveToFolder,
  subscribeToFolderChanges
} from './folder-storage.js';

// ========================================
// Configuration
// ========================================

// Set to true to enable dummy data fallback (for testing)
const ENABLE_DUMMY_DATA = false;

// ========================================
// In-Memory Cache
// ========================================

let cachedData = null;
let isInitialized = false;

// ========================================
// Utility Functions
// ========================================

/**
 * Generate a unique ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ========================================
// Dummy Data (disabled by default)
// ========================================

function getDummyData() {
  if (!ENABLE_DUMMY_DATA) {
    return { objectives: [] };
  }

  const now = new Date();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

  return {
    objectives: [
      {
        id: 'obj1',
        name: 'Learn Rust programming',
        description: 'Master systems programming with Rust for building fast, reliable software',
        priorities: [
          { id: 'p1a', name: 'Complete the Rust Book', description: 'Read through all chapters and do exercises' },
          { id: 'p1b', name: 'Build a CLI tool', description: 'Create a practical command-line application' },
          { id: 'p1c', name: 'Contribute to open source', description: 'Find a Rust project and submit a PR' }
        ],
        steps: [
          { id: 's1a', name: 'Installed rustup and cargo', loggedAt: twoDaysAgo.toISOString(), orderNumber: 1 },
          { id: 's1b', name: 'Finished chapters 1-3 of the Rust Book', loggedAt: dayAgo.toISOString(), orderNumber: 2 },
          { id: 's1c', name: 'Wrote first ownership examples', loggedAt: hourAgo.toISOString(), orderNumber: 3 }
        ]
      },
      {
        id: 'obj2',
        name: 'Get in shape for summer',
        description: 'Build consistent exercise habits and improve overall fitness',
        priorities: [
          { id: 'p2a', name: 'Exercise 4x per week', description: 'Mix of strength training and cardio' },
          { id: 'p2b', name: 'Track nutrition', description: 'Log meals and aim for balanced macros' }
        ],
        steps: [
          { id: 's2a', name: 'Signed up for gym membership', loggedAt: twoDaysAgo.toISOString(), orderNumber: 1 },
          { id: 's2b', name: 'Did first workout - legs and core', loggedAt: dayAgo.toISOString(), orderNumber: 2 },
          { id: 's2c', name: 'Morning run - 2 miles', loggedAt: now.toISOString(), orderNumber: 3 }
        ]
      }
    ]
  };
}

// ========================================
// Data Migration
// ========================================

/**
 * Ensure data has correct structure
 */
function ensureStructure(data) {
  if (!data) return { objectives: [] };
  if (!data.objectives) data.objectives = [];

  for (const obj of data.objectives) {
    if (!obj.priorities) obj.priorities = [];
    if (!obj.steps) obj.steps = [];
    if (!obj.id) obj.id = generateId();
  }
  return data;
}

// ========================================
// Repository API
// ========================================

/**
 * Initialize and load data from markdown files
 * Call this once when app starts
 */
export async function initializeData() {
  if (isInitialized && cachedData) {
    return cachedData;
  }

  try {
    // Check if storage is available (folder selected + filesystem access)
    if (!isStorageAvailable()) {
      console.log('Storage not available, using empty data');
      cachedData = getDummyData();
      isInitialized = true;
      return cachedData;
    }

    // Load from markdown files
    cachedData = await loadAllObjectives();
    cachedData = ensureStructure(cachedData);
    isInitialized = true;

    console.log('Initialized with', cachedData.objectives.length, 'objectives');
    return cachedData;

  } catch (err) {
    console.error('Failed to initialize data:', err);
    cachedData = getDummyData();
    isInitialized = true;
    return cachedData;
  }
}

/**
 * Load data (synchronous if cached, async if not)
 * For backward compatibility with existing code
 */
export function loadData() {
  if (cachedData) {
    return cachedData;
  }
  // Return empty data if not initialized
  // The app should call initializeData() first
  return getDummyData();
}

/**
 * Reload data from filesystem (invalidates cache)
 */
export async function reloadData() {
  cachedData = null;
  isInitialized = false;
  return initializeData();
}

/**
 * Save all data
 * Writes each objective to its markdown file
 */
export async function saveData(data) {
  cachedData = ensureStructure(data);

  if (!isStorageAvailable()) {
    console.warn('Storage not available, data not persisted');
    return;
  }

  // Save each objective to its file
  const savePromises = cachedData.objectives.map(obj => {
    return saveObjectiveFile(obj).catch(err => {
      console.error('Failed to save objective:', obj.name, err);
    });
  });

  await Promise.all(savePromises);
}

/**
 * Save a single objective
 */
export async function saveOneObjective(objective) {
  if (!isStorageAvailable()) {
    console.warn('Storage not available');
    return;
  }

  await saveObjectiveFile(objective);
}

/**
 * Delete an objective
 */
export async function deleteOneObjective(objective) {
  if (!isStorageAvailable()) {
    console.warn('Storage not available');
    return;
  }

  await deleteObjectiveFile(objective);

  // Remove from cache
  if (cachedData) {
    cachedData.objectives = cachedData.objectives.filter(o => o.id !== objective.id);
  }
}

/**
 * Invalidate the cache (call after folder change)
 */
export function invalidateCache() {
  cachedData = null;
  isInitialized = false;
}

/**
 * Get storage status for UI feedback
 */
export { getStorageStatus };

/**
 * Subscribe to realtime changes
 */
export { subscribeToChanges };

/**
 * Update objective order
 */
export { updateObjectiveOrder };

/**
 * Folder operations - re-export from folder-storage
 */
export {
  loadAllFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveObjectiveToFolder,
  subscribeToFolderChanges
};

// ========================================
// Factory Functions
// ========================================

/**
 * Create a new objective
 */
export function createObjective(name = '', description = '', folderId = null, orderIndex = 0) {
  return {
    id: generateId(),
    name,
    description,
    folderId,
    orderIndex,
    createdAt: new Date().toISOString(),
    priorities: [],
    steps: []
  };
}

/**
 * Create a new priority
 */
export function createPriority(name = '', description = '') {
  return {
    id: generateId(),
    name,
    description
  };
}

/**
 * Create a new step with timer tracking fields
 * Status lifecycle: pending → active → paused → completed
 * Note: 'active' is runtime-only, never persisted to disk
 */
export function createStep(name = '', orderNumber = 1) {
  return {
    id: generateId(),
    name,
    loggedAt: new Date().toISOString(),
    orderNumber,
    status: 'pending',      // pending|active|paused|completed
    elapsed: 0,             // accumulated seconds across pause/resume
    startedAt: null,        // first time timer started
    completedAt: null       // when marked complete
  };
}

// ========================================
// Default Export
// ========================================

export default {
  initializeData,
  loadData,
  reloadData,
  saveData,
  saveOneObjective,
  deleteOneObjective,
  invalidateCache,
  getStorageStatus,
  subscribeToChanges,
  updateObjectiveOrder,
  generateId,
  createObjective,
  createPriority,
  createStep,
  // Folder operations
  loadAllFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveObjectiveToFolder,
  subscribeToFolderChanges
};
