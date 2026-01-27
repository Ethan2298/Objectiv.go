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
import { renderDirectoryListing } from './directory-listing.js';
import * as TaskListView from './task-list-view.js';

// ========================================
// Callbacks (set by app.js)
// ========================================

let _startAddPriority = () => {};
let _startLogStep = () => {};
let _refreshClarity = () => {};
let _renderSideList = () => {};

// ========================================
// Header Edit Cleanup
// ========================================
// Track cleanup functions for header inline edits to prevent
// stale handlers from firing when switching between views
let _headerTitleCleanup = null;
let _headerDescCleanup = null;

function cleanupHeaderEdits() {
  if (_headerTitleCleanup) {
    _headerTitleCleanup();
    _headerTitleCleanup = null;
  }
  if (_headerDescCleanup) {
    _headerDescCleanup();
    _headerDescCleanup = null;
  }
}

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

  // Handle web-mode and note-mode CSS classes (needed even when not re-rendering)
  const contentView = document.getElementById('content-view');
  const contentPage = document.getElementById('content-page');
  const app = document.getElementById('app');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');

  if (viewMode === 'web') {
    contentPage?.classList.add('web-mode');
    app?.classList.add('web-mode');
    contentView?.classList.remove('note-mode');
    contentView?.classList.remove('task-list-mode');
    // Update header for web view (even if not re-rendering)
    if (headerTitle) headerTitle.textContent = 'Web';
    if (headerDesc) headerDesc.textContent = '';
  } else if (viewMode === 'note') {
    contentPage?.classList.remove('web-mode');
    app?.classList.remove('web-mode');
    contentView?.classList.add('note-mode');
    contentView?.classList.remove('task-list-mode');
  } else if (viewMode === 'task-list') {
    contentPage?.classList.remove('web-mode');
    app?.classList.remove('web-mode');
    contentView?.classList.remove('note-mode');
    contentView?.classList.add('task-list-mode');
  } else {
    contentPage?.classList.remove('web-mode');
    app?.classList.remove('web-mode');
    contentView?.classList.remove('note-mode');
    contentView?.classList.remove('task-list-mode');
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
    } else if (viewMode === 'task-list') {
      renderTaskListViewInContainer(container);
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

  // Cleanup any previous header edit handlers
  cleanupHeaderEdits();

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  headerTitle.textContent = 'Home';
  headerTitle.setAttribute('contenteditable', 'false');
  if (headerDesc) {
    headerDesc.textContent = '';
    headerDesc.setAttribute('contenteditable', 'false');
  }

  container.innerHTML = '';

  // Create wrapper div
  const homeView = document.createElement('div');
  homeView.className = 'home-view';
  container.appendChild(homeView);

  // Render directory listing for root level
  renderDirectoryListing(homeView, {
    folderId: null, // Root level
    onItemClick: handleDirectoryItemClick,
    onFolderToggle: () => {} // Toggle handled internally
  });
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

  // Cleanup any previous header edit handlers
  cleanupHeaderEdits();

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
  const GlobalNav = window.Layer?.GlobalNav;

  // Helper to update the OWNER tab from webview state (not the active tab)
  const updateOwnerTab = () => {
    const Tabs = window.Layer?.Tabs;
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
    const Tabs = window.Layer?.Tabs;
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
    const Tabs = window.Layer?.Tabs;
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
    const Tabs = window.Layer?.Tabs;
    if (Tabs) {
      Tabs.showAudioIndicator(ownerTabId);
    }
  });

  // Hide audio indicator when media pauses/stops
  webview.addEventListener('media-paused', () => {
    const Tabs = window.Layer?.Tabs;
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

  // Cleanup any previous header edit handlers (must happen before any return)
  cleanupHeaderEdits();

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

  // Setup inline editing on header title (cleanup already happened above)
  _headerTitleCleanup = setupInlineEdit(headerTitle, {
    onSave: (newValue) => {
      obj.name = newValue;
      const Repository = window.Layer?.Repository;
      Repository?.saveObjective?.(obj);
      // Update sidebar
      const SideListState = window.Layer?.SideListState;
      if (SideListState) {
        _renderSideList();
      }
    },
    restoreOnEmpty: true // Don't allow empty titles
  });

  // Setup inline editing on description
  if (headerDesc) {
    _headerDescCleanup = setupInlineEdit(headerDesc, {
      placeholder: 'Add a description...',
      allowEmpty: true,
      onSave: (newValue) => {
        obj.description = newValue;
        const Repository = window.Layer?.Repository;
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
 * Handle click on a directory item - navigate to the item
 */
function handleDirectoryItemClick(item) {
  const SideListState = window.Layer?.SideListState;
  const data = AppState.getData();

  switch (item.type) {
    case 'objective': {
      const objIndex = data.objectives.findIndex(o => o.id === item.id);
      if (objIndex >= 0) {
        AppState.setSelectedObjectiveIndex(objIndex);
        AppState.setViewMode('objective');

        // Update side list selection
        if (SideListState) {
          SideListState.selectItem(SideListState.ItemType.OBJECTIVE, item.id);
        }

        renderContentView();

        // Handle mobile view
        const Mobile = window.Layer?.Mobile;
        if (AppState.isMobile() && Mobile?.setMobileView) {
          Mobile.setMobileView('detail');
        }
      }
      break;
    }

    case 'folder': {
      AppState.setViewMode('folder');

      // Update side list selection
      if (SideListState) {
        SideListState.selectItem(SideListState.ItemType.FOLDER, item.id);
      }

      renderContentView();

      // Handle mobile view
      const Mobile = window.Layer?.Mobile;
      if (AppState.isMobile() && Mobile?.setMobileView) {
        Mobile.setMobileView('detail');
      }
      break;
    }

    case 'note': {
      AppState.setViewMode('note');

      // Update side list selection
      if (SideListState) {
        SideListState.selectItem(SideListState.ItemType.NOTE, item.id);
      }

      renderContentView();

      // Handle mobile view
      const Mobile = window.Layer?.Mobile;
      if (AppState.isMobile() && Mobile?.setMobileView) {
        Mobile.setMobileView('detail');
      }
      break;
    }

    case 'bookmark': {
      // For bookmarks, open in web view
      AppState.setViewMode('web');

      // Update side list selection
      if (SideListState) {
        SideListState.selectItem(SideListState.ItemType.BOOKMARK, item.id);
      }

      renderContentView();

      // Load the URL after a brief delay
      setTimeout(() => {
        const activeTabId = TabState.getActiveTabId();
        const TabContentManager = window.Layer?.TabContentManager;
        const webview = TabContentManager?.getWebview(activeTabId);
        if (webview && item.url) {
          webview.src = item.url;
        }
      }, 50);
      break;
    }
  }
}

/**
 * Render folder view into a container
 * @param {HTMLElement} container - The container to render into
 */
function renderFolderViewInContainer(container) {
  const SideListState = window.Layer?.SideListState;
  const selectedItem = SideListState?.getSelectedItem();
  const folder = selectedItem?.data;

  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Cleanup any previous header edit handlers (must happen before any return)
  cleanupHeaderEdits();

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

  // Count items in this folder (objectives, notes, subfolders)
  const folderObjectives = data.objectives.filter(obj => obj.folderId === folder.id);
  const folderNotes = (data.notes || []).filter(n => n.folderId === folder.id);
  const subfolders = (data.folders || []).filter(f => f.parentId === folder.id);
  const totalItems = folderObjectives.length + folderNotes.length + subfolders.length;

  headerTitle.textContent = folder.name || 'Unnamed Folder';
  headerTitle.setAttribute('contenteditable', 'true');

  if (headerDesc) {
    headerDesc.textContent = totalItems === 1
      ? '1 item'
      : `${totalItems} items`;
    headerDesc.setAttribute('contenteditable', 'false');
  }

  // Setup inline editing on folder title (cleanup already happened above)
  _headerTitleCleanup = setupInlineEdit(headerTitle, {
    onSave: async (newValue) => {
      folder.name = newValue;
      // Update in data.folders
      const folderInData = data.folders.find(f => f.id === folder.id);
      if (folderInData) {
        folderInData.name = newValue;
      }
      // Save to database
      const Repository = window.Layer?.Repository;
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

  // Create wrapper div
  const folderView = document.createElement('div');
  folderView.className = 'folder-view';
  container.appendChild(folderView);

  // Render directory listing for this folder's contents
  renderDirectoryListing(folderView, {
    folderId: folder.id,
    onItemClick: handleDirectoryItemClick,
    onFolderToggle: () => {} // Toggle handled internally
  });
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
  const SideListState = window.Layer?.SideListState;
  const selectedItem = SideListState?.getSelectedItem();
  const note = selectedItem?.data;

  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Cleanup any previous header edit handlers (must happen before any return)
  cleanupHeaderEdits();

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

  // Setup inline editing on title (cleanup already happened above)
  _headerTitleCleanup = setupInlineEdit(headerTitle, {
    onSave: async (newValue) => {
      note.name = newValue;
      const NoteStorage = window.Layer?.NoteStorage;
      if (NoteStorage?.saveNote) {
        await NoteStorage.saveNote(note);
      }
      _renderSideList();
    },
    restoreOnEmpty: true
  });

  // Clear container and mount editor directly (flat structure)
  container.innerHTML = '';
  container.classList.add('note-editor');

  // Get modules
  const MarkdownEditor = window.Layer?.MarkdownEditor;
  const EditorJsToMarkdown = window.Layer?.EditorJsToMarkdown;
  const NoteStorage = window.Layer?.NoteStorage;

  // Prepare content - detect format and migrate if needed
  let editorContent = note.content || '';

  // Check if content is Editor.js JSON format and needs migration
  if (editorContent && EditorJsToMarkdown?.isEditorJsFormat?.(editorContent)) {
    console.log('Migrating Editor.js content to markdown for note:', note.id);
    editorContent = EditorJsToMarkdown.convert(editorContent);
    // Note: Content will be saved as markdown on first edit
  }

  // Initialize Markdown editor
  if (MarkdownEditor?.initMarkdownEditor) {
    try {
      console.log('Initializing Markdown editor for note:', note.id);
      await MarkdownEditor.initMarkdownEditor(
        editorContent,
        note.id,
        container,
        async (markdownContent) => {
          // Auto-save callback - saves as raw markdown
          console.log('Auto-saving note:', note.id);
          note.content = markdownContent;
          note.updatedAt = new Date().toISOString();
          if (NoteStorage?.saveNote) {
            await NoteStorage.saveNote(note);
          }
        }
      );
      console.log('Markdown editor initialized successfully');
    } catch (err) {
      console.error('Failed to initialize Markdown editor:', err);
      // Fall through to textarea fallback
    }
  } else {
    console.warn('MarkdownEditor module not available, using fallback');
    // Fallback - simple textarea
    container.innerHTML = `
      <div class="note-fallback-editor">
        <textarea class="note-content-textarea" placeholder="Write your note...">${editorContent || ''}</textarea>
      </div>
    `;

    const textarea = container.querySelector('.note-content-textarea');
    if (textarea) {
      textarea.addEventListener('blur', async () => {
        note.content = textarea.value;
        note.updatedAt = new Date().toISOString();
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
 * Render task list view into a container
 * @param {HTMLElement} container - The container to render into
 */
async function renderTaskListViewInContainer(container) {
  const SideListState = window.Layer?.SideListState;
  const selectedItem = SideListState?.getSelectedItem();
  const taskList = selectedItem?.data;

  const contentPage = document.getElementById('content-page');
  const headerTitle = document.getElementById('content-header-title');
  const headerDesc = document.getElementById('content-header-description');
  const app = document.getElementById('app');

  if (!headerTitle) return;

  // Cleanup any previous header edit handlers
  cleanupHeaderEdits();

  // Remove web-mode if present
  if (contentPage) contentPage.classList.remove('web-mode');
  if (app) app.classList.remove('web-mode');

  if (!taskList) {
    headerTitle.textContent = 'Select a task list';
    headerTitle.setAttribute('contenteditable', 'false');
    if (headerDesc) {
      headerDesc.textContent = '';
      headerDesc.setAttribute('contenteditable', 'false');
    }
    container.innerHTML = '';
    return;
  }

  // Hide header for task list view (task list component has its own header)
  headerTitle.textContent = '';
  headerTitle.setAttribute('contenteditable', 'false');
  if (headerDesc) {
    headerDesc.textContent = '';
    headerDesc.setAttribute('contenteditable', 'false');
  }

  // Render task list view
  await TaskListView.renderTaskListView(container, taskList);
}

/**
 * Render task list view (backward compatibility wrapper)
 */
export function renderTaskListView() {
  const activeTabId = TabState.getActiveTabId();
  const container = TabContentManager.getOrCreateContainer(activeTabId);
  renderTaskListViewInContainer(container);
  TabContentManager.setContainerViewMode(activeTabId, 'task-list');
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

  // Cleanup any previous header edit handlers
  cleanupHeaderEdits();

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
  const Platform = window.Layer?.Platform;
  const currentTheme = Platform?.getCurrentTheme?.() || 'dark';

  container.innerHTML = `
    <div class="settings-view">
      <h1>Settings</h1>
      <p class="settings-subtitle">Customize your Layer experience</p>

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
          const Repository = window.Layer?.Repository;
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
            const Repository = window.Layer?.Repository;
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
          const Repository = window.Layer?.Repository;
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
            const Repository = window.Layer?.Repository;
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
  const SideListState = window.Layer?.SideListState;
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
