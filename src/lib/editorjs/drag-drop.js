/**
 * Editor.js Drag & Drop Plugin
 * Enables block reordering via mouse events (not HTML drag API)
 *
 * Click settings button = open block settings
 * Drag settings button = reorder blocks
 */

const CSS = `
/* Override native Editor.js drop indicator (arrow + dotted line) with simple white line */
.ce-block--drop-target .ce-block__content::before {
  content: "" !important;
  position: absolute !important;
  top: 100% !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  height: 2px !important;
  margin: 0 !important;
  background: #fff !important;
  border: none !important;
  transform: none !important;
  pointer-events: none !important;
}

/* Show indicator ABOVE the first block when dropping at index 0 */
.ce-block--drop-target-top .ce-block__content::before {
  content: "" !important;
  position: absolute !important;
  top: -2px !important;
  bottom: auto !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  height: 2px !important;
  margin: 0 !important;
  background: #fff !important;
  border: none !important;
  transform: none !important;
  pointer-events: none !important;
}

.ce-block--drop-target .ce-block__content::after,
.ce-block--drop-target-top .ce-block__content::after {
  display: none !important;
}

/* Block being dragged - keep original appearance */

/* Drag clone that follows cursor - text only, no background */
.ce-drag-clone {
  position: fixed;
  pointer-events: none;
  z-index: 10000;
  opacity: 0.5;
  background: transparent;
}

.ce-drag-clone .ce-block__content {
  margin-left: 0 !important;
  padding-left: 0 !important;
  max-width: none !important;
}

/* During drag - prevent text selection */
body.ce-dragging {
  cursor: grabbing !important;
  user-select: none !important;
}

body.ce-dragging * {
  cursor: grabbing !important;
}

/* Make settings button look draggable */
.ce-toolbar__settings-btn {
  cursor: grab;
}

.ce-toolbar__settings-btn:active {
  cursor: grabbing;
}
`;

