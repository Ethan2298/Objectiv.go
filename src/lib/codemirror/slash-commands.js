/**
 * Slash Commands Extension for CodeMirror 6
 *
 * Notion-style slash commands for inserting block types.
 * Type "/" to open a menu of block types.
 */

import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  keymap
} from './index.js';

// ========================================
// Block Type Definitions
// ========================================

const BLOCK_TYPES = [
  // Text blocks
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain text paragraph',
    icon: 'T',
    keywords: ['text', 'paragraph', 'plain'],
    markdown: '',
    transform: (lineText) => lineText // Just remove the slash command
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    keywords: ['heading', 'h1', 'title', 'large'],
    markdown: '# ',
    transform: (lineText) => '# ' + lineText
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    keywords: ['heading', 'h2', 'subtitle', 'medium'],
    markdown: '## ',
    transform: (lineText) => '## ' + lineText
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    keywords: ['heading', 'h3', 'small'],
    markdown: '### ',
    transform: (lineText) => '### ' + lineText
  },
  // List blocks
  {
    id: 'bullet',
    label: 'Bulleted List',
    description: 'Create a bullet point',
    icon: '•',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    markdown: '- ',
    transform: (lineText) => '- ' + lineText
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    description: 'Create a numbered list',
    icon: '1.',
    keywords: ['number', 'list', 'ordered', 'ol'],
    markdown: '1. ',
    transform: (lineText) => '1. ' + lineText
  },
  {
    id: 'todo',
    label: 'To-do List',
    description: 'Track tasks with checkboxes',
    icon: '☐',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    markdown: '- [ ] ',
    transform: (lineText) => '- [ ] ' + lineText
  },
  {
    id: 'toggle',
    label: 'Toggle List',
    description: 'Collapsible content (uses details)',
    icon: '▸',
    keywords: ['toggle', 'collapse', 'expand', 'details'],
    markdown: '<details>\n<summary>',
    insertAfter: '</summary>\n\n</details>',
    transform: (lineText) => `<details>\n<summary>${lineText || 'Toggle'}</summary>\n\n</details>`
  },
  // Quote & callout blocks
  {
    id: 'quote',
    label: 'Quote',
    description: 'Capture a quote',
    icon: '"',
    keywords: ['quote', 'blockquote', 'cite'],
    markdown: '> ',
    transform: (lineText) => '> ' + lineText
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Highlighted info box',
    icon: '💡',
    keywords: ['callout', 'info', 'note', 'warning', 'tip'],
    markdown: '> [!NOTE]\n> ',
    transform: (lineText) => `> [!NOTE]\n> ${lineText}`
  },
  // Code blocks
  {
    id: 'code',
    label: 'Code Block',
    description: 'Write code with syntax highlighting',
    icon: '</>',
    keywords: ['code', 'codeblock', 'snippet', 'programming'],
    markdown: '```\n',
    insertAfter: '\n```',
    transform: (lineText) => '```\n' + lineText + '\n```'
  },
  // Divider
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal line separator',
    icon: '—',
    keywords: ['divider', 'line', 'separator', 'hr', 'horizontal'],
    markdown: '---\n',
    transform: () => '---\n'
  }
];

// ========================================
// Slash Menu State
// ========================================

let menuState = {
  isOpen: false,
  query: '',
  selectedIndex: 0,
  position: { top: 0, left: 0 },
  triggerPos: null, // Position where "/" was typed
  menuElement: null
};

// ========================================
// Menu UI
// ========================================

/**
 * Create the slash menu DOM element
 */
function createMenuElement() {
  const menu = document.createElement('div');
  menu.className = 'slash-menu';
  menu.setAttribute('role', 'listbox');
  menu.innerHTML = `
    <div class="slash-menu-header">Blocks</div>
    <div class="slash-menu-items"></div>
  `;
  return menu;
}

/**
 * Filter block types by query
 */
function filterBlockTypes(query) {
  if (!query) return BLOCK_TYPES;

  const lowerQuery = query.toLowerCase();
  return BLOCK_TYPES.filter(block =>
    block.label.toLowerCase().includes(lowerQuery) ||
    block.keywords.some(kw => kw.includes(lowerQuery))
  );
}

