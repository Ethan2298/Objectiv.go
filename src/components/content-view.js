/**
 * Content View Component
 *
 * Renders the main content area (objective details, folder view).
 * Uses persistent containers per tab for browser-like behavior.
 */

import AppState from '../state/app-state.js';
import * as TabState from '../state/tab-state.js';
import * as TabContentManager from '../state/tab-content-manager.js';
import { formatTimestamp, formatDuration } from '../utils.js';
import { renderContentNextStep } from './next-step-timer.js';
import GlobalNav from './global-nav.js';
import { setupInlineEdit } from '../utils/inline-edit.js';

// ========================================
// Callbacks (set by app.js)
// ========================================

let _startAddPriority = () => {};
let _startLogStep = () => {};
let _refreshClarity = () => {};
let _renderSideList = () => {};

export function setCallbacks({ startAddPriority, startLogStep, refreshClarity, renderSideList }) {
  if (startAddPriority) _startAddPriority = startAddPriority;
  if (startLogStep) _startLogStep = startLogStep;
  if (refreshClarity) _refreshClarity = refreshClarity;
  if (renderSideList) _renderSideList = renderSideList;
}

// ========================================
// List Item Helper
// ========================================

/**
 * Create a modular list item element
 * Content is always contenteditable - Notion-style inline editing.
 */
