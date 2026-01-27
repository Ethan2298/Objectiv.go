/**
 * Live Preview Extension for CodeMirror 6
 *
 * Implements Obsidian-style live preview:
 * - Hide markdown syntax when cursor is outside formatted text
 * - Show syntax when cursor enters the formatted region
 * - Render styled output (bold, headers, lists, etc.)
 */

import {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  RangeSetBuilder
} from './index.js';

// ========================================
// Widget Classes
// ========================================

/**
 * Checkbox widget for task lists
 */
class CheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  toDOM() {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;
    checkbox.className = 'cm-checkbox';
    checkbox.setAttribute('aria-label', this.checked ? 'Completed task' : 'Incomplete task');
    return checkbox;
  }

  eq(other) {
    return other.checked === this.checked;
  }

  ignoreEvent() {
    return false; // Allow click events
  }
}

/**
 * Horizontal rule widget
 */
class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr');
    hr.className = 'cm-hr';
    return hr;
  }

  eq() {
    return true;
  }
}

// ========================================
// Decoration Classes
// ========================================

const hideDecoration = Decoration.mark({ class: 'cm-hide' });

const lineDecorations = {
  header1: Decoration.line({ class: 'cm-md-header cm-md-header-1' }),
  header2: Decoration.line({ class: 'cm-md-header cm-md-header-2' }),
  header3: Decoration.line({ class: 'cm-md-header cm-md-header-3' }),
  header4: Decoration.line({ class: 'cm-md-header cm-md-header-4' }),
  header5: Decoration.line({ class: 'cm-md-header cm-md-header-5' }),
  header6: Decoration.line({ class: 'cm-md-header cm-md-header-6' }),
  quote: Decoration.line({ class: 'cm-md-quote' }),
  listItem: Decoration.line({ class: 'cm-md-list-item' }),
  codeBlock: Decoration.line({ class: 'cm-md-code-block' })
};

const markDecorations = {
  bold: Decoration.mark({ class: 'cm-md-bold' }),
  italic: Decoration.mark({ class: 'cm-md-italic' }),
  strikethrough: Decoration.mark({ class: 'cm-md-strikethrough' }),
  code: Decoration.mark({ class: 'cm-md-code' }),
  link: Decoration.mark({ class: 'cm-md-link' }),
  linkUrl: Decoration.mark({ class: 'cm-md-link-url' })
};

// ========================================
// Helper Functions
// ========================================

/**
 * Check if cursor is within a specific range
 */
function cursorInRange(cursorPos, from, to) {
  return cursorPos >= from && cursorPos <= to;
}

/**
 * Check if cursor is on the same line as a position
 */
function cursorOnLine(view, cursorPos, lineFrom) {
  const cursorLine = view.state.doc.lineAt(cursorPos).number;
  const targetLine = view.state.doc.lineAt(lineFrom).number;
  return cursorLine === targetLine;
}

// ========================================
// Live Preview Plugin
// ========================================

/**
 * Main live preview plugin
 */
