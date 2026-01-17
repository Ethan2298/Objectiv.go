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
import * as SideListState from './state/side-list-state.js';
import * as Utils from './utils.js';
import * as ListItem from './components/list-item.js';
import * as EditController from './controllers/edit-controller.js';
import * as Markdown from './utils/markdown.js';
import * as Constants from './constants.js';
import * as ContextMenu from './components/context-menu.js';
import * as DeleteModal from './components/delete-modal.js';

// ========================================
// Re-export for global access
// ========================================

// Make modules available globally for gradual migration
window.Objectiv = {
  Repository,
  SideListState,
  Utils,
  ListItem,
  EditController,
  Markdown,
  Constants,
  ContextMenu,
  DeleteModal
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
  SideListState,
  Utils,
  ListItem,
  EditController,
  Markdown,
  Constants,
  ContextMenu,
  DeleteModal
};

export default {
  Repository,
  SideListState,
  Utils,
  ListItem,
  EditController,
  Markdown,
  Constants,
  ContextMenu,
  DeleteModal,
  init
};