function createListItem(options = {}) {
  const {
    icon = '',
    iconClass = '',
    content = '',
    contentEditable = true, // Always editable by default
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

  // Icon column
  const iconClasses = ['list-item-icon', iconClass].filter(Boolean).join(' ');
  html += `<span class="${iconClasses}">${icon}</span>`;

  // Content column - always contenteditable with spellcheck
  const escapedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const editableAttr = contentEditable ? 'contenteditable="true" spellcheck="true"' : '';
  html += `<span class="list-item-content" ${editableAttr}>${escapedContent}</span>`;

  // Meta column
  if (meta) {
    const metaClasses = ['list-item-meta', metaClass].filter(Boolean).join(' ');
    html += `<span class="${metaClasses}">${meta}</span>`;
  }

  div.innerHTML = html;

  if (onClick) {
    div.onclick = onClick;
  }

  return div;
}

/**
 * Create confirm row HTML
 */
function createConfirmRow(text) {
  return `
    <div class="confirm-row">
      <div class="confirm-text">${text}</div>
      <div class="confirm-hint">[y] Yes  [n] No  [Esc] Cancel</div>
    </div>
  `;
}

// ========================================
// Main Render Functions
// ========================================

/**
 * Render the content view (selected objective, folder, or home)
 * Uses persistent containers per tab for browser-like behavior.
 * @param {Object} options - Options for rendering
 * @param {boolean} options.force - Force re-render even if actively editing
 */
export function renderContentView(options = {}) {
  const { force = false } = options;

  // Skip re-render if user is actively editing (unless forced)
  if (!force && AppState.isActivelyEditing()) {
    const activeTabId = TabState.getActiveTabId();
    TabContentManager.showContainer(activeTabId);
    return;
  }

  const activeTabId = TabState.getActiveTabId();
  // Get view mode from TabState (per-tab) not AppState (global)
  // This ensures switching tabs restores the correct view
  const viewMode = TabState.getViewMode() || AppState.getViewMode();

  // Sync AppState with tab's view mode (keeps them in sync)
  if (viewMode && viewMode !== AppState.getViewMode()) {
    AppState.setViewMode(viewMode);
  }

  // Hide all containers first
  TabContentManager.hideAllContainers();

  // Get or create this tab's container
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  const existingMode = TabContentManager.getContainerViewMode(activeTabId);

  // For web view, only re-render if:
  // 1. Container is empty/new (no existing mode)
  // 2. View mode changed (e.g., from home to web)
  // For other views, always re-render (they update based on selection)
  const shouldReRender = viewMode !== 'web' || existingMode !== viewMode;

  // Handle web-mode CSS class and header (needed even when not re-rendering)
  const contentPage = document.getElementById('content-page');
  const app = document.getElementById('app');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');

  if (viewMode === 'web') {
    contentPage?.classList.add('web-mode');
    app?.classList.add('web-mode');
    // Update header for web view (even if not re-rendering)
    if (headerTitle) headerTitle.textContent = 'Web';
    if (headerDesc) headerDesc.textContent = '';
  } else {
    contentPage?.classList.remove('web-mode');
    app?.classList.remove('web-mode');
  }

  if (shouldReRender) {
    TabContentManager.setContainerViewMode(activeTabId, viewMode);

    if (viewMode === 'home') {
      renderHomeViewInContainer(container);
    } else if (viewMode === 'web') {
      renderWebViewInContainer(container);
    } else if (viewMode === 'folder') {
      renderFolderViewInContainer(container);
    } else if (viewMode === 'settings') {
      renderSettingsViewInContainer(container);
    } else if (viewMode === 'note') {
      renderNoteViewInContainer(container);
    } else {
      renderObjectiveViewInContainer(container);
    }
  }

  // Show this tab's container
  TabContentManager.showContainer(activeTabId);

  // Update nav bar to reflect current selection
  GlobalNav.updateFromSelection();
}

/**
 * Render home view into a container
 * @param {HTMLElement} container - The container to render into
 */
function renderHomeViewInContainer(container) {
  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  headerTitle.textContent = 'Home';
  headerTitle.setAttribute('contenteditable', 'false');
  if (headerDesc) {
    headerDesc.textContent = 'Welcome to Objectiv';
    headerDesc.setAttribute('contenteditable', 'false');
  }

  const data = AppState.getData();
  const objectiveCount = data.objectives.length;
  const folderCount = data.folders.length;

  container.innerHTML = `
    <div class="home-view">
      <div class="home-stats">
        <div class="home-stat">
          <span class="home-stat-value">${objectiveCount}</span>
          <span class="home-stat-label">Objective${objectiveCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="home-stat">
          <span class="home-stat-value">${folderCount}</span>
          <span class="home-stat-label">Folder${folderCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render home view (backward compatibility wrapper)
 */
export function renderHomeView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderHomeViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'home');
}

/**
 * Render web view with embedded browser into a container
 * @param {HTMLElement} container - The container to render into
 */
function renderWebViewInContainer(container) {
  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Apply web-mode for full-screen browser
  if (contentPage) {
    contentPage.classList.add('web-mode');
  }

  // Add web-mode class to app for global nav button visibility
  if (app) {
    app.classList.add('web-mode');
  }

  headerTitle.textContent = 'Web';
  headerTitle.setAttribute('contenteditable', 'false');
  if (headerDesc) {
    headerDesc.textContent = '';
    headerDesc.setAttribute('contenteditable', 'false');
  }

  // IMPORTANT: Capture the tab ID at creation time
  // This ensures webview events update THIS tab, not whatever tab is active when the event fires
  const ownerTabId = TabState.getActiveTabId();

  container.innerHTML = `
    <div class="web-view">
      <webview class="web-browser-frame" src="about:blank" allowpopups></webview>
    </div>
  `;

  const webview = container.querySelector('.web-browser-frame');
  const GlobalNav = window.Objectiv?.GlobalNav;

  // Helper to update the OWNER tab from webview state (not the active tab)
  const updateOwnerTab = () => {
    const Tabs = window.Objectiv?.Tabs;
    if (!Tabs) return;

    // Update title for the tab that owns this webview
    try {
      const title = webview.getTitle?.();
      if (title && title !== 'about:blank') {
        Tabs.updateTabTitleById(ownerTabId, title);
      }
    } catch (e) { /* ignore */ }
  };

  // Check if this webview's tab is currently active
  const isOwnerTabActive = () => {
    return TabState.getActiveTabId() === ownerTabId;
  };

  // Update global nav bar when navigation occurs (only if this tab is active)
  webview.addEventListener('did-navigate', (e) => {
    if (isOwnerTabActive()) {
      GlobalNav?.setUrl?.(e.url);
    }
    updateOwnerTab();
  });

  webview.addEventListener('did-navigate-in-page', (e) => {
    if (e.isMainFrame) {
      if (isOwnerTabActive()) {
        GlobalNav?.setUrl?.(e.url);
      }
      updateOwnerTab();
    }
  });

  // Update tab title when page title changes
  webview.addEventListener('page-title-updated', (e) => {
    const Tabs = window.Objectiv?.Tabs;
    const title = e.title;
    if (title) {
      if (Tabs) {
        // Update the OWNER tab, not the active tab
        Tabs.updateTabTitleById(ownerTabId, title);
      }
      // Only update GlobalNav if this tab is active
      if (isOwnerTabActive()) {
        GlobalNav?.setPageTitle?.(title);
      }
    }
  });

  // Update tab icon and nav icon when favicon changes
  webview.addEventListener('page-favicon-updated', (e) => {
    const Tabs = window.Objectiv?.Tabs;
    const favicons = e.favicons || [];
    if (favicons.length > 0) {
      if (Tabs) {
        // Update the OWNER tab's icon, not the active tab
        Tabs.updateTabIconById(ownerTabId, favicons[0]);
      }
      // Only update GlobalNav if this tab is active
      if (isOwnerTabActive()) {
        GlobalNav?.setIcon?.(favicons[0]);
        GlobalNav?.setFavicon?.(favicons[0]);
      }
    }
  });

  // Update title after page loads (most reliable fallback)
  webview.addEventListener('did-finish-load', () => {
    updateOwnerTab();
  });

  // Also try after DOM is ready
  webview.addEventListener('dom-ready', () => {
    updateOwnerTab();
  });

  // Show audio indicator when media starts playing
  webview.addEventListener('media-started-playing', () => {
    const Tabs = window.Objectiv?.Tabs;
    if (Tabs) {
      Tabs.showAudioIndicator(ownerTabId);
    }
  });

  // Hide audio indicator when media pauses/stops
  webview.addEventListener('media-paused', () => {
    const Tabs = window.Objectiv?.Tabs;
    if (Tabs) {
      Tabs.hideAudioIndicator(ownerTabId);
    }
  });

  // Note: New window/tab handling (target="_blank" links) is done in main.js
  // via setWindowOpenHandler on the webview's webContents
}

/**
 * Render web view (backward compatibility wrapper)
 */
export function renderWebView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderWebViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'web');
}

/**
 * Render objective view into a container
 * @param {HTMLElement} container - The container to render into
 */
function renderObjectiveViewInContainer(container) {
  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  const data = AppState.getData();
  let selectedIdx = AppState.getSelectedObjectiveIndex();

  if (data.objectives.length === 0) {
    headerTitle.textContent = 'No objectives yet';
    headerTitle.setAttribute('contenteditable', 'false');
    if (headerDesc) {
      headerDesc.textContent = 'Add your first objective to get started';
      headerDesc.setAttribute('contenteditable', 'false');
    }
    container.innerHTML = '';
    return;
  }

  // Clamp index to valid range
  if (selectedIdx < 0) {
    selectedIdx = 0;
    AppState.setSelectedObjectiveIndex(0);
  }
  if (selectedIdx >= data.objectives.length) {
    selectedIdx = data.objectives.length - 1;
    AppState.setSelectedObjectiveIndex(selectedIdx);
  }

  const obj = data.objectives[selectedIdx];
  headerTitle.textContent = obj.name;
  headerTitle.setAttribute('contenteditable', 'true');

  if (headerDesc) {
    headerDesc.textContent = obj.description || '';
    headerDesc.setAttribute('contenteditable', 'true');
    headerDesc.dataset.placeholder = 'Add a description...';
  }

  // Setup inline editing on header title
  setupInlineEdit(headerTitle, {
    onSave: (newValue) => {
      obj.name = newValue;
      const Repository = window.Objectiv?.Repository;
      Repository?.saveObjective?.(obj);
      // Update sidebar
      const SideListState = window.Objectiv?.SideListState;
      if (SideListState) {
        _renderSideList();
      }
    },
    restoreOnEmpty: true // Don't allow empty titles
  });

  // Setup inline editing on description
  if (headerDesc) {
    setupInlineEdit(headerDesc, {
      placeholder: 'Add a description...',
      allowEmpty: true,
      onSave: (newValue) => {
        obj.description = newValue;
        const Repository = window.Objectiv?.Repository;
        Repository?.saveObjective?.(obj);
      }
    });
  }

  // Render priorities, next step, and steps
  container.innerHTML = '';
  renderContentPriorities(container, obj);
  renderContentNextStep(container, obj);
  renderContentSteps(container, obj);

  // Refresh clarity scores (if enabled)
  _refreshClarity(obj);
  obj.priorities.forEach(p => _refreshClarity(p));
}

/**
 * Render objective view (backward compatibility wrapper)
 */
export function renderObjectiveView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderObjectiveViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'objective');
}

/**
 * Render folder view into a container
 * @param {HTMLElement} container - The container to render into
 */
function renderFolderViewInContainer(container) {
  const SideListState = window.Objectiv?.SideListState;
  const selectedItem = SideListState?.getSelectedItem();
  const folder = selectedItem?.data;

  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  if (!folder) {
    headerTitle.textContent = 'Select a folder';
    headerTitle.setAttribute('contenteditable', 'false');
    if (headerDesc) {
      headerDesc.textContent = '';
      headerDesc.setAttribute('contenteditable', 'false');
    }
    container.innerHTML = '';
    return;
  }

  const data = AppState.getData();

  // Get objectives in this folder
  const folderObjectives = data.objectives.filter(obj => obj.folderId === folder.id);

  headerTitle.textContent = folder.name || 'Unnamed Folder';
  headerTitle.setAttribute('contenteditable', 'true');

  if (headerDesc) {
    headerDesc.textContent = folderObjectives.length === 1
      ? '1 objective'
      : `${folderObjectives.length} objectives`;
    headerDesc.setAttribute('contenteditable', 'false'); // Folder description is auto-generated
  }

  // Setup inline editing on folder title
  setupInlineEdit(headerTitle, {
    onSave: async (newValue) => {
      folder.name = newValue;
      // Update in data.folders
      const folderInData = data.folders.find(f => f.id === folder.id);
      if (folderInData) {
        folderInData.name = newValue;
      }
      // Save to database
      const Repository = window.Objectiv?.Repository;
      if (Repository?.updateFolder) {
        try {
          await Repository.updateFolder({ id: folder.id, name: newValue });
        } catch (err) {
          console.error('Failed to update folder:', err);
        }
      }
      _renderSideList();
    },
    restoreOnEmpty: true
  });

  container.innerHTML = '';

  // Render objectives list
  if (folderObjectives.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'folder-empty-state';
    emptyState.style.cssText = 'color: var(--text-secondary); padding: 2rem 0; text-align: center;';
    emptyState.textContent = 'No objectives in this folder';
    container.appendChild(emptyState);
  } else {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'OBJECTIVES';
    container.appendChild(header);

    folderObjectives.forEach((obj) => {
      const objectiveItem = document.createElement('div');
      objectiveItem.className = 'list-item folder-objective-item';
      objectiveItem.style.cssText = 'cursor: pointer;';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'list-item-content';
      nameSpan.textContent = obj.name;
      objectiveItem.appendChild(nameSpan);

      // Click to navigate to the objective
      objectiveItem.onclick = () => {
        const objIndex = data.objectives.indexOf(obj);
        if (objIndex >= 0) {
          AppState.setSelectedObjectiveIndex(objIndex);
          AppState.setViewMode('objective');

          // Update side list selection
          const flatList = SideListState.getFlatList?.() || SideListState.getItems();
          const sideListIndex = flatList.findIndex(item =>
            item.type === SideListState.ItemType.OBJECTIVE && item.objectiveId === obj.id
          );
          if (sideListIndex >= 0) {
            SideListState.setSelectedIndex(sideListIndex);
          }

          // This would trigger re-render via navigation controller
          renderContentView();

          // Handle mobile view
          const Mobile = window.Objectiv?.Mobile;
          if (AppState.isMobile() && Mobile?.setMobileView) {
            Mobile.setMobileView('detail');
          }
        }
      };

      container.appendChild(objectiveItem);
    });
  }
}

/**
 * Render folder view (backward compatibility wrapper)
 */
export function renderFolderView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderFolderViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'folder');
}

/**
 * Render note view into a container
 * @param {HTMLElement} container - The container to render into
 */
async function renderNoteViewInContainer(container) {
  const SideListState = window.Objectiv?.SideListState;
  const selectedItem = SideListState?.getSelectedItem();
  const note = selectedItem?.data;

  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  if (!note) {
    headerTitle.textContent = 'Select a note';
    headerTitle.setAttribute('contenteditable', 'false');
    if (headerDesc) {
      headerDesc.textContent = '';
      headerDesc.setAttribute('contenteditable', 'false');
    }
    container.innerHTML = '';
    return;
  }

  // Set header
  headerTitle.textContent = note.name || 'Untitled Note';
  headerTitle.setAttribute('contenteditable', 'true');

  if (headerDesc) {
    headerDesc.textContent = '';
    headerDesc.setAttribute('contenteditable', 'false');
  }

  // Setup inline editing on title
  setupInlineEdit(headerTitle, {
    onSave: async (newValue) => {
      note.name = newValue;
      const NoteStorage = window.Objectiv?.NoteStorage;
      if (NoteStorage?.saveNote) {
        await NoteStorage.saveNote(note);
      }
      _renderSideList();
    },
    restoreOnEmpty: true
  });

  // Clear container and render tiptap editor
  container.innerHTML = '';

  const editorContainer = document.createElement('div');
  editorContainer.className = 'note-editor-container';
  container.appendChild(editorContainer);

  // Initialize tiptap editor for note content
  const TiptapEditor = window.Objectiv?.TiptapEditor;
  if (TiptapEditor?.initNoteEditor) {
    await TiptapEditor.initNoteEditor(
      note.content || '',
      note.id,
      editorContainer,
      async (html) => {
        // Auto-save callback
        note.content = html;
        note.updatedAt = new Date().toISOString();
        const NoteStorage = window.Objectiv?.NoteStorage;
        if (NoteStorage?.saveNote) {
          await NoteStorage.saveNote(note);
        }
      }
    );
  } else {
    // Fallback if tiptap is not ready
    editorContainer.innerHTML = `
      <div class="note-fallback-editor">
        <textarea class="note-content-textarea" placeholder="Write your note...">${note.content || ''}</textarea>
      </div>
    `;

    const textarea = editorContainer.querySelector('.note-content-textarea');
    if (textarea) {
      textarea.addEventListener('blur', async () => {
        note.content = textarea.value;
        note.updatedAt = new Date().toISOString();
        const NoteStorage = window.Objectiv?.NoteStorage;
        if (NoteStorage?.saveNote) {
          await NoteStorage.saveNote(note);
        }
      });
    }
  }
}

/**
 * Render note view (backward compatibility wrapper)
 */
export function renderNoteView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderNoteViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'note');
}

/**
 * Render settings view into a container
 * @param {HTMLElement} container - The container to render into
 */
function renderSettingsViewInContainer(container) {
  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  headerTitle.textContent = 'Settings';
  headerTitle.setAttribute('contenteditable', 'false');
  if (headerDesc) {
    headerDesc.textContent = '';
    headerDesc.setAttribute('contenteditable', 'false');
  }

  // Get current theme
  const Platform = window.Objectiv?.Platform;
  const currentTheme = Platform?.getCurrentTheme?.() || 'dark';

  container.innerHTML = `
    <div class="settings-view">
      <h1>Settings</h1>
      <p class="settings-subtitle">Customize your Objectiv experience</p>

      <div class="settings-section">
        <div class="settings-section-title">Appearance</div>
        <div class="settings-item">
          <span class="settings-item-label">Theme</span>
          <select id="theme-select" class="settings-select">
            <option value="dark"${currentTheme === 'dark' ? ' selected' : ''}>Dark</option>
            <option value="light"${currentTheme === 'light' ? ' selected' : ''}>Light</option>
            <option value="solarized"${currentTheme === 'solarized' ? ' selected' : ''}>Solarized</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Add event listener for theme change
  const themeSelect = container.querySelector('#theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const newTheme = e.target.value;
      if (Platform?.setTheme) {
        Platform.setTheme(newTheme);
      }
    });
  }
}