export const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    // Collect all decorations as {from, to, decoration} objects
    const decorations = [];
    const cursorPos = view.state.selection.main.head;
    const doc = view.state.doc;

    // Track code block state
    let inCodeBlock = false;

    // Process each line
    for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
      const line = doc.line(lineNum);
      const text = line.text;
      const from = line.from;
      const to = line.to;
      const cursorOnThis = cursorOnLine(view, cursorPos, from);

      // Code block fences (```)
      if (text.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        decorations.push({ from, to: from, deco: lineDecorations.codeBlock });
        if (!cursorOnThis) {
          decorations.push({ from, to, deco: hideDecoration });
        }
        continue;
      }

      // Inside code block
      if (inCodeBlock) {
        decorations.push({ from, to: from, deco: lineDecorations.codeBlock });
        continue;
      }

      // Headers: # through ######
      const headerMatch = text.match(/^(#{1,6})\s/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const headerDeco = lineDecorations[`header${level}`];
        if (headerDeco) {
          decorations.push({ from, to: from, deco: headerDeco });
        }
        if (!cursorOnThis) {
          decorations.push({ from, to: from + headerMatch[0].length, deco: hideDecoration });
        }
        // Continue to process inline formatting on header lines
      }

      // Horizontal rule: ---, ***, ___
      if (/^([-*_])\1{2,}\s*$/.test(text)) {
        if (!cursorOnThis) {
          decorations.push({
            from, to,
            deco: Decoration.replace({ widget: new HorizontalRuleWidget() })
          });
        }
        continue;
      }

      // Blockquotes: >
      if (text.startsWith('>')) {
        decorations.push({ from, to: from, deco: lineDecorations.quote });
        if (!cursorOnThis) {
          const qMatch = text.match(/^>\s?/);
          if (qMatch) {
            decorations.push({ from, to: from + qMatch[0].length, deco: hideDecoration });
          }
        }
      }

      // Task lists: - [ ] or - [x]
      const taskMatch = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s/);
      if (taskMatch) {
        decorations.push({ from, to: from, deco: lineDecorations.listItem });
        if (!cursorOnThis) {
          const checked = taskMatch[3].toLowerCase() === 'x';
          const markerStart = from + taskMatch[1].length;
          const markerEnd = from + taskMatch[0].length;
          decorations.push({
            from: markerStart, to: markerEnd,
            deco: Decoration.replace({ widget: new CheckboxWidget(checked) })
          });
        }
        continue; // Skip inline processing for task list marker line
      }

      // Unordered lists: - * +
      const ulMatch = text.match(/^(\s*)([-*+])\s/);
      if (ulMatch) {
        decorations.push({ from, to: from, deco: lineDecorations.listItem });
      }

      // Ordered lists: 1. 2. etc.
      const olMatch = text.match(/^(\s*)(\d+)\.\s/);
      if (olMatch) {
        decorations.push({ from, to: from, deco: lineDecorations.listItem });
      }

      // Process inline formatting
      this.processInlineFormatting(text, from, cursorPos, decorations);
    }

    // Sort decorations by position (required by RangeSetBuilder)
    decorations.sort((a, b) => a.from - b.from || a.to - b.to);

    // Build the RangeSet
    const builder = new RangeSetBuilder();
    for (const { from, to, deco } of decorations) {
      try {
        builder.add(from, to, deco);
      } catch (e) {
        // Skip invalid ranges
      }
    }

    return builder.finish();
  }

  /**
   * Process inline formatting within a line
   */
  processInlineFormatting(text, lineStart, cursorPos, decorations) {
    // Bold: **text** or __text__
    let match;
    const boldRegex = /(\*\*|__)(.+?)\1/g;
    while ((match = boldRegex.exec(text)) !== null) {
      const start = lineStart + match.index;
      const end = start + match[0].length;
      const markerLen = match[1].length;
      const cursorIn = cursorInRange(cursorPos, start, end);

      if (!cursorIn) {
        decorations.push({ from: start, to: start + markerLen, deco: hideDecoration });
        decorations.push({ from: end - markerLen, to: end, deco: hideDecoration });
      }
      decorations.push({ from: start + markerLen, to: end - markerLen, deco: markDecorations.bold });
    }

    // Italic: *text* or _text_ (not part of bold)
    // This regex avoids matching ** or __ by using negative lookbehind/lookahead
    const italicRegex = /(?<![*_])([*_])(?![*_])(.+?)(?<![*_])\1(?![*_])/g;
    while ((match = italicRegex.exec(text)) !== null) {
      const start = lineStart + match.index;
      const end = start + match[0].length;
      const cursorIn = cursorInRange(cursorPos, start, end);

      if (!cursorIn) {
        decorations.push({ from: start, to: start + 1, deco: hideDecoration });
        decorations.push({ from: end - 1, to: end, deco: hideDecoration });
      }
      decorations.push({ from: start + 1, to: end - 1, deco: markDecorations.italic });
    }

    // Strikethrough: ~~text~~
    const strikeRegex = /~~(.+?)~~/g;
    while ((match = strikeRegex.exec(text)) !== null) {
      const start = lineStart + match.index;
      const end = start + match[0].length;
      const cursorIn = cursorInRange(cursorPos, start, end);

      if (!cursorIn) {
        decorations.push({ from: start, to: start + 2, deco: hideDecoration });
        decorations.push({ from: end - 2, to: end, deco: hideDecoration });
      }
      decorations.push({ from: start + 2, to: end - 2, deco: markDecorations.strikethrough });
    }

    // Inline code: `code`
    const codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
      const start = lineStart + match.index;
      const end = start + match[0].length;
      const cursorIn = cursorInRange(cursorPos, start, end);

      if (!cursorIn) {
        decorations.push({ from: start, to: start + 1, deco: hideDecoration });
        decorations.push({ from: end - 1, to: end, deco: hideDecoration });
      }
      decorations.push({ from: start + 1, to: end - 1, deco: markDecorations.code });
    }

    // Links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(text)) !== null) {
      const start = lineStart + match.index;
      const end = start + match[0].length;
      const textStart = start + 1;
      const textEnd = textStart + match[1].length;
      const urlStart = textEnd + 2; // ](
      const urlEnd = end - 1;
      const cursorIn = cursorInRange(cursorPos, start, end);

      // Always style the link text
      decorations.push({ from: textStart, to: textEnd, deco: markDecorations.link });

      if (!cursorIn) {
        // Hide [ and ](url)
        decorations.push({ from: start, to: textStart, deco: hideDecoration });
        decorations.push({ from: textEnd, to: end, deco: hideDecoration });
      } else {
        // Show URL styled when editing
        decorations.push({ from: urlStart, to: urlEnd, deco: markDecorations.linkUrl });
      }
    }
  }
}, {
  decorations: v => v.decorations
});

