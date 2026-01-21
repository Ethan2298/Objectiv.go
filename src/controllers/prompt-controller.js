/**
 * Prompt Controller Module
 *
 * Handles add/edit/refine workflow for objectives, priorities, and steps.
 */

import AppState from '../state/app-state.js';
import { generateId } from '../utils.js';
import { placeCaretAtEnd, autoResizeTextarea } from '../utils/dom-helpers.js';

// ========================================
// Callbacks (set by app.js)
// ========================================

let _saveData = () => {};
let _updateView = () => {};
let _renderSideList = () => {};
let _renderContentView = () => {};
let _updateStatusBar = () => {};
let _showMessage = () => {};

export function setCallbacks({ saveData, updateView, renderSideList, renderContentView, updateStatusBar, showMessage }) {
  if (saveData) _saveData = saveData;
  if (updateView) _updateView = updateView;
  if (renderSideList) _renderSideList = renderSideList;
  if (renderContentView) _renderContentView = renderContentView;
  if (updateStatusBar) _updateStatusBar = updateStatusBar;
  if (showMessage) _showMessage = showMessage;
}

// ========================================
// Start Add Operations
// ========================================

/**
 * Start adding a new objective
 */
export async function startAddObjective() {
  const data = AppState.getData();
  const Repository = window.Objectiv?.Repository;
  const SideListState = window.Objectiv?.SideListState;

  // Calculate orderIndex to place at top (min - 1)
  const minOrder = data.objectives.reduce((min, o) => Math.min(min, o.orderIndex || 0), 0);
  const topOrderIndex = minOrder - 1;

  // Create objective with placeholder name
  const newObj = {
    id: generateId(),
    name: 'New Objective',
    description: '',
    priorities: [],
    steps: [],
    orderIndex: topOrderIndex
  };

  // Add to beginning of array
  data.objectives.unshift(newObj);

  // Save to storage
  if (Repository?.saveObjective) {
    try {
      await Repository.saveObjective(newObj);
    } catch (err) {
      console.error('Failed to save objective:', err);
    }
  }

  // Select the new objective
  AppState.setSelectedObjectiveIndex(0);
  AppState.setViewMode('objective');

  // Rebuild and render
  if (SideListState) {
    _renderSideList();
    SideListState.selectItem(SideListState.ItemType.OBJECTIVE, newObj.id);
  }

  _updateView();
}

/**
 * Start adding a new priority
 */
export function startAddPriority() {
  // Commit any current edit first
  commitEditInPlace();

  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();
  const obj = data.objectives[selectedIdx];

  if (!obj || obj.priorities.length >= 3) return;

  // Create placeholder priority
  const newPriority = {
    id: generateId(),
    name: '',
    description: ''
  };
  obj.priorities.push(newPriority);

  // Set up edit mode for the new priority
  AppState.setPromptState({
    mode: 'add',
    step: 0,
    targetIndex: obj.priorities.length - 1,
    targetSection: 'priorities',
    data: { type: 'priority', item: newPriority }
  });

  _renderContentView();
  focusPromptInput();
  _updateStatusBar();
}

/**
 * Start logging a new step
 */
export function startLogStep() {
  // Commit any current edit first
  commitEditInPlace();

  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();
  const obj = data.objectives[selectedIdx];

  if (!obj) return;

  // Calculate next order number
  const maxOrder = obj.steps.reduce((max, s) => Math.max(max, s.orderNumber || 0), 0);

  // Create placeholder step
  const newStep = {
    id: generateId(),
    name: '',
    loggedAt: new Date().toISOString(),
    orderNumber: maxOrder + 1
  };
  obj.steps.push(newStep);

  // Set up edit mode for the new step
  AppState.setPromptState({
    mode: 'add',
    step: 0,
    targetIndex: obj.steps.length - 1,
    targetSection: 'steps',
    data: { type: 'step', item: newStep }
  });

  _renderContentView();
  focusPromptInput();
  _updateStatusBar();
}

// ========================================
// Start Edit Operations (Legacy - kept for compatibility)
// ========================================

/**
 * Start editing a list item in-place
 * Note: With Notion-style inline editing, elements are always editable.
 * This function is kept for compatibility but is mostly a no-op.
 */
export function startEditInPlace(section, index, listItemEl, options = {}) {
  // Elements are always contenteditable now - browser handles focus naturally
  // No state tracking needed for simple edits
}

