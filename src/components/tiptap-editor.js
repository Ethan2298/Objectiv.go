/**
 * Tiptap WYSIWYG Editor Component
 *
 * Provides markdown editing with a custom toolbar
 */

// ========================================
// Tiptap Imports via ESM.sh CDN
// ========================================

// We'll load Tiptap dynamically to avoid blocking initial load
let Editor = null;
let StarterKit = null;
let Placeholder = null;
let tiptapLoaded = false;
let loadPromise = null;

/**
 * Load Tiptap modules from CDN
 */
async function loadTiptap() {
  if (tiptapLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      console.log('Loading Tiptap from CDN...');

      // Import from esm.sh which handles bundling and dependencies
      const [coreModule, starterKitModule, placeholderModule] = await Promise.all([
        import('https://esm.sh/@tiptap/core@2.11.5'),
        import('https://esm.sh/@tiptap/starter-kit@2.11.5'),
        import('https://esm.sh/@tiptap/extension-placeholder@2.11.5')
      ]);

      Editor = coreModule.Editor;
      StarterKit = starterKitModule.default || starterKitModule.StarterKit;
      Placeholder = placeholderModule.default || placeholderModule.Placeholder;

      tiptapLoaded = true;
      console.log('Tiptap loaded successfully');
    } catch (error) {
      console.error('Failed to load Tiptap:', error);
      throw error;
    }
  })();

  return loadPromise;
}

// ========================================
// Editor State
// ========================================

let editorInstance = null;
let currentFilePath = null;
let isEditing = false;
let hasUnsavedChanges = false;

// ========================================
// Toolbar Configuration
// ========================================

const toolbarButtons = [
  { group: 'text', items: [
    { id: 'bold', icon: 'B', title: 'Bold (Ctrl+B)', command: (e) => e.chain().focus().toggleBold().run(), isActive: (e) => e.isActive('bold') },
    { id: 'italic', icon: 'I', title: 'Italic (Ctrl+I)', command: (e) => e.chain().focus().toggleItalic().run(), isActive: (e) => e.isActive('italic') },
    { id: 'strike', icon: 'S', title: 'Strikethrough', command: (e) => e.chain().focus().toggleStrike().run(), isActive: (e) => e.isActive('strike') },
    { id: 'code', icon: '<>', title: 'Inline Code', command: (e) => e.chain().focus().toggleCode().run(), isActive: (e) => e.isActive('code') },
  ]},
  { group: 'heading', items: [
    { id: 'h1', icon: 'H1', title: 'Heading 1', command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), isActive: (e) => e.isActive('heading', { level: 1 }) },
    { id: 'h2', icon: 'H2', title: 'Heading 2', command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), isActive: (e) => e.isActive('heading', { level: 2 }) },
    { id: 'h3', icon: 'H3', title: 'Heading 3', command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), isActive: (e) => e.isActive('heading', { level: 3 }) },
  ]},
  { group: 'list', items: [
    { id: 'bullet', icon: '•', title: 'Bullet List', command: (e) => e.chain().focus().toggleBulletList().run(), isActive: (e) => e.isActive('bulletList') },
    { id: 'ordered', icon: '1.', title: 'Numbered List', command: (e) => e.chain().focus().toggleOrderedList().run(), isActive: (e) => e.isActive('orderedList') },
  ]},
  { group: 'block', items: [
    { id: 'blockquote', icon: '"', title: 'Blockquote', command: (e) => e.chain().focus().toggleBlockquote().run(), isActive: (e) => e.isActive('blockquote') },
    { id: 'codeblock', icon: '{ }', title: 'Code Block', command: (e) => e.chain().focus().toggleCodeBlock().run(), isActive: (e) => e.isActive('codeBlock') },
    { id: 'hr', icon: '—', title: 'Horizontal Rule', command: (e) => e.chain().focus().setHorizontalRule().run(), isActive: () => false },
  ]},
];

// ========================================
// HTML Templates
// ========================================

/**
 * Create toolbar HTML
 */
