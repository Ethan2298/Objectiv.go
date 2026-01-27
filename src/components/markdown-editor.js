/**
 * Markdown Editor Component
 *
 * WYSIWYG Markdown editor using CodeMirror 6.
 * Implements Obsidian-style live preview.
 *
 * API matches the Editor.js component for easy swap:
 * - initMarkdownEditor(content, noteId, container, onAutoSave)
 * - destroyMarkdownEditor()
 * - getContent() - Returns raw markdown string
 */

import {
  EditorView,
  EditorState,
  keymap,
  placeholder,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  markdown,
  markdownLanguage,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
  closeBrackets,
  closeBracketsKeymap
} from '../lib/codemirror/index.js';

import { layerThemeExtension } from '../lib/codemirror/theme.js';
import { livePreviewExtension } from '../lib/codemirror/live-preview.js';
import { slashCommandExtension, cleanupSlashMenu } from '../lib/codemirror/slash-commands.js';

// ========================================
// Editor State
// ========================================

let editorView = null;
let autoSaveCallback = null;
let autoSaveTimeout = null;
let currentNoteId = null;
const AUTOSAVE_DELAY = 1000; // 1 second debounce

// ========================================
// Keyboard Shortcuts
// ========================================

/**
 * Custom markdown shortcuts
 */
function createMarkdownKeymap(view) {
  return keymap.of([
    // Bold: Cmd/Ctrl+B
    {
      key: 'Mod-b',
      run: (view) => {
        wrapSelection(view, '**', '**');
        return true;
      }
    },
    // Italic: Cmd/Ctrl+I
    {
      key: 'Mod-i',
      run: (view) => {
        wrapSelection(view, '*', '*');
        return true;
      }
    },
    // Strikethrough: Cmd/Ctrl+Shift+S
    {
      key: 'Mod-Shift-s',
      run: (view) => {
        wrapSelection(view, '~~', '~~');
        return true;
      }
    },
    // Inline code: Cmd/Ctrl+E
    {
      key: 'Mod-e',
      run: (view) => {
        wrapSelection(view, '`', '`');
        return true;
      }
    },
    // Link: Cmd/Ctrl+K
    {
      key: 'Mod-k',
      run: (view) => {
        insertLink(view);
        return true;
      }
    },
    // Heading shortcuts
    {
      key: 'Mod-1',
      run: (view) => {
        toggleHeading(view, 1);
        return true;
      }
    },
    {
      key: 'Mod-2',
      run: (view) => {
        toggleHeading(view, 2);
        return true;
      }
    },
    {
      key: 'Mod-3',
      run: (view) => {
        toggleHeading(view, 3);
        return true;
      }
    },
    // Checkbox: Cmd/Ctrl+Enter (toggle on current line)
    {
      key: 'Mod-Enter',
      run: (view) => {
        toggleCheckbox(view);
        return true;
      }
    }
  ]);
}

/**
 * Wrap selection with markers (e.g., **bold**)
 */
function wrapSelection(view, before, after) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  // Check if already wrapped
  const beforeText = view.state.sliceDoc(Math.max(0, from - before.length), from);
  const afterText = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + after.length));

  if (beforeText === before && afterText === after) {
    // Unwrap
    view.dispatch({
      changes: [
        { from: from - before.length, to: from, insert: '' },
        { from: to, to: to + after.length, insert: '' }
      ],
      selection: { anchor: from - before.length, head: to - before.length }
    });
  } else {
    // Wrap
    view.dispatch({
      changes: [
        { from, to, insert: before + selectedText + after }
      ],
      selection: { anchor: from + before.length, head: from + before.length + selectedText.length }
    });
  }
}

/**
 * Insert a link
 */
function insertLink(view) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to) || 'link text';

  view.dispatch({
    changes: { from, to, insert: `[${selectedText}](url)` },
    selection: { anchor: from + selectedText.length + 3, head: from + selectedText.length + 6 }
  });
}

/**
 * Toggle heading level on current line
 */
function toggleHeading(view, level) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const lineText = line.text;

  // Check current heading level
  const match = lineText.match(/^(#{1,6})\s/);
  const currentLevel = match ? match[1].length : 0;

  let newText;
  if (currentLevel === level) {
    // Remove heading
    newText = lineText.replace(/^#{1,6}\s/, '');
  } else if (currentLevel > 0) {
    // Change heading level
    newText = '#'.repeat(level) + ' ' + lineText.replace(/^#{1,6}\s/, '');
  } else {
    // Add heading
    newText = '#'.repeat(level) + ' ' + lineText;
  }

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText }
  });
}