/**
 * Render settings view (backward compatibility wrapper)
 */
export function renderSettingsView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderSettingsViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'settings');
}

// ========================================
// Section Render Functions
// ========================================

/**
 * Render priorities section
 */
export function renderContentPriorities(container, obj) {
  const promptMode = AppState.getPromptMode();
  const promptTargetSection = AppState.getPromptTargetSection();
  const promptTargetIndex = AppState.getPromptTargetIndex();

  const header = document.createElement('div');
  header.className = 'section-header';
  header.textContent = 'PRIORITIES';
  container.appendChild(header);

  obj.priorities.forEach((priority, index) => {
    // Handle confirm mode (for delete confirmation)
    if (promptMode === 'confirm' && promptTargetSection === 'priorities' && promptTargetIndex === index) {
      const div = document.createElement('div');
      div.innerHTML = createConfirmRow(`Delete "${priority.name}"?`);
      container.appendChild(div.firstElementChild);
      return;
    }

    const isAdding = promptMode === 'add' && promptTargetSection === 'priorities' && promptTargetIndex === index;

    const listItem = createListItem({
      icon: '',
      iconClass: '',
      content: priority.name,
      contentEditable: true, // Always editable
      meta: '',
      selected: false
    });

    listItem.dataset.section = 'priorities';
    listItem.dataset.index = index;

    const contentEl = listItem.querySelector('.list-item-content');
    if (contentEl) {
      // Setup Notion-style inline editing
      setupInlineEdit(contentEl, {
        placeholder: isAdding ? 'Name your priority' : '',
        onSave: (newValue) => {
          // Update priority name and save
          priority.name = newValue;
          const Repository = window.Objectiv?.Repository;
          Repository?.saveObjective?.(obj);

          // Clear add mode if we were adding
          if (isAdding) {
            AppState.resetPromptState();
          }
        },
        onEmpty: () => {
          // Remove empty priority
          const idx = obj.priorities.indexOf(priority);
          if (idx !== -1) {
            obj.priorities.splice(idx, 1);
            const Repository = window.Objectiv?.Repository;
            Repository?.saveObjective?.(obj);
            AppState.resetPromptState();
            _renderContentView();
          }
        }
      });

      // Auto-focus new items
      if (isAdding) {
        setTimeout(() => contentEl.focus(), 0);
      }
    }

    container.appendChild(listItem);
  });

  // Add priority button
  if (!(promptMode === 'add' && promptTargetSection === 'priorities') && obj.priorities.length < 3) {
    const addDiv = document.createElement('div');
    addDiv.className = 'add-option';
    addDiv.innerHTML = '+ Add priority';
    addDiv.onclick = () => _startAddPriority();
    container.appendChild(addDiv);
  }
}