function createToolbarHTML() {
  const groups = toolbarButtons.map(group => {
    const buttons = group.items.map(btn =>
      `<button class="editor-toolbar-btn" data-command="${btn.id}" title="${btn.title}">
        <span class="btn-icon">${btn.icon}</span>
      </button>`
    ).join('');
    return `<div class="editor-toolbar-group">${buttons}</div>`;
  }).join('');

  return `
    <div class="editor-toolbar">
      ${groups}
      <div class="editor-toolbar-spacer"></div>
      <div class="editor-toolbar-group editor-actions">
        <button class="editor-toolbar-btn editor-save-btn" data-command="save" title="Save (Ctrl+S)">
          <span class="btn-icon">💾</span>
          <span class="btn-label">Save</span>
        </button>
        <button class="editor-toolbar-btn editor-cancel-btn" data-command="cancel" title="Cancel">
          <span class="btn-icon">✕</span>
          <span class="btn-label">Cancel</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Create editor container HTML
 */
function createEditorHTML() {
  return `
    <div class="tiptap-editor-wrapper">
      ${createToolbarHTML()}
      <div class="tiptap-editor-container">
        <div id="tiptap-editor"></div>
      </div>
    </div>
  `;
}

// ========================================
// Editor Lifecycle
// ========================================

/**
 * Initialize the editor with content
 * @param {string} content - Markdown or HTML content
 * @param {string} filePath - Path to the file being edited
 * @param {HTMLElement} container - Container element
 */
export async function initEditor(content, filePath, container) {
  // Load Tiptap if not already loaded
  await loadTiptap();

  // Destroy existing editor
  destroyEditor();

  // Store state
  currentFilePath = filePath;
  isEditing = true;
  hasUnsavedChanges = false;

  // Insert editor HTML
  container.innerHTML = createEditorHTML();

  // Get editor element
  const editorElement = container.querySelector('#tiptap-editor');

  // Convert markdown to HTML for initial content
  const htmlContent = markdownToHtml(content);

  // Create Tiptap editor
  editorInstance = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: htmlContent,
    editorProps: {
      attributes: {
        class: 'tiptap-prose',
      },
    },
    onUpdate: ({ editor }) => {
      hasUnsavedChanges = true;
      updateToolbarState();
    },
    onSelectionUpdate: () => {
      updateToolbarState();
    },
  });

  // Setup toolbar event handlers
  setupToolbarHandlers(container);

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Focus editor
  editorInstance.commands.focus('end');

  return editorInstance;
}

/**
 * Destroy the editor instance
 */
export function destroyEditor() {
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }
  isEditing = false;
  hasUnsavedChanges = false;
  currentFilePath = null;
}

/**
 * Check if editor is currently active
 */
export function isEditorActive() {
  return isEditing && editorInstance !== null;
}

/**
 * Check for unsaved changes
 */
export function hasChanges() {
  return hasUnsavedChanges;
}

// ========================================
// Toolbar Handlers
// ========================================

/**
 * Setup toolbar button handlers
 */
function setupToolbarHandlers(container) {
  const buttons = container.querySelectorAll('.editor-toolbar-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      handleToolbarCommand(command);
    });
  });
}

/**
 * Handle toolbar command
 */
function handleToolbarCommand(commandId) {
  if (!editorInstance) return;

  // Handle special commands
  if (commandId === 'save') {
    saveContent();
    return;
  }

  if (commandId === 'cancel') {
    cancelEditing();
    return;
  }

  // Find and execute formatting command
  for (const group of toolbarButtons) {
    const btn = group.items.find(b => b.id === commandId);
    if (btn) {
      btn.command(editorInstance);
      updateToolbarState();
      return;
    }
  }
}

/**
 * Update toolbar button active states
 */
function updateToolbarState() {
  if (!editorInstance) return;

  const container = document.querySelector('.tiptap-editor-wrapper');
  if (!container) return;

  for (const group of toolbarButtons) {
    for (const btn of group.items) {
      const btnEl = container.querySelector(`[data-command="${btn.id}"]`);
      if (btnEl && btn.isActive) {
        btnEl.classList.toggle('is-active', btn.isActive(editorInstance));
      }
    }
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  // Ctrl+S to save
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  if (!isEditing) return;

  // Ctrl+S to save
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveContent();
  }

  // Escape to cancel (with confirmation if changes)
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelEditing();
  }
}

// ========================================
// Content Operations
// ========================================

// Callback for when content is saved
let onSaveCallback = null;

/**
 * Set callback for when content is saved
 */
export function setOnSave(callback) {
  onSaveCallback = callback;
}

/**
 * Save content back to file
 */
async function saveContent() {
  if (!editorInstance || !currentFilePath) return;

  try {
    // Get HTML and convert to markdown
    const html = editorInstance.getHTML();
    const markdown = htmlToMarkdown(html);

    // Save via FolderExplorer
    const FolderExplorer = window.Objectiv?.FolderExplorer;
    if (FolderExplorer && FolderExplorer.writeFile) {
      await FolderExplorer.writeFile(currentFilePath, markdown);
      hasUnsavedChanges = false;

      console.log('File saved:', currentFilePath);

      // Show save indicator
      showSaveIndicator();

      // Call save callback if set
      if (onSaveCallback) {
        onSaveCallback(markdown, currentFilePath);
      }
    } else {
      console.error('FolderExplorer.writeFile not available');
    }
  } catch (error) {
    console.error('Failed to save:', error);
    alert('Failed to save file: ' + error.message);
  }
}

/**
 * Cancel editing and return to view mode
 */
function cancelEditing() {
  if (hasUnsavedChanges) {
    const confirm = window.confirm('You have unsaved changes. Discard them?');
    if (!confirm) return;
  }

  // Cleanup
  document.removeEventListener('keydown', handleKeydown);

  // Trigger view refresh
  if (window.renderContentView) {
    destroyEditor();
    window.renderContentView();
  } else if (window.renderFileView) {
    destroyEditor();
    window.renderFileView();
  }
}

/**
 * Show save indicator
 */
function showSaveIndicator() {
  const saveBtn = document.querySelector('.editor-save-btn');
  if (saveBtn) {
    saveBtn.classList.add('saved');
    setTimeout(() => saveBtn.classList.remove('saved'), 1500);
  }
}

// ========================================
// Markdown Conversion
// ========================================

/**
 * Convert markdown to HTML for editor
 * Uses the existing markdown parser
 */
function markdownToHtml(markdown) {
  if (!markdown) return '<p></p>';

  // Use existing parser if available
  const Markdown = window.Objectiv?.Markdown;
  if (Markdown && Markdown.parseMarkdown) {
    // The existing parser adds wrapper classes, strip them for Tiptap
    let html = Markdown.parseMarkdown(markdown);
    // Convert our md-* classes to standard HTML
    html = html
      .replace(/class="md-h1"/g, '')
      .replace(/class="md-h2"/g, '')
      .replace(/class="md-h3"/g, '')
      .replace(/class="md-h4"/g, '')
      .replace(/class="md-h5"/g, '')
      .replace(/class="md-h6"/g, '')
      .replace(/class="md-p"/g, '')
      .replace(/class="md-ul"/g, '')
      .replace(/class="md-ol"/g, '')
      .replace(/class="md-li"/g, '')
      .replace(/class="md-blockquote"/g, '')
      .replace(/class="md-code-block"/g, '')
      .replace(/class="md-inline-code"/g, '')
      .replace(/class="md-link"/g, '')
      .replace(/class="md-hr"/g, '')
      .replace(/class="md-task( checked)?"/g, '');
    return html;
  }

  // Fallback: basic conversion
  return `<p>${markdown.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

/**
 * Convert HTML to markdown
 * Simple conversion for common elements
 */
function htmlToMarkdown(html) {
  if (!html) return '';

  // Create a temporary container
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Convert to markdown recursively
  return nodeToMarkdown(temp).trim();
}

/**
 * Convert a DOM node to markdown
 */
function nodeToMarkdown(node, listDepth = 0) {
  let result = '';

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      const innerMd = nodeToMarkdown(child, listDepth);

      switch (tag) {
        case 'h1': result += `# ${innerMd}\n\n`; break;
        case 'h2': result += `## ${innerMd}\n\n`; break;
        case 'h3': result += `### ${innerMd}\n\n`; break;
        case 'h4': result += `#### ${innerMd}\n\n`; break;
        case 'h5': result += `##### ${innerMd}\n\n`; break;
        case 'h6': result += `###### ${innerMd}\n\n`; break;
        case 'p': result += `${innerMd}\n\n`; break;
        case 'br': result += '\n'; break;
        case 'strong':
        case 'b': result += `**${innerMd}**`; break;
        case 'em':
        case 'i': result += `*${innerMd}*`; break;
        case 's':
        case 'del': result += `~~${innerMd}~~`; break;
        case 'code':
          if (child.parentElement?.tagName.toLowerCase() === 'pre') {
            result += innerMd;
          } else {
            result += `\`${innerMd}\``;
          }
          break;
        case 'pre':
          const codeEl = child.querySelector('code');
          const code = codeEl ? codeEl.textContent : child.textContent;
          result += `\`\`\`\n${code}\n\`\`\`\n\n`;
          break;
        case 'blockquote':
          result += innerMd.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
          break;
        case 'ul':
          result += nodeToMarkdown(child, listDepth) + '\n';
          break;
        case 'ol':
          result += nodeToMarkdown(child, listDepth) + '\n';
          break;
        case 'li':
          const prefix = child.parentElement?.tagName.toLowerCase() === 'ol'
            ? '1. '
            : '- ';
          const indent = '  '.repeat(listDepth);
          result += `${indent}${prefix}${innerMd}\n`;
          break;
        case 'a':
          const href = child.getAttribute('href') || '';
          result += `[${innerMd}](${href})`;
          break;
        case 'hr':
          result += '---\n\n';
          break;
        default:
          result += innerMd;
      }
    }
  }

  return result;
}

