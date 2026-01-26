/**
 * Editor.js Component
 *
 * Provides a block-based editing experience for notes.
 * Uses Editor.js with plugins for headings, lists, quotes, code, etc.
 *
 * All plugins are loaded from local files (src/lib/editorjs/) to allow
 * customization, specifically for drag-drop ghost image behavior.
 */

// ========================================
// Editor.js Imports from Local Files
// ========================================

import {
  EditorJS,
  Header,
  NestedList,
  Checklist,
  Quote,
  CodeTool,
  Delimiter,
  InlineCode,
  Marker,
  Table,
  LinkTool,
  Embed,
  Warning,
  Toggle,
  Underline,
  Strikethrough,
  ColorPlugin,
  AlignmentTune,
  Undo,
  DragDrop,
  MarkdownShortcuts
} from '../lib/editorjs/index.js';

/**
 * Load Editor.js modules (no-op - modules are now statically imported)
 * Kept for API compatibility
 */
export async function loadEditorJs() {
  // Modules are statically imported, nothing to load
  return Promise.resolve();
}

// ========================================
// Editor State
// ========================================

let editorInstance = null;
let autoSaveCallback = null;
let autoSaveTimeout = null;
const AUTOSAVE_DELAY = 1000; // 1 second debounce

// ========================================
// Editor Lifecycle
// ========================================

/**
 * Initialize the Editor.js editor for note content
 * @param {string} content - JSON string of Editor.js data or empty
 * @param {string} noteId - ID of the note being edited
 * @param {HTMLElement} container - Container element
 * @param {Function} onAutoSave - Callback when content changes (receives JSON string)
 */