/**
 * Render steps section
 */
export function renderContentSteps(container, obj) {
  const promptMode = AppState.getPromptMode();
  const promptTargetSection = AppState.getPromptTargetSection();
  const promptTargetIndex = AppState.getPromptTargetIndex();

  const header = document.createElement('div');
  header.className = 'section-header';
  header.textContent = 'STEPS';
  container.appendChild(header);

  const isAddingStep = promptMode === 'add' && promptTargetSection === 'steps';

  // Add step button at top
  if (!isAddingStep) {
    const addDiv = document.createElement('div');
    addDiv.className = 'add-option';
    addDiv.innerHTML = '+ Log a step';
    addDiv.onclick = () => _startLogStep();
    container.appendChild(addDiv);
  }

  // Display steps newest-first
  for (let displayIdx = 0; displayIdx < obj.steps.length; displayIdx++) {
    const actualIdx = obj.steps.length - 1 - displayIdx;
    const step = obj.steps[actualIdx];

    // Handle confirm mode (for delete confirmation)
    if (promptMode === 'confirm' && promptTargetSection === 'steps' && promptTargetIndex === actualIdx) {
      const div = document.createElement('div');
      div.innerHTML = createConfirmRow(`Delete "${step.name}"?`);
      container.appendChild(div.firstElementChild);
      continue;
    }

    const timestamp = formatTimestamp(step.loggedAt);
    const durationStr = step.duration ? ` (${formatDuration(step.duration)})` : '';
    const orderNum = step.orderNumber || (actualIdx + 1);
    const isAdding = promptMode === 'add' && promptTargetSection === 'steps' && promptTargetIndex === actualIdx;

    const listItem = createListItem({
      icon: orderNum.toString(),
      iconClass: '',
      content: step.name,
      contentEditable: true, // Always editable
      meta: `<span class="step-timestamp">${timestamp}${durationStr}</span>`,
      metaClass: 'compact',
      selected: false
    });

    listItem.dataset.section = 'steps';
    listItem.dataset.index = actualIdx;

    const contentEl = listItem.querySelector('.list-item-content');
    if (contentEl) {
      // Setup Notion-style inline editing
      setupInlineEdit(contentEl, {
        placeholder: isAdding ? 'What did you do?' : '',
        onSave: (newValue) => {
          // Update step name and save
          step.name = newValue;
          const Repository = window.Objectiv?.Repository;
          Repository?.saveObjective?.(obj);

          // Clear add mode if we were adding
          if (isAdding) {
            AppState.resetPromptState();
          }
        },
        onEmpty: () => {
          // Remove empty step
          const idx = obj.steps.indexOf(step);
          if (idx !== -1) {
            obj.steps.splice(idx, 1);
            const Repository = window.Objectiv?.Repository;
            Repository?.saveObjective?.(obj);
            AppState.resetPromptState();
            _renderContentView();
          }
        }
      });

      // Auto-focus new items
      if (isAdding) {
        setTimeout(() => contentEl.focus(), 0);
      }
    }

    container.appendChild(listItem);
  }
}

