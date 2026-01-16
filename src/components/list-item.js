/**
 * List Item Component Module
 *
 * Creates consistent list items with icon/content/meta columns.
 * Used for objectives, priorities, and steps.
 */

/**
 * Create a modular list item element
 * @param {Object} options
 * @param {string} options.icon - Icon/prefix content (number, dash, timestamp)
 * @param {string} options.iconClass - Additional classes for icon column
 * @param {string} options.content - Main text content
 * @param {boolean} options.contentEditable - Make content editable
 * @param {string} options.meta - Right column content (clarity badge, edit btn)
 * @param {string} options.metaClass - Additional classes for meta column
 * @param {boolean} options.selected - Is item selected
 * @param {Function} options.onClick - Click handler
 * @param {Object} options.dataAttrs - Data attributes for the item
 * @returns {HTMLElement}
 */
export function createListItem(options = {}) {
  const {
    icon = '',
    iconClass = '',
    content = '',
    contentEditable = false,
    meta = '',
    metaClass = '',
    selected = false,
    onClick = null,
    dataAttrs = {}
  } = options;

  const div = document.createElement('div');
  div.className = 'list-item' + (selected ? ' selected' : '');

  // Set data attributes
  for (const [key, value] of Object.entries(dataAttrs)) {
    div.dataset[key] = value;
  }

  // Build inner HTML with three columns
  let html = '';

  // Icon column (always present for alignment, can be empty)
  const iconClasses = ['list-item-icon', iconClass].filter(Boolean).join(' ');
  html += `<span class="${iconClasses}">${icon}</span>`;

  // Content column
  const contentAttrs = contentEditable ? ' contenteditable="true" spellcheck="false"' : '';
  const escapedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html += `<span class="list-item-content"${contentAttrs}>${escapedContent}</span>`;

  // Meta column (optional)
  if (meta) {
    const metaClasses = ['list-item-meta', metaClass].filter(Boolean).join(' ');
    html += `<span class="${metaClasses}">${meta}</span>`;
  }

  div.innerHTML = html;

  // Attach click handler
  if (onClick) {
    div.onclick = onClick;
  }

  return div;
}

/**
 * Get meta HTML for list items (edit button)
 */
export function getEditMeta(section = 'objectives', index = 0) {
  return `<span class="edit-btn" data-section="${section}" data-index="${index}">edit</span>`;
}

/**
 * Create an "Add" button item
 */
export function createAddButton(text, onClick, disabled = false) {
  const div = document.createElement('div');
  div.className = 'add-option' + (disabled ? ' disabled' : '');
  div.innerHTML = disabled ? `(${text})` : `+ ${text}`;
  if (!disabled && onClick) {
    div.onclick = onClick;
  }
  return div;
}

export default {
  createListItem,
  getEditMeta,
  createAddButton
};
