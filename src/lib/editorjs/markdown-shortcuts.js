/**
 * Editor.js Markdown Shortcuts Plugin
 *
 * Enables markdown shortcuts for block conversion.
 * Type markdown syntax at the start of a block and press space to convert:
 *
 * # + space  → H1
 * ## + space → H2
 * ### + space → H3
 * - or * + space → Bullet list
 * 1. + space → Numbered list
 * [] or [ ] + space → Unchecked checkbox
 * [x] + space → Checked checkbox
 * > + space → Quote
 * ``` → Code block (on third backtick)
 * --- + enter → Divider
 */

class MarkdownShortcuts {
  /**
   * @param {EditorJS} editor - Editor.js instance
   */
  constructor(editor) {
    this.editor = editor;
    this.api = editor.blocks;
    this.holder = typeof editor.configuration.holder === 'string'
      ? document.getElementById(editor.configuration.holder)
      : editor.configuration.holder;

    // Backtick tracking for code block
    this.backtickCount = 0;
    this.lastBacktickTime = 0;

    // Bind handlers
    this.onKeyDown = this.onKeyDown.bind(this);

    // Attach listener
    this.holder.addEventListener('keydown', this.onKeyDown, true);
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {
    // Handle backticks for code block (no space needed)
    if (e.key === '`') {
      this.handleBacktick(e);
      return;
    }

    // Reset backtick count on non-backtick keys
    this.backtickCount = 0;

    // Handle space for most shortcuts
    if (e.code === 'Space') {
      this.handleSpace(e);
      return;
    }

    // Handle enter for divider (---)
    if (e.code === 'Enter') {
      this.handleEnter(e);
      return;
    }
  }

  /**
   * Get the current block's text content
   * @returns {{ text: string, block: object, index: number } | null}
   */
  getCurrentBlockText() {
    const index = this.api.getCurrentBlockIndex();
    if (index < 0) return null;

    const block = this.api.getBlockByIndex(index);
    if (!block) return null;

    // Only handle paragraph blocks
    if (block.name !== 'paragraph') return null;

    // Get the editable element
    const blockElement = this.holder.querySelectorAll('.ce-block')[index];
    if (!blockElement) return null;

    const contentEditable = blockElement.querySelector('[contenteditable="true"]');
    if (!contentEditable) return null;

    return {
      text: contentEditable.textContent || '',
      block,
      index,
      element: contentEditable
    };
  }

  /**
   * Handle space key for markdown shortcuts
   * @param {KeyboardEvent} e
   */
  handleSpace(e) {
    const current = this.getCurrentBlockText();
    if (!current) return;

    const { text, index } = current;

    // Check patterns (most specific first)
    const patterns = [
      // Headings
      { pattern: /^###$/, type: 'header', data: { level: 3 } },
      { pattern: /^##$/, type: 'header', data: { level: 2 } },
      { pattern: /^#$/, type: 'header', data: { level: 1 } },

      // Lists
      { pattern: /^[-*]$/, type: 'list', data: { style: 'unordered', items: [{ content: '', items: [] }] } },
      { pattern: /^1\.$/, type: 'list', data: { style: 'ordered', items: [{ content: '', items: [] }] } },

      // Checklist
      { pattern: /^\[x\]$/i, type: 'checklist', data: { items: [{ text: '', checked: true }] } },
      { pattern: /^\[\s?\]$/, type: 'checklist', data: { items: [{ text: '', checked: false }] } },

      // Quote
      { pattern: /^>$/, type: 'quote', data: { text: '', caption: '' } }
    ];

    for (const { pattern, type, data } of patterns) {
      if (pattern.test(text)) {
        e.preventDefault();
        e.stopPropagation();
        this.convertBlock(index, type, data);
        return;
      }
    }
  }

  /**
   * Handle enter key for divider
   * @param {KeyboardEvent} e
   */
  handleEnter(e) {
    const current = this.getCurrentBlockText();
    if (!current) return;

    const { text, index } = current;

    // Check for divider pattern
    if (/^-{3,}$/.test(text)) {
      e.preventDefault();
      e.stopPropagation();
      this.convertBlock(index, 'delimiter', {});
      return;
    }
  }

  /**
   * Handle backtick key for code block
   * @param {KeyboardEvent} e
   */
  handleBacktick(e) {
    const now = Date.now();
    const current = this.getCurrentBlockText();
    if (!current) {
      this.backtickCount = 0;
      return;
    }

    const { text, index } = current;

    // Reset count if too much time has passed
    if (now - this.lastBacktickTime > 500) {
      this.backtickCount = 0;
    }
    this.lastBacktickTime = now;

    // Count existing backticks in text plus this one
    const existingBackticks = (text.match(/`/g) || []).length;

    if (existingBackticks === 2) {
      // This will be the third backtick
      e.preventDefault();
      e.stopPropagation();
      this.convertBlock(index, 'code', { code: '' });
      this.backtickCount = 0;
    }
  }

  /**
   * Convert current block to a new type
   * @param {number} index - Block index
   * @param {string} type - New block type
   * @param {object} data - Block data
   */
  convertBlock(index, type, data) {
    // Delete the current block
    this.api.delete(index);

    // Insert the new block at the same position (with focus)
    this.api.insert(type, data, undefined, index, true);

    // Set caret inside the new block after DOM updates
    setTimeout(() => {
      // Try Editor.js caret API first
      const caret = this.editor.caret;
      if (caret && typeof caret.setToBlock === 'function') {
        caret.setToBlock(index, 'start');
        return;
      }

      // Fallback: manually focus the contenteditable element
      const blocks = this.holder.querySelectorAll('.ce-block');
      const newBlock = blocks[index];
      if (newBlock) {
        const editable = newBlock.querySelector('[contenteditable="true"]');
        if (editable) {
          editable.focus();
          // Set caret at start
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editable);
          range.collapse(true); // Collapse to start
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }, 0);
  }

  /**
   * Cleanup when editor is destroyed
   */
  destroy() {
    this.holder.removeEventListener('keydown', this.onKeyDown, true);
  }
}

export default MarkdownShortcuts;
