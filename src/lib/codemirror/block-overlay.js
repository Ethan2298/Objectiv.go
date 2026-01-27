/**
 * Block Overlay Extension for CodeMirror 6
 *
 * Renders Notion-style block handles and manages block selection.
 * Handles are positioned absolutely over the editor content.
 */

import {
  EditorView,
  ViewPlugin,
  Decoration,
  StateField,
  StateEffect,
  RangeSetBuilder
} from './index.js';

import {
  parseBlocks,
  getBlockAtLine,
  getBlockIndexAtLine,
  getBlocksInViewport,
  shouldShowHandle,
  BlockType
} from './block-parser.js';

// ========================================
// State Effects
// ========================================

/**
 * Effect to select a single block (replaces current selection)
 */
export const selectBlockEffect = StateEffect.define();

/**
 * Effect to select multiple blocks (replaces current selection)
 */
export const selectBlocksEffect = StateEffect.define();

/**
 * Effect to add blocks to selection
 */
export const addToSelectionEffect = StateEffect.define();

/**
 * Effect to clear block selection
 */
export const clearBlockSelectionEffect = StateEffect.define();

// ========================================
// State Field
// ========================================

/**
 * StateField to track selected block indices (Set stored as array for serialization)
 */
export const selectedBlockField = StateField.define({
  create() {
    return []; // Empty selection (array of indices)
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(selectBlockEffect)) {
        // Single block selection - wrap in array
        return effect.value >= 0 ? [effect.value] : [];
      }
      if (effect.is(selectBlocksEffect)) {
        // Multi-block selection - use array directly
        return effect.value;
      }
      if (effect.is(addToSelectionEffect)) {
        // Add to existing selection
        const toAdd = Array.isArray(effect.value) ? effect.value : [effect.value];
        const newSet = new Set([...value, ...toAdd]);
        return Array.from(newSet).sort((a, b) => a - b);
      }
      if (effect.is(clearBlockSelectionEffect)) {
        return [];
      }
    }
    // Clear selection on document changes
    if (tr.docChanged) {
      return [];
    }
    return value;
  }
});

// ========================================
// Block Selection Decorations
// ========================================

/**
 * Decoration for selected block background
 */
const selectedBlockDecoration = Decoration.line({ class: 'cm-block-selected' });

/**
 * Create decorations for selected blocks
 */
function createSelectionDecorations(view) {
  const builder = new RangeSetBuilder();
  const selectedIndices = view.state.field(selectedBlockField);

  if (selectedIndices.length === 0) {
    return builder.finish();
  }

  const blocks = parseBlocks(view.state.doc);

  // Collect all lines that need decoration (must be added in order)
  const linesToDecorate = [];

  for (const selectedIndex of selectedIndices) {
    const block = blocks[selectedIndex];
    if (!block) continue;

    for (let lineNum = block.startLine; lineNum <= block.endLine; lineNum++) {
      linesToDecorate.push(lineNum);
    }
  }

  // Sort and dedupe lines, then add decorations
  const uniqueLines = [...new Set(linesToDecorate)].sort((a, b) => a - b);
  for (const lineNum of uniqueLines) {
    const line = view.state.doc.line(lineNum);
    builder.add(line.from, line.from, selectedBlockDecoration);
  }

  return builder.finish();
}

/**
 * ViewPlugin for selection decorations
 */
const selectionDecorationPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = createSelectionDecorations(view);
  }

  update(update) {
    if (update.docChanged ||
        update.transactions.some(tr =>
          tr.effects.some(e =>
            e.is(selectBlockEffect) ||
            e.is(selectBlocksEffect) ||
            e.is(addToSelectionEffect) ||
            e.is(clearBlockSelectionEffect)
          )
        )) {
      this.decorations = createSelectionDecorations(update.view);
    }
  }
}, {
  decorations: v => v.decorations
});

// ========================================
// Block Handles Overlay
// ========================================

/**
 * ViewPlugin that renders block handles as an overlay
 */
const blockHandlesPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.blocks = [];
    this.overlay = null;
    this.handleElements = new Map();
    this.hoveredBlockIndex = -1; // Track which block is being hovered

    // Multi-block selection state
    this.isSelecting = false;
    this.selectionStartY = null;
    this.selectionStartX = null;
    this.pendingSelection = new Set(); // Blocks being selected during drag
    this.selectionRect = null; // Visual selection rectangle

    this.createOverlay();
    this.updateBlocks();
    this.renderHandles();
    this.setupBlockHoverTracking();
    this.setupMarginSelection();
  }

  /**
   * Create the overlay container
   */
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'cm-block-overlay';
    this.overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      pointer-events: none;
      z-index: 10;
    `;
    // Height will be set by updateOverlayHeight()

    // Create selection rectangle for visual feedback during drag
    // Attach to content-page so it can extend above the title
    this.selectionRect = document.createElement('div');
    this.selectionRect.className = 'cm-selection-rect';
    this.selectionRect.style.cssText = `
      position: absolute;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 3px;
      pointer-events: none;
      display: none;
      z-index: 50;
    `;

    // Use event delegation for handle interactions
    this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this), true);
    this.overlay.addEventListener('click', this.handleClick.bind(this), true);

    // Insert overlay into the scroller
    requestAnimationFrame(() => {
      const scroller = this.view.scrollDOM;
      if (scroller && this.overlay) {
        scroller.style.position = 'relative';
        scroller.appendChild(this.overlay);
        this.updateOverlayHeight();
      }

      // Attach selection rectangle to content-page for full-page coverage
      const contentPage = document.getElementById('content-page');
      if (contentPage && this.selectionRect) {
        contentPage.style.position = 'relative';
        contentPage.appendChild(this.selectionRect);
      }
    });
  }

  /**
   * Convert viewport (client) coordinates to content-page-relative coordinates
   * Accounts for scroll position so coordinates are relative to full content
   */
  viewportToContentPageCoords(clientX, clientY) {
    const contentPage = document.getElementById('content-page');
    if (!contentPage) {
      // Fallback to scroller coords
      const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
      const scrollTop = this.view.scrollDOM.scrollTop;
      return {
        x: clientX - scrollerRect.left,
        y: clientY - scrollerRect.top + scrollTop
      };
    }
    const pageRect = contentPage.getBoundingClientRect();
    const scrollTop = contentPage.scrollTop;
    return {
      x: clientX - pageRect.left,
      y: clientY - pageRect.top + scrollTop
    };
  }

  /**
   * Update overlay height to match content
   */
  updateOverlayHeight() {
    if (!this.overlay) return;
    const contentHeight = this.view.contentDOM.offsetHeight;
    const scrollerHeight = this.view.scrollDOM.clientHeight;
    // Use the larger of content height or visible area
    this.overlay.style.height = `${Math.max(contentHeight, scrollerHeight)}px`;
  }

  /**
   * Set up mouse tracking to detect which block is being hovered
   */
  setupBlockHoverTracking() {
    // Track mouse movement over the editor content
    this.handleMouseMove = (e) => {
      const newHoveredIndex = this.getBlockIndexAtMousePosition(e);
      if (newHoveredIndex !== this.hoveredBlockIndex) {
        this.hoveredBlockIndex = newHoveredIndex;
        this.updateHoverState();
      }
    };

    // Clear hover when mouse leaves the editor
    this.handleMouseLeave = () => {
      if (this.hoveredBlockIndex !== -1) {
        this.hoveredBlockIndex = -1;
        this.updateHoverState();
      }
    };

    // Attach listeners to the scroll DOM (includes margins)
    this.view.scrollDOM.addEventListener('mousemove', this.handleMouseMove);
    this.view.scrollDOM.addEventListener('mouseleave', this.handleMouseLeave);
  }

  /**
   * Set up margin selection for multi-block selection
   */
  setupMarginSelection() {
    // Check if click is in margin area (left, right, or below last block)
    this.isInMargin = (e) => {
      const contentRect = this.view.contentDOM.getBoundingClientRect();
      const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
      const contentPage = document.getElementById('content-page');
      const pageRect = contentPage ? contentPage.getBoundingClientRect() : scrollerRect;
      const x = e.clientX;
      const y = e.clientY;

      // Use the wider of scroller or content-page for margin detection
      const outerLeft = Math.min(scrollerRect.left, pageRect.left);
      const outerRight = Math.max(scrollerRect.right, pageRect.right);
      const outerBottom = Math.max(scrollerRect.bottom, pageRect.bottom);

      // Left margin: between outer container and content
      const inLeftMargin = x >= outerLeft && x < contentRect.left;
      // Right margin: between content and outer container
      const inRightMargin = x > contentRect.right && x <= outerRight;

      // Bottom margin: check if below the last block's bottom edge
      let inBottomMargin = false;
      if (this.blocks && this.blocks.length > 0) {
        const lastBlock = this.blocks[this.blocks.length - 1];
        const lastLine = this.view.state.doc.line(lastBlock.endLine);
        const lastLinePos = this.view.lineBlockAt(lastLine.from);
        const lastBlockBottom = lastLinePos.top + lastLinePos.height + contentRect.top - this.view.scrollDOM.scrollTop;
        // Add some buffer (e.g., one line height) to account for padding between blocks
        inBottomMargin = y > lastBlockBottom + 20 && y <= outerBottom;
      }

      return inLeftMargin || inRightMargin || inBottomMargin;
    };

    // Get document Y coordinate from viewport Y
    this.getDocumentY = (clientY) => {
      const contentPage = document.getElementById('content-page');
      if (contentPage) {
        return clientY + contentPage.scrollTop;
      }
      return clientY + window.scrollY;
    };

    // Get viewport Y coordinate from document Y
    this.getViewportY = (docY) => {
      const contentPage = document.getElementById('content-page');
      if (contentPage) {
        return docY - contentPage.scrollTop;
      }
      return docY - window.scrollY;
    };

    // Handle mousedown in margin to start selection
    this.handleMarginMouseDown = (e) => {
      if (!this.isInMargin(e)) return;
      if (e.target.closest('.cm-block-handle-wrapper')) return;
      // Don't interfere with title/description editing
      if (e.target.closest('#content-header-title, #content-header-description')) return;

      e.preventDefault();
      e.stopPropagation();

      // Clear any existing block selection
      const selectedIndices = this.view.state.field(selectedBlockField);
      if (selectedIndices.length > 0) {
        this.view.dispatch({
          effects: clearBlockSelectionEffect.of(null)
        });
      }

      this.isSelecting = true;

      // Store start position in DOCUMENT coordinates (scroll-independent)
      this.selectionStartDocY = this.getDocumentY(e.clientY);
      this.selectionStartX = e.clientX;
      this.pendingSelection.clear();

      // Add selecting class to hide hover handles
      this.overlay.classList.add('is-selecting');

      // Start auto-scroll interval
      this.autoScrollInterval = setInterval(() => {
        if (!this.isSelecting || this.lastMouseY === undefined) return;

        const scrollThreshold = 80;
        const scrollSpeed = 15;
        const viewportTop = 0;
        const viewportBottom = window.innerHeight;

        let scrollAmount = 0;

        if (this.lastMouseY < viewportTop + scrollThreshold) {
          const proximity = 1 - Math.max(0, this.lastMouseY) / scrollThreshold;
          scrollAmount = -scrollSpeed * Math.max(0.3, proximity);
        } else if (this.lastMouseY > viewportBottom - scrollThreshold) {
          const proximity = 1 - (viewportBottom - this.lastMouseY) / scrollThreshold;
          scrollAmount = scrollSpeed * Math.max(0.3, proximity);
        }

        if (scrollAmount !== 0) {
          const scrolled = this.performScroll(scrollAmount);
          if (scrolled) {
            this.updateSelectionAfterScroll();
          }
        }
      }, 16);

      // Store start position in content-page coordinates
      const startPos = this.viewportToContentPageCoords(e.clientX, e.clientY);
      this.selectionStartPos = startPos;

      // Show selection rectangle (using content-page coordinates)
      if (this.selectionRect) {
        this.selectionRect.style.display = 'block';
        this.selectionRect.style.left = `${startPos.x}px`;
        this.selectionRect.style.top = `${startPos.y}px`;
        this.selectionRect.style.width = '0px';
        this.selectionRect.style.height = '0px';
      }

      // Store initial mouse position
      this.lastMouseY = e.clientY;
      this.lastMouseX = e.clientX;

      document.addEventListener('mousemove', this.handleSelectionDrag);
      document.addEventListener('mouseup', this.handleSelectionEnd);
    };

    // Handle drag during selection
    this.handleSelectionDrag = (e) => {
      if (!this.isSelecting) return;

      this.lastMouseY = e.clientY;
      this.lastMouseX = e.clientX;

      this.updateSelectionVisuals();
    };

    // Update selection visuals (called on drag and after auto-scroll)
    this.updateSelectionAfterScroll = () => {
      if (!this.isSelecting || this.lastMouseY === undefined) return;
      this.updateSelectionVisuals();
    };

    // Perform scroll on the appropriate container
    this.performScroll = (amount) => {
      const contentPage = document.getElementById('content-page');
      if (contentPage && contentPage.scrollHeight > contentPage.clientHeight) {
        const before = contentPage.scrollTop;
        contentPage.scrollTop += amount;
        if (contentPage.scrollTop !== before) return true;
      }

      const contentView = document.getElementById('content-view');
      if (contentView && contentView.scrollHeight > contentView.clientHeight) {
        const before = contentView.scrollTop;
        contentView.scrollTop += amount;
        if (contentView.scrollTop !== before) return true;
      }

      const before = window.scrollY;
      window.scrollBy(0, amount);
      return window.scrollY !== before;
    };

    // Core selection visual update
    this.updateSelectionVisuals = () => {
      // Get current mouse position in document coordinates (for block detection)
      const currentDocY = this.getDocumentY(this.lastMouseY);

      // Calculate range in document coordinates (for block detection)
      const minDocY = Math.min(this.selectionStartDocY, currentDocY);
      const maxDocY = Math.max(this.selectionStartDocY, currentDocY);
      const minX = Math.min(this.selectionStartX, this.lastMouseX);
      const maxX = Math.max(this.selectionStartX, this.lastMouseX);

      // Convert current mouse position to content-page coordinates
      const currentPos = this.viewportToContentPageCoords(this.lastMouseX, this.lastMouseY);

      // Calculate rectangle bounds in content-page coordinates
      const rectMinX = Math.min(this.selectionStartPos.x, currentPos.x);
      const rectMaxX = Math.max(this.selectionStartPos.x, currentPos.x);
      const rectMinY = Math.min(this.selectionStartPos.y, currentPos.y);
      const rectMaxY = Math.max(this.selectionStartPos.y, currentPos.y);

      // Update selection rectangle position and size
      if (this.selectionRect) {
        this.selectionRect.style.left = `${rectMinX}px`;
        this.selectionRect.style.top = `${rectMinY}px`;
        this.selectionRect.style.width = `${rectMaxX - rectMinX}px`;
        this.selectionRect.style.height = `${rectMaxY - rectMinY}px`;
      }

      // Find all blocks in the DOCUMENT Y range (not just visible)
      // This ensures scrolled-out blocks stay selected
      const blocksInRange = this.getBlocksInDocumentRange(minDocY, maxDocY, minX, maxX);

      // Update pending selection - accumulate, don't replace
      // Only clear if we're shrinking the selection
      for (const blockIndex of blocksInRange) {
        this.pendingSelection.add(blockIndex);
      }

      // Remove blocks that are no longer in range
      for (const blockIndex of [...this.pendingSelection]) {
        if (!blocksInRange.includes(blockIndex)) {
          this.pendingSelection.delete(blockIndex);
        }
      }

      this.updatePendingSelectionVisuals();
    };

    // Handle mouseup to commit selection
    this.handleSelectionEnd = (e) => {
      if (!this.isSelecting) return;

      document.removeEventListener('mousemove', this.handleSelectionDrag);
      document.removeEventListener('mouseup', this.handleSelectionEnd);

      this.isSelecting = false;

      // Clear auto-scroll interval
      if (this.autoScrollInterval) {
        clearInterval(this.autoScrollInterval);
        this.autoScrollInterval = null;
      }

      // Remove selecting class
      this.overlay.classList.remove('is-selecting');

      // Hide selection rectangle
      if (this.selectionRect) {
        this.selectionRect.style.display = 'none';
      }

      // Commit selection to state
      if (this.pendingSelection.size > 0) {
        const selectedArray = Array.from(this.pendingSelection).sort((a, b) => a - b);
        this.view.dispatch({
          effects: selectBlocksEffect.of(selectedArray)
        });
      }

      this.pendingSelection.clear();
      this.clearPendingSelectionVisuals();
    };

    // Attach mousedown listener to scroller (capture phase to intercept before CodeMirror)
    this.view.scrollDOM.addEventListener('mousedown', this.handleMarginMouseDown, true);

    // Also attach to content-page to handle margins in the header/title area and bottom
    this.contentPage = document.getElementById('content-page');
    if (this.contentPage) {
      this.handleContentPageMouseDown = (e) => {
        // Check if click is in the margin area of content-page (left, right, or bottom)
        const contentRect = this.view.contentDOM.getBoundingClientRect();
        const pageRect = this.contentPage.getBoundingClientRect();
        const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        const inLeftMargin = x >= pageRect.left && x < contentRect.left;
        const inRightMargin = x > contentRect.right && x <= pageRect.right;
        // Bottom margin: below scroller/content but within content-page
        const inBottomMargin = y > scrollerRect.bottom && y <= pageRect.bottom;

        // Only handle if in margin and not already handled by scroller
        if ((inLeftMargin || inRightMargin || inBottomMargin) && !e.target.closest('.cm-editor')) {
          // Trigger the same margin selection behavior
          this.handleMarginMouseDown(e);
        }
      };
      this.contentPage.addEventListener('mousedown', this.handleContentPageMouseDown, true);
    }
  }

  /**
   * Get block index at a Y coordinate
   */
  getBlockIndexAtY(clientY) {
    if (!this.blocks || this.blocks.length === 0) return -1;

    const contentRect = this.view.contentDOM.getBoundingClientRect();

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const startLine = this.view.state.doc.line(block.startLine);
      const endLine = this.view.state.doc.line(block.endLine);

      const startPos = this.view.lineBlockAt(startLine.from);
      const endPos = this.view.lineBlockAt(endLine.from);

      const blockTop = startPos.top + contentRect.top - this.view.scrollDOM.scrollTop;
      const blockBottom = endPos.top + endPos.height + contentRect.top - this.view.scrollDOM.scrollTop;

      if (clientY >= blockTop && clientY < blockBottom) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Get all block indices whose bounding box overlaps with the selection rectangle
   * Note: All coordinates are in viewport (screen) coordinates
   */
  getBlocksInRect(minX, minY, maxX, maxY) {
    const result = [];
    if (!this.blocks || this.blocks.length === 0) return result;

    const contentRect = this.view.contentDOM.getBoundingClientRect();

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const startLine = this.view.state.doc.line(block.startLine);
      const endLine = this.view.state.doc.line(block.endLine);

      const startPos = this.view.lineBlockAt(startLine.from);
      const endPos = this.view.lineBlockAt(endLine.from);

      // Block's bounding box in viewport coordinates
      // lineBlockAt gives position relative to editor top, contentRect.top is editor's viewport position
      const editorScrollTop = this.view.scrollDOM.scrollTop;
      const blockTop = startPos.top - editorScrollTop + contentRect.top;
      const blockBottom = endPos.top + endPos.height - editorScrollTop + contentRect.top;
      const blockLeft = contentRect.left;
      const blockRight = contentRect.right;

      // Check if selection rectangle overlaps with block's bounding box
      const overlapsY = minY < blockBottom && maxY > blockTop;
      const overlapsX = minX < blockRight && maxX > blockLeft;

      if (overlapsX && overlapsY) {
        result.push(i);
      }
    }

    return result;
  }

  /**
   * Get all block indices whose document Y range overlaps with the given range
   * Uses document coordinates so scrolling doesn't affect results
   */
  getBlocksInDocumentRange(minDocY, maxDocY, minX, maxX) {
    const result = [];
    if (!this.blocks || this.blocks.length === 0) return result;

    const contentRect = this.view.contentDOM.getBoundingClientRect();
    const contentPage = document.getElementById('content-page');
    const scrollTop = contentPage ? contentPage.scrollTop : window.scrollY;

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const startLine = this.view.state.doc.line(block.startLine);
      const endLine = this.view.state.doc.line(block.endLine);

      const startPos = this.view.lineBlockAt(startLine.from);
      const endPos = this.view.lineBlockAt(endLine.from);

      // Convert block positions to document coordinates
      const editorDocTop = contentRect.top + scrollTop;
      const blockDocTop = startPos.top - this.view.scrollDOM.scrollTop + editorDocTop;
      const blockDocBottom = endPos.top + endPos.height - this.view.scrollDOM.scrollTop + editorDocTop;

      // X bounds in viewport (these don't change with scroll)
      const blockLeft = contentRect.left;
      const blockRight = contentRect.right;

      // Check overlap
      const overlapsY = minDocY < blockDocBottom && maxDocY > blockDocTop;
      const overlapsX = minX < blockRight && maxX > blockLeft;

      if (overlapsX && overlapsY) {
        result.push(i);
      }
    }

    return result;
  }

  /**
   * Update visuals during pending selection
   */
  updatePendingSelectionVisuals() {
    // Update handle wrappers
    for (const [blockIndex, wrapper] of this.handleElements) {
      wrapper.classList.toggle('pending-selection', this.pendingSelection.has(blockIndex));
    }

    // Update block lines in the editor
    this.clearPendingBlockHighlights();
    for (const blockIndex of this.pendingSelection) {
      const block = this.blocks[blockIndex];
      if (!block) continue;

      for (let lineNum = block.startLine; lineNum <= block.endLine; lineNum++) {
        const line = this.view.state.doc.line(lineNum);
        const lineDOM = this.view.domAtPos(line.from);
        if (lineDOM && lineDOM.node) {
          let element = lineDOM.node.nodeType === 1 ? lineDOM.node : lineDOM.node.parentElement;
          const lineElement = element?.closest('.cm-line');
          if (lineElement) {
            lineElement.classList.add('cm-block-pending');
          }
        }
      }
    }
  }

  /**
   * Clear pending block highlights from lines
   */
  clearPendingBlockHighlights() {
    const pendingLines = this.view.contentDOM.querySelectorAll('.cm-block-pending');
    pendingLines.forEach(el => el.classList.remove('cm-block-pending'));
  }

  /**
   * Clear pending selection visuals
   */
  clearPendingSelectionVisuals() {
    for (const [blockIndex, wrapper] of this.handleElements) {
      wrapper.classList.remove('pending-selection');
    }
    this.clearPendingBlockHighlights();
  }

  /**
   * Get the block index at the current mouse position
   */
  getBlockIndexAtMousePosition(e) {
    if (!this.blocks || this.blocks.length === 0) {
      return -1;
    }

    // Get mouse Y position relative to the editor content
    const contentRect = this.view.contentDOM.getBoundingClientRect();
    const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
    const mouseY = e.clientY;

    // Check if mouse is within the editor area horizontally (including left margin)
    if (e.clientX < scrollerRect.left || e.clientX > contentRect.right) {
      return -1;
    }

    // Find which block the mouse is over based on line positions
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const startLine = this.view.state.doc.line(block.startLine);
      const endLine = this.view.state.doc.line(block.endLine);

      const startPos = this.view.lineBlockAt(startLine.from);
      const endPos = this.view.lineBlockAt(endLine.from);

      const blockTop = startPos.top + contentRect.top - this.view.scrollDOM.scrollTop;
      const blockBottom = endPos.top + endPos.height + contentRect.top - this.view.scrollDOM.scrollTop;

      if (mouseY >= blockTop && mouseY < blockBottom) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Update hover state on handle elements
   */
  updateHoverState() {
    for (const [blockIndex, wrapper] of this.handleElements) {
      wrapper.classList.toggle('hovered', blockIndex === this.hoveredBlockIndex);
    }
  }

  /**
   * Update blocks from document
   */
  updateBlocks() {
    this.blocks = parseBlocks(this.view.state.doc);
  }

  /**
   * Get visible line range
   */
  getVisibleLines() {
    const { from, to } = this.view.viewport;
    const fromLine = this.view.state.doc.lineAt(from).number;
    const toLine = this.view.state.doc.lineAt(to).number;
    return { fromLine, toLine };
  }

  /**
   * Get the block index where the cursor is located
   * Returns -1 if no valid block found
   */
  getCursorBlockIndex() {
    if (!this.blocks || this.blocks.length === 0) {
      return -1;
    }
    const cursorPos = this.view.state.selection.main.head;
    const cursorLine = this.view.state.doc.lineAt(cursorPos).number;
    return getBlockIndexAtLine(this.blocks, cursorLine);
  }

  /**
   * Render handles for visible blocks
   */
  renderHandles() {
    if (!this.overlay) return;

    const { fromLine, toLine } = this.getVisibleLines();
    const visibleBlocks = getBlocksInViewport(this.blocks, fromLine, toLine);
    const selectedIndices = this.view.state.field(selectedBlockField);
    const cursorBlockIndex = this.getCursorBlockIndex();

    // Track which blocks we've rendered
    const renderedBlocks = new Set();

    for (let i = 0; i < visibleBlocks.length; i++) {
      const block = visibleBlocks[i];
      const blockIndex = this.blocks.indexOf(block);

      if (!shouldShowHandle(block.type)) {
        continue;
      }

      renderedBlocks.add(blockIndex);

      // Get or create handle element
      let wrapper = this.handleElements.get(blockIndex);
      if (!wrapper) {
        wrapper = this.createHandleElement(blockIndex);
        this.handleElements.set(blockIndex, wrapper);
        this.overlay.appendChild(wrapper);
      }

      // Position the handle and update state classes
      const isSelected = blockIndex >= 0 && selectedIndices.includes(blockIndex);
      const hasCursor = blockIndex >= 0 && blockIndex === cursorBlockIndex;
      this.positionHandle(wrapper, block, isSelected, hasCursor);
    }

    // Remove handles for blocks no longer visible
    for (const [blockIndex, element] of this.handleElements) {
      if (!renderedBlocks.has(blockIndex)) {
        element.remove();
        this.handleElements.delete(blockIndex);
      }
    }
  }

  /**
   * Create a handle element for a block
   */
  createHandleElement(blockIndex) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-block-handle-wrapper';
    wrapper.dataset.blockIndex = blockIndex;
    wrapper.style.cssText = `
      position: absolute;
      display: flex;
      align-items: center;
      gap: 2px;
      padding-right: 8px;
      pointer-events: auto;
    `;

    // Add button (shown on hover before handle) - Lucide Plus icon
    const addBtn = document.createElement('button');
    addBtn.className = 'cm-block-add-btn';
    addBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`;
    addBtn.title = 'Add block below';
    addBtn.dataset.action = 'add';
    wrapper.appendChild(addBtn);

    // Drag handle - Lucide GripVertical icon
    const handle = document.createElement('div');
    handle.className = 'cm-block-handle';
    handle.draggable = true;
    handle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="12" r="1"/>
      <circle cx="9" cy="5" r="1"/>
      <circle cx="9" cy="19" r="1"/>
      <circle cx="15" cy="12" r="1"/>
      <circle cx="15" cy="5" r="1"/>
      <circle cx="15" cy="19" r="1"/>
    </svg>`;
    handle.title = 'Drag to move';
    handle.dataset.action = 'drag';
    wrapper.appendChild(handle);

    // Drag events
    handle.addEventListener('dragstart', (e) => {
      // Clear any text selection to prevent dragging selected text
      window.getSelection()?.removeAllRanges();

      // Check if this block is part of a multi-selection
      const selectedIndices = this.view.state.field(selectedBlockField);
      const isPartOfSelection = selectedIndices.includes(blockIndex);

      // Determine which blocks to drag
      const blocksToDrag = isPartOfSelection && selectedIndices.length > 1
        ? selectedIndices
        : [blockIndex];

      e.dataTransfer.setData('text/plain', JSON.stringify(blocksToDrag));
      e.dataTransfer.effectAllowed = 'move';

      // Set a drag image to prevent browser from using text selection
      const dragImage = wrapper.cloneNode(true);
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 12, 12);
      setTimeout(() => dragImage.remove(), 0);

      // Mark all dragged blocks
      for (const idx of blocksToDrag) {
        const handle = this.handleElements.get(idx);
        if (handle) handle.classList.add('dragging');
      }

      // Dispatch custom event for drag manager
      this.view.dom.dispatchEvent(new CustomEvent('block-drag-start', {
        detail: {
          blockIndex,
          blockIndices: blocksToDrag,
          blocks: blocksToDrag.map(i => this.blocks[i])
        }
      }));
    });

    handle.addEventListener('dragend', () => {
      // Remove dragging class from all handles
      for (const [idx, handle] of this.handleElements) {
        handle.classList.remove('dragging');
      }
      this.view.dom.dispatchEvent(new CustomEvent('block-drag-end'));
    });

    return wrapper;
  }

  /**
   * Position a handle element
   */
  positionHandle(wrapper, block, isSelected, hasCursor) {
    // Get the position of the first line of the block
    const line = this.view.state.doc.line(block.startLine);
    const linePos = this.view.lineBlockAt(line.from);

    // Account for scroll position
    const scrollTop = this.view.scrollDOM.scrollTop;
    const editorPadding = parseInt(getComputedStyle(this.view.contentDOM).paddingTop) || 0;

    // Get the computed line-height from the editor for single line height
    const lineHeightStyle = getComputedStyle(this.view.contentDOM).lineHeight;
    const singleLineHeight = parseFloat(lineHeightStyle) || 24;

    // Get the content's actual position within the scroller (accounts for centering)
    const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
    const contentRect = this.view.contentDOM.getBoundingClientRect();
    const contentOffset = contentRect.left - scrollerRect.left;

    // Position at first line, vertically centered with the line
    const verticalOffset = (linePos.height - singleLineHeight) / 2;
    const top = linePos.top - scrollTop + editorPadding + verticalOffset;
    const left = contentOffset;  // Handles go at left edge of content (in the gutter)

    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.height = `${singleLineHeight}px`;

    // Update state classes
    wrapper.classList.toggle('selected', isSelected);
    wrapper.classList.toggle('cursor-block', hasCursor);
  }

  /**
   * Handle mousedown on overlay elements
   */
  handleMouseDown(e) {
    const wrapper = e.target.closest('.cm-block-handle-wrapper');
    if (!wrapper) return;

    const action = e.target.dataset.action;
    if (action === 'drag') {
      // Let drag events handle this
      return;
    }

    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Handle click on overlay elements
   */
  handleClick(e) {
    const wrapper = e.target.closest('.cm-block-handle-wrapper');
    if (!wrapper) return;

    const blockIndex = parseInt(wrapper.dataset.blockIndex, 10);
    const action = e.target.dataset.action;

    e.preventDefault();
    e.stopPropagation();

    if (action === 'add') {
      // Insert new line after this block
      const block = this.blocks[blockIndex];
      if (block) {
        this.view.dispatch({
          changes: { from: block.to, insert: '\n' },
          selection: { anchor: block.to + 1 }
        });
        this.view.focus();
      }
    } else {
      // Select the block
      this.view.dispatch({
        effects: selectBlockEffect.of(blockIndex)
      });
    }
  }

  /**
   * Update on editor changes
   */
  update(update) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.updateBlocks();
      this.renderHandles();
      this.updateOverlayHeight();
      return;
    }

    // Re-render on cursor movement or block selection changes
    if (update.selectionSet || update.transactions.some(tr =>
      tr.effects.some(e => e.is(selectBlockEffect) || e.is(clearBlockSelectionEffect))
    )) {
      this.renderHandles();
    }
  }

  /**
   * Clean up
   */
  destroy() {
    // Remove hover tracking listeners
    if (this.handleMouseMove) {
      this.view.scrollDOM.removeEventListener('mousemove', this.handleMouseMove);
    }
    if (this.handleMouseLeave) {
      this.view.scrollDOM.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    // Remove margin selection listeners
    if (this.handleMarginMouseDown) {
      this.view.scrollDOM.removeEventListener('mousedown', this.handleMarginMouseDown, true);
    }
    if (this.handleContentPageMouseDown && this.contentPage) {
      this.contentPage.removeEventListener('mousedown', this.handleContentPageMouseDown, true);
    }
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
    }
    document.removeEventListener('mousemove', this.handleSelectionDrag);
    document.removeEventListener('mouseup', this.handleSelectionEnd);

    if (this.overlay) {
      this.overlay.remove();
    }
    if (this.selectionRect) {
      this.selectionRect.remove();
    }
    this.handleElements.clear();
  }
});

// ========================================
// Click Handler to Clear Selection
// ========================================

/**
 * Clear block selection when clicking in editor content
 */
const clickToClearSelection = EditorView.domEventHandlers({
  mousedown(event, view) {
    // Don't clear if clicking on a handle
    if (event.target.closest('.cm-block-handle-wrapper')) {
      return false;
    }

    const selectedIndices = view.state.field(selectedBlockField);
    if (selectedIndices.length > 0) {
      view.dispatch({
        effects: clearBlockSelectionEffect.of(null)
      });
    }
    return false;
  }
});

// ========================================
// Keyboard Handler for Block Selection
// ========================================

/**
 * Handle keyboard events for selected blocks (delete with Backspace/Delete)
 */
const blockSelectionKeyHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    // Only handle Backspace or Delete
    if (event.key !== 'Backspace' && event.key !== 'Delete') {
      return false;
    }

    const selectedIndices = view.state.field(selectedBlockField);
    if (selectedIndices.length === 0) {
      return false;
    }

    // Prevent default behavior
    event.preventDefault();

    const blocks = parseBlocks(view.state.doc);

    // Sort indices in reverse order to delete from end first (preserves positions)
    const sortedIndices = [...selectedIndices].sort((a, b) => b - a);

    // Build changes to delete all selected blocks
    const changes = [];
    for (const idx of sortedIndices) {
      const block = blocks[idx];
      if (!block) continue;

      // Include newline after block if it exists
      let deleteEnd = block.to;
      if (deleteEnd < view.state.doc.length) {
        const nextChar = view.state.doc.sliceString(deleteEnd, deleteEnd + 1);
        if (nextChar === '\n') {
          deleteEnd++;
        }
      }

      changes.push({ from: block.from, to: deleteEnd });
    }

    // Apply all deletions and clear selection
    if (changes.length > 0) {
      view.dispatch({
        changes,
        effects: clearBlockSelectionEffect.of(null)
      });
    }

    return true;
  }
});

// ========================================
// Styles
// ========================================

/**
 * Base styles for block overlay
 */
const blockOverlayStyles = EditorView.baseTheme({
  // Handle wrapper - hidden by default, only visible on hover or when selected
  '& .cm-block-handle-wrapper': {
    opacity: '0',
    transition: 'opacity 0.15s ease'
  },

  // Show handles when block is hovered (entire block area)
  '& .cm-block-handle-wrapper.hovered': {
    opacity: '1'
  },

  // Hide all handles during drag selection
  '& .cm-block-overlay.is-selecting .cm-block-handle-wrapper': {
    opacity: '0 !important'
  },

  // Keep selected block's handle visible
  '& .cm-block-handle-wrapper.selected': {
    opacity: '1'
  },

  // Show handles during pending selection (drag selection)
  '& .cm-block-handle-wrapper.pending-selection': {
    opacity: '1'
  },

  // Selected block highlight
  '& .cm-block-selected': {
    backgroundColor: 'rgba(59, 130, 246, 0.12)'
  },

  // Pending selection highlight (during drag)
  '& .cm-block-pending': {
    backgroundColor: 'rgba(59, 130, 246, 0.12)'
  },

  // Add button
  '& .cm-block-add-btn': {
    width: '24px',
    height: '24px',
    padding: '2px',
    margin: '0',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: '0',
    transition: 'opacity 0.15s ease, background-color 0.15s ease'
  },

  '& .cm-block-add-btn svg': {
    width: '18px',
    height: '18px',
    pointerEvents: 'none'
  },

  '& .cm-block-handle-wrapper.hovered .cm-block-add-btn': {
    opacity: '1'
  },

  '& .cm-block-add-btn:hover': {
    backgroundColor: 'var(--bg-hover)'
  },

  // Drag handle
  '& .cm-block-handle': {
    width: '24px',
    height: '24px',
    padding: '2px',
    margin: '0',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--text-dim)',
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.15s ease',
    userSelect: 'none',
    WebkitUserSelect: 'none'
  },

  '& .cm-block-handle svg': {
    width: '18px',
    height: '18px',
    pointerEvents: 'none'
  },

  '& .cm-block-handle:hover': {
    backgroundColor: 'var(--bg-hover)'
  },

  '& .cm-block-handle:active': {
    cursor: 'grabbing'
  },

  // Dragging state
  '& .cm-block-handle-wrapper.dragging': {
    opacity: '0.5'
  }
});

// ========================================
// Combined Extension
// ========================================

/**
 * Complete block overlay extension
 */
export const blockOverlayExtension = [
  selectedBlockField,
  selectionDecorationPlugin,
  blockHandlesPlugin,
  clickToClearSelection,
  blockSelectionKeyHandler,
  blockOverlayStyles
];

// ========================================
// Exports
// ========================================

export {
  parseBlocks,
  getBlockAtLine,
  getBlockIndexAtLine,
  BlockType
};

export default blockOverlayExtension;
