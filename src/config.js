/**
 * Application Configuration
 *
 * Centralized configuration for external services.
 * Note: Supabase anon key is public by design - protected by Row Level Security.
 */

// ========================================
// Supabase Configuration
// ========================================

export const SUPABASE_URL = 'https://uajcwhcfrcqqpgvvfrpz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhamN3aGNmcmNxcXBndnZmcnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNjg2MDYsImV4cCI6MjA4MzY0NDYwNn0.1K6ttNixMSs_QW-_UiWmlB56AXxxt1W2oZKm_ewzxnI';

// ========================================
// Anthropic Configuration
// ========================================

export const ANTHROPIC_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_MODEL = 'claude-opus-4-5-20251101';
export const ANTHROPIC_MAX_TOKENS = 4096;

// ========================================
// Default Export
// ========================================

export default {
  supabase: {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
  },
  anthropic: {
    endpoint: ANTHROPIC_API_ENDPOINT,
    model: ANTHROPIC_MODEL,
    maxTokens: ANTHROPIC_MAX_TOKENS
  }
};