/**
 * Render menu items
 */
function renderMenuItems(filteredBlocks) {
  if (!menuState.menuElement) return;

  const itemsContainer = menuState.menuElement.querySelector('.slash-menu-items');
  if (!itemsContainer) return;

  if (filteredBlocks.length === 0) {
    itemsContainer.innerHTML = '<div class="slash-menu-empty">No matching blocks</div>';
    return;
  }

  itemsContainer.innerHTML = filteredBlocks.map((block, index) => `
    <div class="slash-menu-item ${index === menuState.selectedIndex ? 'selected' : ''}"
         data-index="${index}"
         data-block-id="${block.id}"
         role="option"
         aria-selected="${index === menuState.selectedIndex}">
      <span class="slash-menu-icon">${block.icon}</span>
      <div class="slash-menu-text">
        <span class="slash-menu-label">${block.label}</span>
        <span class="slash-menu-description">${block.description}</span>
      </div>
    </div>
  `).join('');

  // Add click handlers
  itemsContainer.querySelectorAll('.slash-menu-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent blur from firing before click completes
      const blockId = item.dataset.blockId;
      const block = BLOCK_TYPES.find(b => b.id === blockId);
      console.log('[SlashCmd] Click:', blockId, block, 'view:', !!menuState.view);
      if (block && menuState.view) {
        insertBlock(menuState.view, block);
      }
    });

    item.addEventListener('mouseenter', () => {
      menuState.selectedIndex = parseInt(item.dataset.index);
      renderMenuItems(filteredBlocks);
    });
  });
}

/**
 * Show the slash menu
 */
function showMenu(view, pos) {
  // Get cursor coordinates
  const coords = view.coordsAtPos(pos);
  if (!coords) return;

  // Create menu if needed
  if (!menuState.menuElement) {
    menuState.menuElement = createMenuElement();
    document.body.appendChild(menuState.menuElement);
  }

  // Store state
  menuState.isOpen = true;
  menuState.query = '';
  menuState.selectedIndex = 0;
  menuState.triggerPos = pos;
  menuState.view = view;

  // Position menu below cursor
  const editorRect = view.dom.getBoundingClientRect();
  menuState.menuElement.style.top = `${coords.bottom + 4}px`;
  menuState.menuElement.style.left = `${Math.max(coords.left - 10, editorRect.left)}px`;
  menuState.menuElement.classList.add('visible');

  // Render items
  renderMenuItems(filterBlockTypes(''));
}

/**
 * Hide the slash menu
 */
function hideMenu() {
  if (menuState.menuElement) {
    menuState.menuElement.classList.remove('visible');
  }
  menuState.isOpen = false;
  menuState.query = '';
  menuState.triggerPos = null;
  menuState.view = null;
}

/**
 * Update menu based on typed query
 */
function updateMenuQuery(query) {
  menuState.query = query;
  menuState.selectedIndex = 0;
  const filtered = filterBlockTypes(query);
  renderMenuItems(filtered);
  return filtered;
}

// ========================================
// Block Insertion
// ========================================

/**
 * Insert a block at the current position
 */
function insertBlock(view, block) {
  if (!menuState.triggerPos) return;

  const line = view.state.doc.lineAt(menuState.triggerPos);
  const slashStart = menuState.triggerPos - 1; // Position of "/"
  const currentPos = view.state.selection.main.head;

  // Get any text after the slash command on this line
  const textAfterSlash = view.state.sliceDoc(currentPos, line.to).trim();

  // Calculate what to replace (from "/" to current cursor)
  const replaceFrom = slashStart;
  const replaceTo = currentPos;

  // Build the new content
  let newContent;
  if (block.transform) {
    newContent = block.transform(textAfterSlash);
  } else {
    newContent = block.markdown + textAfterSlash;
    if (block.insertAfter) {
      newContent += block.insertAfter;
    }
  }

  // Calculate new cursor position
  let cursorOffset = block.markdown.length;
  if (block.id === 'code') {
    cursorOffset = 4; // After ```\n
  } else if (block.id === 'toggle') {
    cursorOffset = 20; // Inside <summary>
  } else if (block.id === 'callout') {
    cursorOffset = 14; // After > [!NOTE]\n>
  }

  // Apply the change
  view.dispatch({
    changes: { from: replaceFrom, to: replaceTo, insert: newContent },
    selection: { anchor: replaceFrom + cursorOffset }
  });

  hideMenu();
  view.focus();
}

