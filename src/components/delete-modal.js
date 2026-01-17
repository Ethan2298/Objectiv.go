/**
 * Delete Modal Component
 *
 * Confirmation modal that requires typing "DELETE" to confirm deletion.
 */

let modalElement = null;
let onConfirmCallback = null;

/**
 * Show the delete confirmation modal
 * @param {Object} options - Modal options
 * @param {string} options.itemName - Name of item being deleted
 * @param {string} options.itemType - Type of item (objective, folder)
 * @param {Function} options.onConfirm - Callback when deletion is confirmed
 */
export function showDeleteModal({ itemName, itemType, onConfirm }) {
  // Remove any existing modal
  hideDeleteModal();

  onConfirmCallback = onConfirm;

  // Create modal overlay
  modalElement = document.createElement('div');
  modalElement.className = 'delete-modal-overlay';

  // Create modal content
  const modal = document.createElement('div');
  modal.className = 'delete-modal';

  modal.innerHTML = `
    <div class="delete-modal-header">Delete ${itemType}</div>
    <div class="delete-modal-body">
      <p>Are you sure you want to delete <strong>${escapeHtml(itemName)}</strong>?</p>
      <p class="delete-modal-warning">This action cannot be undone.</p>
      <label class="delete-modal-label">Type <strong>DELETE</strong> to confirm:</label>
      <input type="text" class="delete-modal-input" placeholder="DELETE" autocomplete="off" spellcheck="false" />
    </div>
    <div class="delete-modal-actions">
      <button class="delete-modal-cancel">Cancel</button>
      <button class="delete-modal-confirm" disabled>Delete</button>
    </div>
  `;

  modalElement.appendChild(modal);
  document.body.appendChild(modalElement);

  // Get references
  const input = modal.querySelector('.delete-modal-input');
  const confirmBtn = modal.querySelector('.delete-modal-confirm');
  const cancelBtn = modal.querySelector('.delete-modal-cancel');

  // Enable/disable confirm button based on input
  input.addEventListener('input', () => {
    const isValid = input.value.trim().toUpperCase() === 'DELETE';
    confirmBtn.disabled = !isValid;
  });

  // Handle confirm
  confirmBtn.addEventListener('click', () => {
    if (input.value.trim().toUpperCase() === 'DELETE') {
      const callback = onConfirmCallback; // Save before hiding clears it
      hideDeleteModal();
      if (callback) callback();
    }
  });

  // Handle cancel
  cancelBtn.addEventListener('click', hideDeleteModal);

  // Handle overlay click
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      hideDeleteModal();
    }
  });

  // Handle escape key
  document.addEventListener('keydown', handleEscape);

  // Handle enter key to confirm
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim().toUpperCase() === 'DELETE') {
      const callback = onConfirmCallback; // Save before hiding clears it
      hideDeleteModal();
      if (callback) callback();
    }
  });

  // Focus input
  setTimeout(() => input.focus(), 0);
}

/**
 * Hide the delete modal
 */
export function hideDeleteModal() {
  if (modalElement) {
    modalElement.remove();
    modalElement = null;
  }
  onConfirmCallback = null;
  document.removeEventListener('keydown', handleEscape);
}

function handleEscape(e) {
  if (e.key === 'Escape') {
    hideDeleteModal();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export default {
  showDeleteModal,
  hideDeleteModal
};