// ========================================
// Note Editor (Auto-save mode)
// ========================================

let noteEditorInstance = null;
let noteAutoSaveCallback = null;
let noteAutoSaveTimeout = null;
const NOTE_AUTOSAVE_DELAY = 1000; // 1 second debounce

/**
 * Create toolbar HTML for note editor (minimal version)
 */
function createNoteToolbarHTML() {
  const groups = toolbarButtons.map(group => {
    const buttons = group.items.map(btn =>
      `<button class="editor-toolbar-btn" data-command="${btn.id}" title="${btn.title}">
        <span class="btn-icon">${btn.icon}</span>
      </button>`
    ).join('');
    return `<div class="editor-toolbar-group">${buttons}</div>`;
  }).join('');

  return `
    <div class="editor-toolbar note-toolbar">
      ${groups}
    </div>
  `;
}

/**
 * Create note editor container HTML - minimal Notion-style (no toolbar)
 */
function createNoteEditorHTML() {
  return `
    <div class="tiptap-editor-wrapper note-editor-wrapper">
      <div class="tiptap-editor-container">
        <div id="tiptap-note-editor"></div>
      </div>
    </div>
  `;
}

/**
 * Initialize the editor for note content with auto-save
 * @param {string} content - HTML content
 * @param {string} noteId - ID of the note
 * @param {HTMLElement} container - Container element
 * @param {Function} onAutoSave - Callback when content changes (receives HTML)
 */