/**
 * Start editing the objective title
 * Note: With Notion-style inline editing, the title is always editable.
 * This function is kept for compatibility but is mostly a no-op.
 */
export function startEditObjectiveTitle() {
  // Title is always contenteditable now - browser handles focus naturally
  const titleEl = document.getElementById('content-header-title');
  if (titleEl) {
    titleEl.focus();
  }
}

/**
 * Start editing folder title
 * Note: With Notion-style inline editing, the title is always editable.
 * This function is kept for compatibility but is mostly a no-op.
 */
export function startEditFolderTitle() {
  // Title is always contenteditable now - browser handles focus naturally
  const titleEl = document.getElementById('content-header-title');
  if (titleEl) {
    titleEl.focus();
  }
}

// ========================================
// Commit Operations
// ========================================

/**
 * Commit current edit in-place
 * Note: With Notion-style inline editing, most saving happens via blur handlers
 * in the inline-edit utility. This function is mainly for compatibility and
 * cleanup when switching contexts.
 * @returns {{ needsRerender: boolean, removedElement: boolean }}
 */
export function commitEditInPlace() {
  const promptMode = AppState.getPromptMode();
  if (!promptMode) {
    return { needsRerender: false, removedElement: false };
  }

  // Inline-edit handles saving on blur, so we just need to reset state
  // The only case where we might need to re-render is if an add was cancelled
  // but the inline-edit onEmpty callback handles that too
  AppState.resetPromptState();
  return { needsRerender: false, removedElement: false };
}

/**
 * Commit objective title edit
 * Note: With Notion-style inline editing, saving happens via blur handlers.
 * This function is kept for compatibility.
 */
export function commitObjectiveTitleEdit() {
  const promptTargetSection = AppState.getPromptTargetSection();
  if (promptTargetSection !== 'objectives') return;

  // Inline-edit handles saving on blur
  AppState.resetPromptState();
  _updateStatusBar();
}

/**
 * Commit folder title edit
 * Note: With Notion-style inline editing, saving happens via blur handlers.
 * This function is kept for compatibility.
 */
export function commitFolderTitleEdit() {
  const promptTargetSection = AppState.getPromptTargetSection();
  if (promptTargetSection !== 'folders') return;

  // Inline-edit handles saving on blur
  AppState.resetPromptState();
  _updateStatusBar();
}

// ========================================
// Process Input
// ========================================

/**
 * Process prompt input
 */
export function processPromptInput(value) {
  const promptMode = AppState.getPromptMode();

  if (promptMode === 'add') {
    processAddStep(value);
  } else if (promptMode === 'edit') {
    processEditStep(value);
  } else if (promptMode === 'refine') {
    processRefineStep(value);
  }
}

function processAddStep(value) {
  const promptData = AppState.getPromptData();
  const promptTargetIndex = AppState.getPromptTargetIndex();
  const promptTargetSection = AppState.getPromptTargetSection();
  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();

  // Handle inline add (item already exists as placeholder)
  if (promptData.item) {
    if (!value.trim()) {
      // Remove placeholder and cancel
      if (promptData.type === 'objective') {
        data.objectives.splice(promptTargetIndex, 1);
        AppState.setSelectedObjectiveIndex(Math.max(0, data.objectives.length - 1));
      } else if (promptData.type === 'priority') {
        const obj = data.objectives[selectedIdx];
        if (obj) obj.priorities.splice(promptTargetIndex, 1);
      } else if (promptData.type === 'step') {
        const obj = data.objectives[selectedIdx];
        if (obj) obj.steps.splice(promptTargetIndex, 1);
      }
      cancelPrompt();
      return;
    }
    promptData.item.name = value.trim();
    _saveData();
    cancelPrompt();
    return;
  }

  // Legacy multi-step flow (fallback)
  const promptStep = AppState.getPromptStep();
  if (promptStep === 0) {
    if (!value.trim()) {
      _showMessage('Name is required');
      _updateView();
      return;
    }
    promptData.name = value.trim();
    AppState.setPromptStep(1);
    _updateView();
  } else if (promptStep === 1) {
    promptData.description = value.trim();
    finishAdd();
  }
}

function finishAdd() {
  const promptData = AppState.getPromptData();
  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();

  const newItem = {
    id: generateId(),
    name: promptData.name,
    description: promptData.description || ''
  };

  if (promptData.type === 'priority') {
    const obj = data.objectives[selectedIdx];
    if (obj) obj.priorities.push(newItem);
  }

  _saveData();
  cancelPrompt();
}