function injectStyles() {
  if (document.getElementById('editorjs-drag-drop-styles')) return;
  const style = document.createElement('style');
  style.id = 'editorjs-drag-drop-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

class DragDrop {
  constructor({ configuration, blocks, toolbar, save }, borderStyle) {
    this.toolbar = toolbar;
    this.api = blocks;
    this.holder = typeof configuration.holder === 'string'
      ? document.getElementById(configuration.holder)
      : configuration.holder;
    this.readOnly = configuration.readOnly;
    this.save = save;

    // Drag state
    this.isDragging = false;
    this.draggedBlock = null;
    this.draggedIndex = null;
    this.clone = null;
    this.targetIndex = null;
    this.targetPosition = null; // 'above' or 'below'

    // Click vs drag detection
    this.mouseDownPos = null;
    this.dragThreshold = 5;

    // Bind handlers
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    injectStyles();

    if (!this.readOnly) {
      this.setupSettingsButton();
    }
  }

  static get isReadOnlySupported() {
    return true;
  }

  setupSettingsButton() {
    const trySetup = () => {
      const btn = this.holder.querySelector('.ce-toolbar__settings-btn');
      if (btn) {
        // Disable HTML drag API
        btn.removeAttribute('draggable');
        btn.setAttribute('draggable', 'false');

        // Block any HTML drag events
        btn.addEventListener('dragstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }, true);

        // Use mouse events instead
        btn.addEventListener('mousedown', (e) => this.onMouseDown(e), true);
      } else {
        // Wait for toolbar
        const observer = new MutationObserver((mutations, obs) => {
          const settingsBtn = this.holder.querySelector('.ce-toolbar__settings-btn');
          if (settingsBtn) {
            obs.disconnect();
            this.setupSettingsButton();
          }
        });
        observer.observe(this.holder, { childList: true, subtree: true });
      }
    };
    trySetup();
  }

  getCurrentBlock() {
    const index = this.api.getCurrentBlockIndex();
    if (index >= 0) {
      const blocks = this.holder.querySelectorAll('.ce-block');
      return { block: blocks[index], index };
    }
    return { block: null, index: -1 };
  }

  onMouseDown(e) {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const { block, index } = this.getCurrentBlock();
    if (!block || index < 0) return;

    this.mouseDownPos = { x: e.clientX, y: e.clientY };
    this.pendingBlock = block;
    this.pendingIndex = index;

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onMouseMove(e) {
    if (!this.mouseDownPos) return;

    // Check if we should start dragging
    if (!this.isDragging) {
      const dx = e.clientX - this.mouseDownPos.x;
      const dy = e.clientY - this.mouseDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.dragThreshold) {
        this.startDrag(e);
      }
      return;
    }

    // Update clone position
    if (this.clone) {
      this.clone.style.left = `${e.clientX + 16}px`;
      this.clone.style.top = `${e.clientY - 12}px`;
    }

    // Find drop target
    this.updateDropTarget(e.clientY);
  }

  onMouseUp(e) {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);

    if (this.isDragging) {
      this.completeDrag();
    } else if (this.mouseDownPos) {
      // It was a click - open settings
      this.toolbar.toggleBlockSettings(true);
    }

    this.mouseDownPos = null;
    this.pendingBlock = null;
    this.pendingIndex = null;
  }

  startDrag(e) {
    this.isDragging = true;
    this.draggedBlock = this.pendingBlock;
    this.draggedIndex = this.pendingIndex;

    // Close toolbar
    this.toolbar.close();

    // Prevent text selection
    document.body.classList.add('ce-dragging');

    // Create clone
    this.createClone(this.draggedBlock, e.clientX, e.clientY);
  }

  createClone(block, x, y) {
    this.clone = document.createElement('div');
    this.clone.className = 'ce-drag-clone';
    this.clone.style.left = `${x + 16}px`;
    this.clone.style.top = `${y - 12}px`;

    const content = block.querySelector('.ce-block__content');
    if (content) {
      // Get exact width of the content
      const contentWidth = content.getBoundingClientRect().width;

      const contentClone = content.cloneNode(true);
      // Reset padding/margin from editor styles
      contentClone.style.padding = '0';
      contentClone.style.margin = '0';
      contentClone.style.paddingLeft = '0';
      contentClone.style.marginLeft = '0';
      contentClone.style.width = `${contentWidth}px`;
      this.clone.appendChild(contentClone);
    }

    document.body.appendChild(this.clone);
  }

  updateDropTarget(mouseY) {
    const blocks = Array.from(this.holder.querySelectorAll('.ce-block'));

    // Clear previous targets
    blocks.forEach(b => {
      b.classList.remove('ce-block--drop-target', 'ce-block--drop-target-top');
    });

    // Check if above all blocks (targeting position 0)
    if (blocks.length > 0) {
      const firstBlock = blocks[0];
      const firstRect = firstBlock.getBoundingClientRect();

      // If cursor is above the first block or in top portion of first block
      if (mouseY < firstRect.top + firstRect.height / 2) {
        // Skip if dragging the first block itself
        if (this.draggedIndex === 0) {
          this.targetIndex = null;
          return;
        }

        // Show indicator at TOP of first block
        firstBlock.classList.add('ce-block--drop-target-top');
        this.targetIndex = 0;
        this.targetPosition = 'above';
        return;
      }
    }

    // Find target block for other positions
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const rect = block.getBoundingClientRect();

      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        // Skip if it's the dragged block
        if (i === this.draggedIndex) {
          this.targetIndex = null;
          return;
        }

        const midY = rect.top + rect.height / 2;

        if (mouseY < midY && i > 0) {
          // Above this block (but not the first) - show indicator on previous block
          blocks[i - 1].classList.add('ce-block--drop-target');
          this.targetIndex = i;
          this.targetPosition = 'above';
        } else {
          // Below this block
          block.classList.add('ce-block--drop-target');
          this.targetIndex = i;
          this.targetPosition = 'below';
        }
        return;
      }
    }

    // Check if below all blocks
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      const lastRect = lastBlock.getBoundingClientRect();
      if (mouseY > lastRect.bottom) {
        lastBlock.classList.add('ce-block--drop-target');
        this.targetIndex = blocks.length - 1;
        this.targetPosition = 'below';
      }
    }
  }

  completeDrag() {
    // Clear visual state
    document.body.classList.remove('ce-dragging');

    if (this.clone) {
      this.clone.remove();
      this.clone = null;
    }

    // Clear drop targets
    const blocks = this.holder.querySelectorAll('.ce-block');
    blocks.forEach(b => {
      b.classList.remove('ce-block--drop-target', 'ce-block--drop-target-top');
    });

    // Perform the move
    if (this.targetIndex !== null && this.draggedIndex !== null) {
      let toIndex = this.targetIndex;

      // Adjust index based on position
      if (this.targetPosition === 'below') {
        toIndex = this.targetIndex + 1;
      }

      // Adjust if moving down (account for removal)
      if (toIndex > this.draggedIndex) {
        toIndex--;
      }

      if (toIndex !== this.draggedIndex) {
        this.api.move(toIndex, this.draggedIndex);
      }
    }

    // Reset state
    this.isDragging = false;
    this.draggedBlock = null;
    this.draggedIndex = null;
    this.targetIndex = null;
    this.targetPosition = null;
  }
}

export default DragDrop;