// ========================================
// Checkbox Click Handler
// ========================================

/**
 * Handle checkbox clicks to toggle task state
 */
export const checkboxClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target;
    if (target.classList.contains('cm-checkbox')) {
      event.preventDefault();

      // Find the line containing this checkbox
      const pos = view.posAtDOM(target);
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;

      // Toggle [ ] <-> [x]
      let newText;
      if (lineText.includes('[ ]')) {
        newText = lineText.replace('[ ]', '[x]');
      } else if (lineText.includes('[x]') || lineText.includes('[X]')) {
        newText = lineText.replace(/\[[xX]\]/, '[ ]');
      } else {
        return false;
      }

      // Apply the change
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText }
      });

      return true;
    }
    return false;
  }
});

// ========================================
// Styles
// ========================================

/**
 * CSS styles for live preview decorations
 */
export const livePreviewStyles = EditorView.baseTheme({
  // Hidden syntax markers
  '.cm-hide': {
    display: 'none'
  },

  // Bold
  '.cm-md-bold': {
    fontWeight: 'bold'
  },

  // Italic
  '.cm-md-italic': {
    fontStyle: 'italic'
  },

  // Strikethrough
  '.cm-md-strikethrough': {
    textDecoration: 'line-through',
    opacity: '0.7'
  },

  // Inline code
  '.cm-md-code': {
    fontFamily: 'var(--font-mono, monospace)',
    backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.1))',
    borderRadius: '3px',
    padding: '1px 4px'
  },

  // Links
  '.cm-md-link': {
    color: 'var(--accent)',
    textDecoration: 'underline',
    cursor: 'pointer'
  },
  '.cm-md-link-url': {
    color: 'var(--text-muted)',
    fontSize: '0.9em'
  },

  // Headers
  '.cm-md-header': {
    fontWeight: '600'
  },
  '.cm-md-header-1': {
    fontSize: '1.75em',
    fontWeight: '700'
  },
  '.cm-md-header-2': {
    fontSize: '1.5em'
  },
  '.cm-md-header-3': {
    fontSize: '1.25em'
  },
  '.cm-md-header-4': {
    fontSize: '1.1em'
  },
  '.cm-md-header-5': {
    fontSize: '1em'
  },
  '.cm-md-header-6': {
    fontSize: '0.9em',
    color: 'var(--text-muted)'
  },

  // Blockquotes
  '.cm-md-quote': {
    borderLeft: '3px solid var(--border, #ccc)',
    paddingLeft: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic'
  },

  // List items
  '.cm-md-list-item': {
    // Basic styling
  },

  // Code blocks
  '.cm-md-code-block': {
    fontFamily: 'var(--font-mono, monospace)',
    backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.05))'
  },

  // Checkbox
  '.cm-checkbox': {
    width: '14px',
    height: '14px',
    marginRight: '6px',
    verticalAlign: 'middle',
    cursor: 'pointer',
    accentColor: 'var(--accent)'
  },

  // Horizontal rule
  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid var(--border, #ccc)',
    margin: '16px 0'
  }
});

// ========================================
// Combined Extension
// ========================================

/**
 * Complete live preview extension
 */
export const livePreviewExtension = [
  livePreviewPlugin,
  checkboxClickHandler,
  livePreviewStyles
];

export default livePreviewExtension;