function processEditStep(value) {
  const promptData = AppState.getPromptData();

  if (!value.trim()) {
    _showMessage('Name is required');
    _updateView();
    return;
  }
  promptData.newName = value.trim();
  finishEdit();
}

function finishEdit() {
  const promptData = AppState.getPromptData();
  promptData.item.name = promptData.newName;
  _saveData();
  cancelPrompt();
}

function processRefineStep(value) {
  const promptData = AppState.getPromptData();
  promptData.item.description = value.trim();
  _saveData();
  cancelPrompt();
}

// ========================================
// Confirm Operations
// ========================================

export function processConfirm(confirmed) {
  const promptData = AppState.getPromptData();
  const promptTargetIndex = AppState.getPromptTargetIndex();
  const promptTargetSection = AppState.getPromptTargetSection();
  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();

  if (confirmed && promptData.action === 'delete') {
    if (promptTargetSection === 'objectives') {
      data.objectives.splice(promptTargetIndex, 1);
      let newIdx = Math.min(selectedIdx, data.objectives.length - 1);
      if (newIdx < 0) newIdx = 0;
      AppState.setSelectedObjectiveIndex(newIdx);
    } else if (promptTargetSection === 'priorities') {
      const obj = data.objectives[selectedIdx];
      if (obj) obj.priorities.splice(promptTargetIndex, 1);
    } else if (promptTargetSection === 'steps') {
      const obj = data.objectives[selectedIdx];
      if (obj) obj.steps.splice(promptTargetIndex, 1);
    }
    _saveData();
  }
  cancelPrompt();
}

// ========================================
// Cancel
// ========================================

export function cancelPrompt() {
  const promptMode = AppState.getPromptMode();
  const promptData = AppState.getPromptData();
  const promptTargetIndex = AppState.getPromptTargetIndex();
  const promptTargetSection = AppState.getPromptTargetSection();
  const data = AppState.getData();
  const selectedIdx = AppState.getSelectedObjectiveIndex();

  // Skip any pending blur handlers
  AppState.setSkipBlurHandler(true);

  // Remove placeholder items if adding was cancelled
  if (promptMode === 'add' && promptData.item) {
    if (promptTargetSection === 'objectives') {
      const obj = data.objectives[promptTargetIndex];
      if (obj && !obj.name.trim()) {
        data.objectives.splice(promptTargetIndex, 1);
        AppState.setSelectedObjectiveIndex(Math.max(0, data.objectives.length - 1));
      }
    } else if (promptTargetSection === 'priorities') {
      const obj = data.objectives[selectedIdx];
      if (obj && obj.priorities[promptTargetIndex] && !obj.priorities[promptTargetIndex].name.trim()) {
        obj.priorities.splice(promptTargetIndex, 1);
      }
    } else if (promptTargetSection === 'steps') {
      const obj = data.objectives[selectedIdx];
      if (obj && obj.steps[promptTargetIndex] && !obj.steps[promptTargetIndex].name.trim()) {
        obj.steps.splice(promptTargetIndex, 1);
      }
    }
  }

  AppState.resetPromptState();
  _updateView();
}

// ========================================
// Helpers
// ========================================

/**
 * Focus prompt input after render
 * Note: With inline-edit utility, blur handlers are set up by setupInlineEdit.
 * This function just focuses the element.
 */
export function focusPromptInput() {
  const promptMode = AppState.getPromptMode();
  if (!promptMode) return;

  setTimeout(() => {
    // Try contenteditable elements first
    const contentEditable = document.querySelector('.list-item-content[contenteditable="true"], .side-item-name[contenteditable="true"]');
    if (contentEditable) {
      placeCaretAtEnd(contentEditable);
      return;
    }

    // Fallback to input/textarea
    const input = document.querySelector('.prompt-input');
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
      if (input.tagName === 'TEXTAREA') {
        autoResizeTextarea(input);
      }
    }
  }, 0);
}

// ========================================
// Default Export
// ========================================

export default {
  setCallbacks,
  startAddObjective,
  startAddPriority,
  startLogStep,
  startEditInPlace,
  startEditObjectiveTitle,
  startEditFolderTitle,
  commitEditInPlace,
  commitObjectiveTitleEdit,
  commitFolderTitleEdit,
  processPromptInput,
  processConfirm,
  cancelPrompt,
  focusPromptInput
};
