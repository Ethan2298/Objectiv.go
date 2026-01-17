/**
 * Folder Storage Module
 *
 * Supabase CRUD operations for folders.
 * Folders can be nested via parent_id.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hardcoded Supabase configuration (matches main app)
const SUPABASE_URL = 'https://uajcwhcfrcqqpgvvfrpz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhamN3aGNmcmNxcXBndnZmcnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNjg2MDYsImV4cCI6MjA4MzY0NDYwNn0.1K6ttNixMSs_QW-_UiWmlB56AXxxt1W2oZKm_ewzxnI';

let supabase = null;

/**
 * Initialize the Supabase client
 */
function initClient() {
  if (supabase) return supabase;

  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabase;
  } catch (err) {
    console.error('Failed to initialize Supabase for folders:', err);
    return null;
  }
}

// ========================================
// Folder Operations
// ========================================

/**
 * Load all folders from Supabase
 * @returns {Promise<Array>} Array of folder objects
 */
export async function loadAllFolders() {
  const client = initClient();

  if (!client) {
    console.log('Supabase not available for folders');
    return [];
  }

  try {
    const { data, error } = await client
      .from('folders')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Failed to load folders:', error);
      return [];
    }

    // Transform database rows to app format
    const folders = data.map(row => ({
      id: row.id,
      name: row.name || '',
      parentId: row.parent_id || null,
      orderIndex: row.order_index || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    console.log(`Loaded ${folders.length} folders from Supabase`);
    return folders;

  } catch (err) {
    console.error('Error loading folders:', err);
    return [];
  }
}

/**
 * Create a new folder
 * @param {Object} folder - Folder data { name, parentId?, orderIndex? }
 * @returns {Promise<Object>} Created folder with ID
 */
export async function createFolder(folder) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const record = {
    name: folder.name || '',
    parent_id: folder.parentId || null,
    order_index: folder.orderIndex || 0,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await client
    .from('folders')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }

  console.log('Created folder:', data.id);

  return {
    id: data.id,
    name: data.name,
    parentId: data.parent_id,
    orderIndex: data.order_index,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Update an existing folder
 * @param {Object} folder - Folder with id and fields to update
 * @returns {Promise<Object>} Updated folder
 */
export async function updateFolder(folder) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  if (!folder.id) {
    throw new Error('Folder ID required for update');
  }

  const record = {
    name: folder.name,
    parent_id: folder.parentId,
    order_index: folder.orderIndex,
    updated_at: new Date().toISOString()
  };

  // Remove undefined fields
  Object.keys(record).forEach(key => {
    if (record[key] === undefined) delete record[key];
  });

  const { data, error } = await client
    .from('folders')
    .update(record)
    .eq('id', folder.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update folder: ${error.message}`);
  }

  console.log('Updated folder:', data.id);

  return {
    id: data.id,
    name: data.name,
    parentId: data.parent_id,
    orderIndex: data.order_index,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Delete a folder
 * Objectives in this folder will have folder_id set to NULL (unfiled)
 * Child folders will be deleted (CASCADE)
 * @param {string} folderId - Folder ID to delete
 */
export async function deleteFolder(folderId) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { error } = await client
    .from('folders')
    .delete()
    .eq('id', folderId);

  if (error) {
    throw new Error(`Failed to delete folder: ${error.message}`);
  }

  console.log('Deleted folder:', folderId);
}

/**
 * Move an objective to a folder (or unfiled if folderId is null)
 * @param {string} objectiveId - Objective ID
 * @param {string|null} folderId - Target folder ID, or null for unfiled
 * @param {number|null} orderIndex - Optional order index for positioning
 */
export async function moveObjectiveToFolder(objectiveId, folderId, orderIndex = null) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const updateData = {
    folder_id: folderId,
    updated_at: new Date().toISOString()
  };

  // Include order_index if provided
  if (orderIndex !== null) {
    updateData.order_index = orderIndex;
  }

  const { error } = await client
    .from('objectives')
    .update(updateData)
    .eq('id', objectiveId);

  if (error) {
    throw new Error(`Failed to move objective: ${error.message}`);
  }

  console.log('Moved objective', objectiveId, 'to folder', folderId || 'unfiled', orderIndex !== null ? `at index ${orderIndex}` : '');
}

/**
 * Subscribe to realtime changes on the folders table
 * @param {Function} onChangeCallback - Called with payload when changes occur
 * @returns {Object|null} Subscription object
 */
export function subscribeToFolderChanges(onChangeCallback) {
  const client = initClient();
  if (!client) {
    console.warn('Cannot subscribe: Supabase client not available');
    return null;
  }

  const subscription = client
    .channel('folders-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'folders' },
      (payload) => {
        console.log('Folder realtime change:', payload.eventType, payload);
        onChangeCallback(payload);
      }
    )
    .subscribe((status) => {
      console.log('Folders realtime subscription status:', status);
    });

  return subscription;
}

// ========================================
// Exports
// ========================================

export default {
  loadAllFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveObjectiveToFolder,
  subscribeToFolderChanges
};
