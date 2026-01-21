/**
 * Inline Edit Utility
 *
 * Notion-style inline editing: elements are always editable,
 * changes are saved silently on blur, no complex state management.
 */

/**
 * Setup inline editing on a contenteditable element
 * @param {HTMLElement} element - The contenteditable element
 * @param {Object} options - Configuration options
 * @param {Function} options.onSave - Called with new value when content changes
 * @param {Function} options.onEmpty - Called when content is cleared (optional, for delete behavior)
 * @param {string} options.placeholder - Placeholder text (set via data-placeholder attribute)
 * @param {boolean} options.allowEmpty - If true, allows saving empty values (default: false)
 * @param {boolean} options.restoreOnEmpty - If true, restores original value when empty (default: true)
 */
export function setupInlineEdit(element, options = {}) {
  const {
    onSave = () => {},
    onEmpty = null,
    placeholder = '',
    allowEmpty = false,
    restoreOnEmpty = true
  } = options;

  let originalValue = '';

  // Set placeholder if provided
  if (placeholder) {
    element.dataset.placeholder = placeholder;
  }

  // Ensure element is contenteditable
  if (element.getAttribute('contenteditable') !== 'true') {
    element.setAttribute('contenteditable', 'true');
  }

  // Focus: remember original value
  const handleFocus = () => {
    originalValue = element.textContent || '';
  };

  // Blur: check for changes and save
  const handleBlur = () => {
    const newValue = (element.textContent || '').trim();

    if (newValue === originalValue.trim()) {
      // No change - do nothing
      return;
    }

    if (!newValue) {
      // Empty value
      if (onEmpty) {
        onEmpty();
      } else if (restoreOnEmpty && !allowEmpty) {
        // Restore original value
        element.textContent = originalValue;
      } else if (allowEmpty) {
        onSave('');
      }
      return;
    }

    // Value changed - save silently
    onSave(newValue);
  };

  // Handle Enter key (commit) and Escape (cancel)
  const handleKeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      element.blur();
    } else if (e.key === 'Escape') {
      // Restore original and blur
      element.textContent = originalValue;
      element.blur();
    }
  };

  // Attach listeners
  element.addEventListener('focus', handleFocus);
  element.addEventListener('blur', handleBlur);
  element.addEventListener('keydown', handleKeydown);

  // Return cleanup function
  return () => {
    element.removeEventListener('focus', handleFocus);
    element.removeEventListener('blur', handleBlur);
    element.removeEventListener('keydown', handleKeydown);
  };
}

/**
 * Setup inline editing for a list of items (priorities, steps, etc.)
 * Handles the common pattern of editing items in an array.
 *
 * @param {HTMLElement} element - The contenteditable element
 * @param {Object} options - Configuration options
 * @param {Function} options.getItem - Returns the data item being edited
 * @param {string} options.field - Field name to update (default: 'name')
 * @param {Function} options.saveData - Called to persist changes
 * @param {Function} options.onDelete - Called when item should be deleted (empty value)
 */
export function setupListItemEdit(element, options = {}) {
  const {
    getItem,
    field = 'name',
    saveData = () => {},
    onDelete = null
  } = options;

  return setupInlineEdit(element, {
    onSave: (newValue) => {
      const item = getItem();
      if (item && newValue !== item[field]) {
        item[field] = newValue;
        saveData();
      }
    },
    onEmpty: onDelete,
    restoreOnEmpty: !onDelete, // Restore if no delete handler
    allowEmpty: false
  });
}

/**
 * Create a contenteditable element with inline editing already set up
 *
 * @param {string} tagName - HTML tag name (default: 'span')
 * @param {Object} options - Options passed to setupInlineEdit plus:
 * @param {string} options.className - CSS class name
 * @param {string} options.content - Initial text content
 * @returns {{ element: HTMLElement, cleanup: Function }}
 */
export function createEditableElement(tagName = 'span', options = {}) {
  const { className = '', content = '', ...editOptions } = options;

  const element = document.createElement(tagName);
  element.setAttribute('contenteditable', 'true');
  element.setAttribute('spellcheck', 'true');

  if (className) {
    element.className = className;
  }

  if (content) {
    element.textContent = content;
  }

  const cleanup = setupInlineEdit(element, editOptions);

  return { element, cleanup };
}

export default {
  setupInlineEdit,
  setupListItemEdit,
  createEditableElement
};