// ========================================
// Keyboard Handler
// ========================================

/**
 * Handle keyboard events for the slash menu
 */
function handleMenuKeydown(view, event) {
  if (!menuState.isOpen) return false;

  const filtered = filterBlockTypes(menuState.query);

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      menuState.selectedIndex = (menuState.selectedIndex + 1) % filtered.length;
      renderMenuItems(filtered);
      return true;

    case 'ArrowUp':
      event.preventDefault();
      menuState.selectedIndex = (menuState.selectedIndex - 1 + filtered.length) % filtered.length;
      renderMenuItems(filtered);
      return true;

    case 'Enter':
    case 'Tab':
      event.preventDefault();
      if (filtered[menuState.selectedIndex]) {
        insertBlock(view, filtered[menuState.selectedIndex]);
      }
      return true;

    case 'Escape':
      event.preventDefault();
      hideMenu();
      return true;

    case 'Backspace':
      // If query is empty and backspace pressed, close menu
      if (menuState.query === '') {
        hideMenu();
        return false; // Let the backspace delete the "/"
      }
      return false;

    default:
      return false;
  }
}

// ========================================
// Editor Plugin
// ========================================

/**
 * Slash command plugin
 */
export const slashCommandPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
  }

  update(update) {
    // Check for "/" being typed
    if (update.docChanged && !menuState.isOpen) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const lineTextBeforeCursor = update.state.sliceDoc(line.from, pos);

      // Check if "/" was just typed at start of line or after whitespace
      if (lineTextBeforeCursor === '/' || lineTextBeforeCursor.endsWith(' /')) {
        // Defer menu showing until after update completes (can't read layout during update)
        const view = this.view;
        requestAnimationFrame(() => showMenu(view, pos));
      }
    }

    // Update query if menu is open
    if (update.docChanged && menuState.isOpen && menuState.triggerPos !== null) {
      const pos = update.state.selection.main.head;
      const slashPos = menuState.triggerPos - 1;

      // Check if "/" still exists at the trigger position
      if (slashPos < 0 || slashPos >= update.state.doc.length) {
        hideMenu();
        return;
      }

      const charAtSlash = update.state.sliceDoc(slashPos, slashPos + 1);
      if (charAtSlash !== '/') {
        // "/" was deleted, close menu
        hideMenu();
        return;
      }

      // Extract query (text after "/")
      if (pos >= slashPos) {
        const query = update.state.sliceDoc(menuState.triggerPos, pos);

        // Close menu if query has spaces or is too long
        if (query.includes(' ') || query.length > 20) {
          hideMenu();
        } else {
          const filtered = updateMenuQuery(query);
          // Close if no matches
          if (filtered.length === 0 && query.length > 2) {
            hideMenu();
          }
        }
      } else {
        // Cursor moved before slash, close menu
        hideMenu();
      }
    }

    // Close menu if selection changes significantly
    if (update.selectionSet && menuState.isOpen) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const triggerLine = menuState.triggerPos ? update.state.doc.lineAt(menuState.triggerPos) : null;

      // Close if moved to different line
      if (triggerLine && line.number !== triggerLine.number) {
        hideMenu();
      }
    }
  }
}, {
  eventHandlers: {
    keydown: (event, view) => handleMenuKeydown(view, event),
    blur: () => {
      // Delay hiding to allow click on menu items
      setTimeout(() => {
        if (!menuState.menuElement?.matches(':hover')) {
          hideMenu();
        }
      }, 150);
    }
  }
});

// ========================================
// Cleanup
// ========================================

/**
 * Clean up menu element when editor is destroyed
 */
export function cleanupSlashMenu() {
  if (menuState.menuElement) {
    menuState.menuElement.remove();
    menuState.menuElement = null;
  }
  hideMenu();
}

// ========================================
// Export Extension
// ========================================

export const slashCommandExtension = [
  slashCommandPlugin
];

export default slashCommandExtension;
