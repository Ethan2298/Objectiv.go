/**
 * Objectiv - Main Application Entry Point
 *
 * This module serves as the central entry point, importing and
 * re-exporting all modules for use by the application.
 */

// ========================================
// Module Imports
// ========================================

import * as Repository from './data/repository.js';
import * as State from './state/store.js';
import * as SideListState from './state/side-list-state.js';
import * as Utils from './utils.js';
import * as ListItem from './components/list-item.js';
import * as EditController from './controllers/edit-controller.js';
import * as Markdown from './utils/markdown.js';

// ========================================
// Re-export for global access
// ========================================

// Make modules available globally for gradual migration
window.Objectiv = {
  Repository,
  State,
  SideListState,
  Utils,
  ListItem,
  EditController,
  Markdown
};

// ========================================
// Initialization
// ========================================

/**
 * Initialize the application
 */
export function init() {
  console.log('Objectiv modules loaded');

  // Initialize side list state (unified navigation)
  SideListState.init();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ========================================
// Exports
// ========================================

export {
  Repository,
  State,
  SideListState,
  Utils,
  ListItem,
  EditController,
  Markdown
};

export default {
  Repository,
  State,
  SideListState,
  Utils,
  ListItem,
  EditController,
  Markdown,
  init
};
