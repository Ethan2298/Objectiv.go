/**
 * Supabase Storage Module
 *
 * Cloud-based storage using Supabase.
 * Stores objectives in a PostgreSQL database.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hardcoded Supabase configuration
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
    console.log('Supabase client initialized');
    return supabase;
  } catch (err) {
    console.error('Failed to initialize Supabase:', err);
    return null;
  }
}

// ========================================
// Storage Operations
// ========================================

/**
 * Load all objectives from Supabase
 */
export async function loadAllObjectives() {
  const client = initClient();

  if (!client) {
    console.log('Supabase not available');
    return { objectives: [] };
  }

  try {
    const { data, error } = await client
      .from('objectives')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load objectives:', error);
      return { objectives: [] };
    }

    // Transform database rows to app format
    const objectives = data.map(row => ({
      id: row.id,
      name: row.name || '',
      description: row.description || '',
      priorities: row.priorities || [],
      steps: row.steps || [],
      nextStep: row.next_step || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      _supabaseId: row.id // Track for updates
    }));

    console.log(`Loaded ${objectives.length} objectives from Supabase`);
    return { objectives };

  } catch (err) {
    console.error('Error loading objectives:', err);
    return { objectives: [] };
  }
}

/**
 * Save a single objective to Supabase (insert or update)
 */
export async function saveObjective(objective) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured. Please configure your connection first.');
  }

  // Transform to database format
  const record = {
    name: objective.name,
    description: objective.description || '',
    priorities: objective.priorities || [],
    steps: objective.steps || [],
    next_step: objective.nextStep || null,
    updated_at: new Date().toISOString()
  };

  // Check if this is an existing record (has Supabase UUID)
  const existingId = objective._supabaseId;

  if (existingId) {
    // Update existing record
    record.id = existingId;

    const { data, error } = await client
      .from('objectives')
      .upsert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save objective: ${error.message}`);
    }

    objective.id = data.id;
    objective._supabaseId = data.id;
    console.log('Updated objective:', data.id);

  } else {
    // New objective - let Supabase generate UUID
    const { data, error } = await client
      .from('objectives')
      .insert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create objective: ${error.message}`);
    }

    // Update the objective with the Supabase-generated UUID
    objective.id = data.id;
    objective._supabaseId = data.id;
    console.log('Created objective:', data.id);
  }

  return objective;
}

/**
 * Delete an objective from Supabase
 */
export async function deleteObjective(objective) {
  const client = initClient();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const id = objective._supabaseId || objective.id;

  if (!id) {
    console.warn('No ID for objective, nothing to delete');
    return;
  }

  const { error } = await client
    .from('objectives')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete objective: ${error.message}`);
  }

  console.log('Deleted objective:', id);
}

/**
 * Check if the storage system is available
 */
export function isStorageAvailable() {
  return true; // Always available with hardcoded config
}

/**
 * Get the current storage status
 */
export function getStorageStatus() {
  return {
    hasConnection: true,
    url: 'uajcwhcfrcqqpgvvfrpz',
    isReady: true
  };
}

// ========================================
// Exports
// ========================================

export default {
  loadAllObjectives,
  saveObjective,
  deleteObjective,
  isStorageAvailable,
  getStorageStatus
};