// ========================================
// Hover Preview
// ========================================

/**
 * Start hover preview (shows content without changing selection)
 */
export function startHoverPreview(itemData) {
  const SideListState = window.Objectiv?.SideListState;
  const ItemType = SideListState?.ItemType || {};

  if (itemData.type !== ItemType.OBJECTIVE) {
    return;
  }

  AppState.setHoverPreviewActive(true);
  AppState.setHoverPreviewItemData(itemData);

  const data = AppState.getData();
  const obj = data.objectives[itemData.index];
  if (!obj) return;

  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');

  if (!headerTitle) return;

  headerTitle.textContent = obj.name;
  if (headerDesc) headerDesc.textContent = obj.description || '';

  // Get the active tab's container
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);

  container.innerHTML = '';
  renderContentPriorities(container, obj);
  renderContentNextStep(container, obj);
  renderContentSteps(container, obj);
}

/**
 * End hover preview (restore selected content)
 */
export function endHoverPreview() {
  if (!AppState.isHoverPreviewActive()) return;

  AppState.setHoverPreviewActive(false);
  AppState.setHoverPreviewItemData(null);

  renderContentView();
}

// ========================================
// Default Export
// ========================================

export default {
  setCallbacks,
  renderContentView,
  renderObjectiveView,
  renderWebView,
  renderFolderView,
  renderNoteView,
  renderSettingsView,
  renderContentPriorities,
  renderContentSteps,
  startHoverPreview,
  endHoverPreview,
  createListItem,
  createConfirmRow
};