export async function initNoteEditor(content, noteId, container, onAutoSave) {
  // Editor.js modules are now statically imported

  // Destroy existing editor
  destroyNoteEditor();

  // Store auto-save callback
  autoSaveCallback = onAutoSave;

  // Create editor container
  container.innerHTML = `
    <div class="editorjs-editor-wrapper">
      <div id="editorjs-note-editor"></div>
    </div>
  `;

  const editorElement = container.querySelector('#editorjs-note-editor');

  // Parse content - could be JSON or empty
  let initialData = null;
  if (content) {
    try {
      initialData = JSON.parse(content);
    } catch (e) {
      // Not valid JSON - might be old HTML format
      // Will be handled by migration layer before calling this
      console.warn('Content is not valid Editor.js JSON:', e);
      initialData = { blocks: [] };
    }
  }

  // Create Editor.js instance
  editorInstance = new EditorJS({
    holder: editorElement,
    placeholder: 'Press "/" for commands...',
    autofocus: true,
    tools: {
      header: {
        class: Header,
        inlineToolbar: true,
        config: {
          levels: [1, 2, 3, 4, 5, 6],
          defaultLevel: 2
        },
        shortcut: 'CMD+SHIFT+H',
        tunes: ['alignmentTune']
      },
      list: {
        class: NestedList,
        inlineToolbar: true,
        config: {
          defaultStyle: 'unordered'
        },
        shortcut: 'CMD+SHIFT+L'
      },
      checklist: {
        class: Checklist,
        inlineToolbar: true,
        shortcut: 'CMD+SHIFT+C'
      },
      quote: {
        class: Quote,
        inlineToolbar: true,
        config: {
          quotePlaceholder: 'Enter a quote',
          captionPlaceholder: 'Quote author'
        },
        shortcut: 'CMD+SHIFT+Q'
      },
      code: {
        class: CodeTool,
        shortcut: 'CMD+SHIFT+P'
      },
      delimiter: {
        class: Delimiter,
        shortcut: 'CMD+SHIFT+D'
      },
      inlineCode: {
        class: InlineCode,
        shortcut: 'CMD+SHIFT+M'
      },
      marker: {
        class: Marker,
        shortcut: 'CMD+SHIFT+H'
      },
      // New block tools
      table: {
        class: Table,
        inlineToolbar: true,
        config: {
          rows: 2,
          cols: 3
        }
      },
      linkTool: {
        class: LinkTool,
        config: {
          endpoint: '' // No backend, just stores URL metadata
        }
      },
      embed: {
        class: Embed,
        config: {
          services: {
            youtube: true,
            vimeo: true,
            twitter: true,
            codepen: true,
            github: true
          }
        }
      },
      warning: {
        class: Warning,
        inlineToolbar: true,
        config: {
          titlePlaceholder: 'Title',
          messagePlaceholder: 'Message'
        }
      },
      toggle: {
        class: Toggle,
        inlineToolbar: true
      },
      // New inline tools
      underline: {
        class: Underline
      },
      strikethrough: {
        class: Strikethrough
      },
      Color: {
        class: ColorPlugin,
        config: {
          colorCollections: [
            '#FF1300', '#EC7878', '#9C27B0', '#673AB7',
            '#3F51B5', '#0070FF', '#03A9F4', '#00BCD4',
            '#4CAF50', '#8BC34A', '#CDDC39', '#FFFFFF'
          ],
          defaultColor: '#FF1300',
          type: 'text'
        }
      },
      Marker: {
        class: ColorPlugin,
        config: {
          defaultColor: '#FFBF00',
          type: 'marker'
        }
      },
      // Alignment block tune
      alignmentTune: {
        class: AlignmentTune
      }
    },
    tunes: ['alignmentTune'],
    data: initialData || { blocks: [] },
    onChange: async () => {
      // Debounced auto-save
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = setTimeout(() => {
        triggerAutoSave();
      }, AUTOSAVE_DELAY);
    },
    onReady: () => {
      // Initialize undo/redo functionality
      new Undo({ editor: editorInstance });
      // Initialize drag-and-drop block reordering with custom border style
      // Ghost image is now handled directly in the local drag-drop.js plugin
      new DragDrop(editorInstance, '2px solid var(--accent, #0891b2)');
      // Initialize markdown shortcuts for block conversion
      new MarkdownShortcuts(editorInstance);

      // Restart toolbar fade-in animation when toolbar moves to a new block
      const setupToolbarAnimation = () => {
        const toolbar = editorElement.querySelector('.ce-toolbar');
        if (!toolbar) {
          // Toolbar not ready yet, wait for it
          setTimeout(setupToolbarAnimation, 100);
          return;
        }
        let lastTop = '';
        const observer = new MutationObserver(() => {
          const currentTop = toolbar.style.top;
          if (currentTop && currentTop !== lastTop) {
            lastTop = currentTop;
            const actions = toolbar.querySelector('.ce-toolbar__actions');
            if (actions) {
              actions.style.animation = 'none';
              requestAnimationFrame(() => {
                actions.style.animation = '';
              });
            }
          }
        });
        observer.observe(toolbar, { attributes: true, attributeFilter: ['style'] });
      };
      setupToolbarAnimation();
    }
  });

  return editorInstance;
}

/**
 * Trigger auto-save for note editor
 */
async function triggerAutoSave() {
  if (!editorInstance || !autoSaveCallback) return;

  try {
    const data = await editorInstance.save();
    const jsonContent = JSON.stringify(data);
    autoSaveCallback(jsonContent);
  } catch (error) {
    console.error('Failed to save editor content:', error);
  }
}

/**
 * Destroy note editor instance
 */
export function destroyNoteEditor() {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }
  autoSaveCallback = null;
}

/**
 * Get current editor content as JSON string
 * @returns {Promise<string>} JSON string of Editor.js data
 */
export async function getContent() {
  if (!editorInstance) return '';

  try {
    const data = await editorInstance.save();
    return JSON.stringify(data);
  } catch (error) {
    console.error('Failed to get editor content:', error);
    return '';
  }
}

/**
 * Check if editor is currently active
 */
export function isEditorActive() {
  return editorInstance !== null;
}

// ========================================
// Exports
// ========================================

export default {
  loadEditorJs,
  initNoteEditor,
  destroyNoteEditor,
  getContent,
  isEditorActive
};