/**
 * Toggle checkbox on current line
 */
function toggleCheckbox(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const lineText = line.text;

  let newText;
  if (lineText.includes('[ ]')) {
    newText = lineText.replace('[ ]', '[x]');
  } else if (lineText.includes('[x]') || lineText.includes('[X]')) {
    newText = lineText.replace(/\[[xX]\]/, '[ ]');
  } else if (lineText.match(/^(\s*)([-*+])\s/)) {
    // Convert bullet to task
    newText = lineText.replace(/^(\s*)([-*+])\s/, '$1$2 [ ] ');
  } else {
    // Add task list marker
    newText = '- [ ] ' + lineText;
  }

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText }
  });
}

// ========================================
// Auto-save Listener
// ========================================

/**
 * Create update listener for auto-save
 */
function createAutoSaveListener() {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      // Debounced auto-save
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = setTimeout(() => {
        triggerAutoSave();
      }, AUTOSAVE_DELAY);
    }
  });
}

/**
 * Trigger auto-save
 */
function triggerAutoSave() {
  if (!editorView || !autoSaveCallback) return;

  try {
    const content = editorView.state.doc.toString();
    autoSaveCallback(content);
  } catch (error) {
    console.error('Failed to save markdown content:', error);
  }
}

// ========================================
// Editor Lifecycle
// ========================================

/**
 * Initialize the markdown editor
 * @param {string} content - Markdown content string
 * @param {string} noteId - ID of the note being edited
 * @param {HTMLElement} container - Container element
 * @param {Function} onAutoSave - Callback when content changes (receives markdown string)
 */
export async function initMarkdownEditor(content, noteId, container, onAutoSave) {
  // Destroy existing editor
  destroyMarkdownEditor();

  // Store state
  autoSaveCallback = onAutoSave;
  currentNoteId = noteId;

  // Clear container
  container.innerHTML = '';

  // Create editor extensions
  const extensions = [
    // Core functionality
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),

    // Markdown language
    markdown({ base: markdownLanguage }),

    // Theme (includes syntax highlighting)
    layerThemeExtension,

    // Live preview (Obsidian-style)
    livePreviewExtension,

    // Slash commands (Notion-style block insertion)
    slashCommandExtension,

    // Keymaps
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab
    ]),

    // Custom markdown shortcuts
    createMarkdownKeymap(),

    // Auto-save listener
    createAutoSaveListener(),

    // Placeholder
    placeholder('Start writing...'),

    // Line wrapping
    EditorView.lineWrapping,

    // Ensure editor is editable
    EditorView.editable.of(true),

    // Content attributes for accessibility
    EditorView.contentAttributes.of({
      'aria-label': 'Note editor',
      'role': 'textbox',
      'aria-multiline': 'true'
    })
  ];

  // Create editor state
  const state = EditorState.create({
    doc: content || '',
    extensions
  });

  // Create editor view
  editorView = new EditorView({
    state,
    parent: container
  });

  // Add click handler to container to focus editor
  // This makes the entire note area clickable
  container.addEventListener('click', (e) => {
    // Only focus if clicking on the container itself or empty space
    // (not on interactive elements within the editor)
    if (editorView && (e.target === container || e.target.classList.contains('cm-scroller') || e.target.classList.contains('cm-content'))) {
      editorView.focus();
    }
  });

  // Focus the editor
  editorView.focus();

  return editorView;
}

/**
 * Destroy the markdown editor
 */
export function destroyMarkdownEditor() {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }

  if (editorView) {
    editorView.destroy();
    editorView = null;
  }

  // Clean up slash menu DOM element
  cleanupSlashMenu();

  autoSaveCallback = null;
  currentNoteId = null;
}

/**
 * Get current editor content as markdown string
 * @returns {string} Raw markdown string
 */
export function getContent() {
  if (!editorView) return '';
  return editorView.state.doc.toString();
}

/**
 * Check if editor is currently active
 * @returns {boolean}
 */
export function isEditorActive() {
  return editorView !== null;
}

/**
 * Get the editor view instance (for advanced usage)
 * @returns {EditorView|null}
 */
export function getEditorView() {
  return editorView;
}

// ========================================
// Exports
// ========================================

export default {
  initMarkdownEditor,
  destroyMarkdownEditor,
  getContent,
  isEditorActive,
  getEditorView
};
