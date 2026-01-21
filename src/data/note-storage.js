/**
 * Note Storage Module
 *
 * Supabase CRUD operations for notes.
 * Notes can be organized into folders like objectives.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

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
    console.error('Failed to initialize Supabase for notes:', err);
    return null;
  }
}

// ========================================
// Note Operations
// ========================================

/**
 * Load all notes from Supabase
 * @returns {Promise<Array>} Array of note objects
 */
export async function loadAllNotes() {
  const client = initClient();

  if (!client) {
    console.log('Supabase not available for notes');
    return [];
  }

  try {
    const { data, error } = await client
      .from('notes')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Failed to load notes:', error);
      return [];
    }

    // Transform database rows to app format
    const notes = data.map(row => ({
      id: row.id,
      name: row.name || '',
      content: row.content || '',
      folderId: row.folder_id || null,
      orderIndex: row.order_index || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    console.log(`Loaded ${notes.length} notes from Supabase`);
    return notes;

  } catch (err) {
    console.error('Error loading notes:', err);
    return [];
  }
}

/**
 * Save a note (insert or update)
 * @param {Object} note - Note data
 * @returns {Promise<Object>} Saved note with ID
 */
export async function saveNote(note) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const record = {
    name: note.name || '',
    content: note.content || '',
    folder_id: note.folderId || null,
    order_index: note.orderIndex || 0,
    updated_at: new Date().toISOString()
  };

  // Check if this is an existing record
  if (note.id) {
    // Update existing record
    record.id = note.id;

    const { data, error } = await client
      .from('notes')
      .upsert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save note: ${error.message}`);
    }

    console.log('Updated note:', data.id);

    return {
      id: data.id,
      name: data.name,
      content: data.content,
      folderId: data.folder_id,
      orderIndex: data.order_index,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

  } else {
    // New note - let Supabase generate UUID
    const { data, error } = await client
      .from('notes')
      .insert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create note: ${error.message}`);
    }

    console.log('Created note:', data.id);

    return {
      id: data.id,
      name: data.name,
      content: data.content,
      folderId: data.folder_id,
      orderIndex: data.order_index,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
}

/**
 * Delete a note
 * @param {string} noteId - Note ID to delete
 */
export async function deleteNote(noteId) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { error } = await client
    .from('notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    throw new Error(`Failed to delete note: ${error.message}`);
  }

  console.log('Deleted note:', noteId);
}

/**
 * Update a note's order index and optionally folder
 * @param {string} id - Note ID
 * @param {number} orderIndex - New order index
 * @param {string|null} folderId - Optional folder ID to move to
 */
export async function updateNoteOrder(id, orderIndex, folderId = undefined) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const record = {
    order_index: orderIndex,
    updated_at: new Date().toISOString()
  };

  // Only update folder_id if explicitly provided
  if (folderId !== undefined) {
    record.folder_id = folderId;
  }

  const { error } = await client
    .from('notes')
    .update(record)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update note order: ${error.message}`);
  }

  console.log('Updated note order:', id, 'to index', orderIndex);
}

/**
 * Subscribe to realtime changes on the notes table
 * @param {Function} onChangeCallback - Called with payload when changes occur
 * @returns {Object|null} Subscription object
 */
export function subscribeToNoteChanges(onChangeCallback) {
  const client = initClient();
  if (!client) {
    console.warn('Cannot subscribe: Supabase client not available');
    return null;
  }

  const subscription = client
    .channel('notes-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notes' },
      (payload) => {
        console.log('Note realtime change:', payload.eventType, payload);
        onChangeCallback(payload);
      }
    )
    .subscribe((status) => {
      console.log('Notes realtime subscription status:', status);
    });

  return subscription;
}

// ========================================
// Exports
// ========================================

export default {
  loadAllNotes,
  saveNote,
  deleteNote,
  updateNoteOrder,
  subscribeToNoteChanges
};
