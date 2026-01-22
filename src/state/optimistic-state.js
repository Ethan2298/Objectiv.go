/**
 * Optimistic State Module
 *
 * Manages optimistic updates for drag-drop operations:
 * - Snapshot: Deep copy of state before mutation
 * - Queue: Sequential processing of pending saves
 * - Rollback: Restore snapshot if persist fails
 * - Generation counter: Detect stale saves
 */

import AppState from './app-state.js';

// ========================================
// State
// ========================================

let _snapshot = null;
let _generation = 0;
let _pendingOperations = [];
let _isProcessing = false;

// ========================================
// Snapshot Management
// ========================================

/**
 * Create a deep copy of current state
 * @returns {Object} Snapshot containing objectives, folders, notes
 */
export function createSnapshot() {
  const data = AppState.getData();
  return {
    objectives: JSON.parse(JSON.stringify(data.objectives || [])),
    folders: JSON.parse(JSON.stringify(data.folders || [])),
    notes: JSON.parse(JSON.stringify(data.notes || [])),
    generation: ++_generation
  };
}

/**
 * Restore state from a snapshot
 * @param {Object} snapshot - Previously captured snapshot
 */
export function restoreFromSnapshot(snapshot) {
  if (!snapshot) return;

  AppState.setObjectives(snapshot.objectives);
  AppState.setFolders(snapshot.folders);
  AppState.setNotes(snapshot.notes);

  // Rebuild tree after restoration
  const BookmarkStorage = window.Layer?.BookmarkStorage;
  const bookmarks = BookmarkStorage?.loadAllBookmarks?.() || [];
  AppState.rebuildTree(bookmarks);
}

// ========================================
// Queue Management
// ========================================

/**
 * Process queued operations sequentially
 */
async function processQueue() {
  if (_isProcessing || _pendingOperations.length === 0) {
    return;
  }

  _isProcessing = true;

  while (_pendingOperations.length > 0) {
    const operation = _pendingOperations.shift();
    const { snapshot, persistFn, options } = operation;

    try {
      await persistFn();
      // Success - snapshot can be discarded
    } catch (error) {
      console.error('Optimistic update failed, rolling back:', error);

      // Only rollback if no newer operations have succeeded
      // (i.e., this is still the latest state)
      if (snapshot.generation === _generation) {
        restoreFromSnapshot(snapshot);
      }

      // Call error callback
      if (options?.onError) {
        options.onError(error);
      }
    }
  }

  _isProcessing = false;
}

// ========================================
// Main API
// ========================================

/**
 * Perform an optimistic update
 *
 * 1. Captures snapshot of current state
 * 2. Immediately applies local mutation
 * 3. Queues persist operation
 * 4. On failure: rolls back to snapshot and calls onError
 *
 * @param {Function} localMutation - Sync function that mutates state locally
 * @param {Function} persistFn - Async function that persists to database
 * @param {Object} options - Optional callbacks
 * @param {Function} options.onError - Called if persist fails
 * @param {Function} options.onSuccess - Called if persist succeeds
 */
export function optimisticUpdate(localMutation, persistFn, options = {}) {
  // 1. Capture snapshot before mutation
  const snapshot = createSnapshot();

  // 2. Apply local mutation immediately (synchronous)
  try {
    localMutation();
  } catch (error) {
    console.error('Local mutation failed:', error);
    restoreFromSnapshot(snapshot);
    if (options.onError) {
      options.onError(error);
    }
    return;
  }

  // 3. Queue persist operation with success callback
  const wrappedPersistFn = async () => {
    await persistFn();
    if (options.onSuccess) {
      options.onSuccess();
    }
  };

  _pendingOperations.push({
    snapshot,
    persistFn: wrappedPersistFn,
    options
  });

  // 4. Start processing queue
  processQueue();
}

/**
 * Check if there are pending save operations
 * @returns {boolean}
 */
export function hasPendingOperations() {
  return _pendingOperations.length > 0 || _isProcessing;
}

/**
 * Get current generation counter
 * @returns {number}
 */
export function getGeneration() {
  return _generation;
}

/**
 * Wait for all pending operations to complete
 * @returns {Promise}
 */
export function waitForPending() {
  return new Promise((resolve) => {
    const check = () => {
      if (!hasPendingOperations()) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

// ========================================
// Default Export
// ========================================

export default {
  createSnapshot,
  restoreFromSnapshot,
  optimisticUpdate,
  hasPendingOperations,
  getGeneration,
  waitForPending
};
