/**
 * Context Menu Component
 *
 * Simple right-click context menu for side list items.
 */

let menuElement = null;

/**
 * Show a context menu at the specified position
 * @param {Object} options - Menu options
 * @param {number} options.x - X position (clientX)
 * @param {number} options.y - Y position (clientY)
 * @param {Array} options.items - Menu items [{ label, danger, action }]
 */
export function showContextMenu({ x, y, items }) {
  // Remove any existing menu
  hideContextMenu();

  // Create menu element
  menuElement = document.createElement('div');
  menuElement.className = 'context-menu';

  // Add menu items
  items.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    menuItem.textContent = item.label;
    menuItem.onclick = (e) => {
      e.stopPropagation();
      hideContextMenu();
      if (item.action) item.action();
    };
    menuElement.appendChild(menuItem);
  });

  // Position the menu
  menuElement.style.left = `${x}px`;
  menuElement.style.top = `${y}px`;

  // Add to DOM
  document.body.appendChild(menuElement);

  // Adjust position if menu goes off screen
  const rect = menuElement.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menuElement.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menuElement.style.top = `${y - rect.height}px`;
  }

  // Close menu on click outside or escape
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('contextmenu', handleClickOutside);
  }, 0);
}

/**
 * Hide the context menu
 */
export function hideContextMenu() {
  if (menuElement) {
    menuElement.remove();
    menuElement = null;
  }
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleEscape);
  document.removeEventListener('contextmenu', handleClickOutside);
}

function handleClickOutside(e) {
  if (menuElement && !menuElement.contains(e.target)) {
    hideContextMenu();
  }
}

function handleEscape(e) {
  if (e.key === 'Escape') {
    hideContextMenu();
  }
}

export default {
  showContextMenu,
  hideContextMenu
};