export async function initNoteEditor(content, noteId, container, onAutoSave) {
  // Load Tiptap if not already loaded
  await loadTiptap();

  // Destroy existing note editor
  destroyNoteEditor();

  // Store auto-save callback
  noteAutoSaveCallback = onAutoSave;

  // Insert editor HTML
  container.innerHTML = createNoteEditorHTML();

  // Get editor element
  const editorElement = container.querySelector('#tiptap-note-editor');

  // Create Tiptap editor
  noteEditorInstance = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({
        placeholder: 'Write your note...',
      }),
    ],
    content: content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'tiptap-prose note-prose',
      },
    },
    onUpdate: ({ editor }) => {
      // Debounced auto-save
      if (noteAutoSaveTimeout) {
        clearTimeout(noteAutoSaveTimeout);
      }
      noteAutoSaveTimeout = setTimeout(() => {
        triggerNoteAutoSave();
      }, NOTE_AUTOSAVE_DELAY);
    },
    onBlur: () => {
      // Save immediately on blur
      if (noteAutoSaveTimeout) {
        clearTimeout(noteAutoSaveTimeout);
        noteAutoSaveTimeout = null;
      }
      triggerNoteAutoSave();
    },
  });

  // Focus editor
  noteEditorInstance.commands.focus('end');

  return noteEditorInstance;
}

/**
 * Trigger auto-save for note editor
 */
function triggerNoteAutoSave() {
  if (!noteEditorInstance || !noteAutoSaveCallback) return;

  const html = noteEditorInstance.getHTML();
  noteAutoSaveCallback(html);
}

/**
 * Destroy note editor instance
 */
export function destroyNoteEditor() {
  if (noteAutoSaveTimeout) {
    clearTimeout(noteAutoSaveTimeout);
    noteAutoSaveTimeout = null;
  }
  if (noteEditorInstance) {
    noteEditorInstance.destroy();
    noteEditorInstance = null;
  }
  noteAutoSaveCallback = null;
}

/**
 * Setup toolbar handlers for note editor
 */
function setupNoteToolbarHandlers(container) {
  const buttons = container.querySelectorAll('.editor-toolbar-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      handleNoteToolbarCommand(command);
    });
  });
}

/**
 * Handle note toolbar command
 */
function handleNoteToolbarCommand(commandId) {
  if (!noteEditorInstance) return;

  // Find and execute formatting command
  for (const group of toolbarButtons) {
    const btn = group.items.find(b => b.id === commandId);
    if (btn) {
      btn.command(noteEditorInstance);
      updateNoteToolbarState();
      return;
    }
  }
}

/**
 * Update note toolbar button active states
 */
function updateNoteToolbarState() {
  if (!noteEditorInstance) return;

  const container = document.querySelector('.note-editor-wrapper');
  if (!container) return;

  for (const group of toolbarButtons) {
    for (const btn of group.items) {
      const btnEl = container.querySelector(`[data-command="${btn.id}"]`);
      if (btnEl && btn.isActive) {
        btnEl.classList.toggle('is-active', btn.isActive(noteEditorInstance));
      }
    }
  }
}

// ========================================
// Exports
// ========================================

// Note: initEditor, destroyEditor, isEditorActive, hasChanges, setOnSave,
// initNoteEditor, destroyNoteEditor are already exported at their declarations
export {
  loadTiptap,
  saveContent,
  cancelEditing,
  htmlToMarkdown,
  markdownToHtml,
};

export default {
  loadTiptap,
  initEditor,
  destroyEditor,
  isEditorActive,
  hasChanges,
  saveContent,
  cancelEditing,
  setOnSave,
  htmlToMarkdown,
  markdownToHtml,
  initNoteEditor,
  destroyNoteEditor,
};
