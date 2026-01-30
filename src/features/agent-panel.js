/**
 * Agent Panel Module
 *
 * Right-side agent chat panel with toggle and resize functionality.
 * Supports two modes:
 * - Agent: Uses backend Claude Agent SDK with tools
 * - Ask: Direct Anthropic API for simple Q&A
 */

import * as AnthropicService from '../services/anthropic-service.js';
import * as ChatContext from '../services/chat-context.js';
import * as smd from '../vendor/smd.js';
import * as SideListState from '../state/side-list-state.js';
import * as Repository from '../data/repository.js';

// ========================================
// Constants
// ========================================

const PANEL_COLLAPSED_KEY = 'layer-agent-panel-collapsed';
const PANEL_WIDTH_KEY = 'layer-agent-panel-width';
const PANEL_MODE_KEY = 'layer-agent-panel-mode';
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 360;

const AGENT_API_URL = 'http://localhost:3001/api/agent';

const MODES = {
  AGENT: 'Agent',
  ASK: 'Ask'
};

const MODE_ICONS = {
  Agent: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  Ask: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`
};

// ========================================
// Panel State
// ========================================

let isResizing = false;
let isHoverExpanded = false; // Track if expanded via hover
let currentMode = MODES.AGENT;
let messages = [];

// ========================================
// Chat Tabs State
// ========================================

const CHAT_TABS_KEY = 'layer-agent-chat-tabs';
const ACTIVE_TAB_KEY = 'layer-agent-active-tab';

let chatTabs = [];
let activeTabId = null;
let nextTabId = 1;

// Per-tab streaming state: tabId -> { abortController, parser, isStreaming, accumulatedText }
const tabStreamState = new Map();

function getTabStream(tabId) {
  if (!tabStreamState.has(tabId)) {
    tabStreamState.set(tabId, {
      abortController: null,
      parser: null,
      isStreaming: false,
      accumulatedText: ''
    });
  }
  return tabStreamState.get(tabId);
}

function cleanupTabStream(tabId) {
  const state = tabStreamState.get(tabId);
  if (state) {
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
    if (state.parser) {
      try { smd.parser_end(state.parser); } catch { /* ignore */ }
      state.parser = null;
    }
    state.isStreaming = false;
    state.accumulatedText = '';
  }
  tabStreamState.delete(tabId);
}

// ========================================
// Panel Toggle
// ========================================

/**
 * Initialize panel toggle functionality
 */
export function initPanelToggle() {
  const toggleBtn = document.getElementById('agent-panel-toggle');
  const app = document.getElementById('app');

  if (!app) return;

  // Load saved state
  const isCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) !== 'false';
  if (isCollapsed) {
    app.classList.add('agent-panel-collapsed');
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggle);
  }
}

/**
 * Toggle panel visibility
 */
export function toggle() {
  const app = document.getElementById('app');
  if (!app) return;

  app.classList.toggle('agent-panel-collapsed');
  const collapsed = app.classList.contains('agent-panel-collapsed');
  localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed);

  // Update toggle button icon
  updateToggleIcon(collapsed);
}

/**
 * Update the toggle button icon based on state
 */
function updateToggleIcon(collapsed) {
  const toggleBtn = document.getElementById('agent-panel-toggle');
  if (!toggleBtn) return;

  const svg = toggleBtn.querySelector('svg');
  if (svg) {
    // Panel icon - show opposite state (collapsed = show open icon)
    svg.innerHTML = collapsed
      ? '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line>'
      : '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line>';
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  const app = document.getElementById('app');
  return app?.classList.contains('agent-panel-collapsed') || false;
}

/**
 * Open the panel
 */
export function open() {
  const app = document.getElementById('app');
  if (!app) return;

  app.classList.remove('agent-panel-collapsed');
  localStorage.setItem(PANEL_COLLAPSED_KEY, false);
  updateToggleIcon(false);
}

/**
 * Close the panel
 */
export function close() {
  const app = document.getElementById('app');
  if (!app) return;

  app.classList.add('agent-panel-collapsed');
  localStorage.setItem(PANEL_COLLAPSED_KEY, true);
  updateToggleIcon(true);
}

// ========================================
// Panel Hover Expand
// ========================================

/**
 * Initialize hover-to-expand when panel is collapsed
 */
export function initPanelHover() {
  const app = document.getElementById('app');
  const agentPanel = document.getElementById('agent-panel');

  if (!app || !agentPanel) return;

  // Create hover trigger zone
  const trigger = document.createElement('div');
  trigger.id = 'agent-panel-hover-trigger';
  app.appendChild(trigger);

  // Expand on trigger hover
  trigger.addEventListener('mouseenter', () => {
    if (app.classList.contains('agent-panel-collapsed')) {
      isHoverExpanded = true;
      app.classList.remove('agent-panel-collapsed');
    }
  });

  // Collapse when leaving panel (if hover-expanded)
  agentPanel.addEventListener('mouseleave', () => {
    if (isHoverExpanded) {
      isHoverExpanded = false;
      app.classList.add('agent-panel-collapsed');
    }
  });
}

// ========================================
// Panel Resize
// ========================================

/**
 * Initialize panel resize functionality
 */
export function initPanelResize() {
  const handle = document.getElementById('agent-panel-resize-handle');
  const app = document.getElementById('app');

  if (!handle || !app) return;

  // Load saved width
  const savedWidth = localStorage.getItem(PANEL_WIDTH_KEY);
  if (savedWidth) {
    app.style.setProperty('--agent-panel-width', savedWidth + 'px');
  } else {
    app.style.setProperty('--agent-panel-width', DEFAULT_WIDTH + 'px');
  }

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    // Calculate width from right edge
    const newWidth = window.innerWidth - e.clientX;
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
    app.style.setProperty('--agent-panel-width', clamped + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save width
      const width = getComputedStyle(app).getPropertyValue('--agent-panel-width');
      localStorage.setItem(PANEL_WIDTH_KEY, parseInt(width));
    }
  });
}

/**
 * Set panel width
 * @param {number} width - Width in pixels
 */
export function setWidth(width) {
  const app = document.getElementById('app');
  if (!app) return;

  const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
  app.style.setProperty('--agent-panel-width', clampedWidth + 'px');
  localStorage.setItem(PANEL_WIDTH_KEY, clampedWidth);
}

/**
 * Get current panel width
 * @returns {number} Width in pixels
 */
export function getWidth() {
  const app = document.getElementById('app');
  if (!app) return DEFAULT_WIDTH;

  const width = getComputedStyle(app).getPropertyValue('--agent-panel-width');
  return parseInt(width) || DEFAULT_WIDTH;
}

// ========================================
// Mode Selector
// ========================================

/**
 * Initialize the mode selector pill
 */
export function initModeSelector() {
  const pill = document.getElementById('agent-input-pill');
  const label = document.getElementById('agent-mode-label');
  const icon = document.getElementById('agent-mode-icon');

  if (!pill || !label) return;

  // Load saved mode
  const savedMode = localStorage.getItem(PANEL_MODE_KEY);
  if (savedMode && Object.values(MODES).includes(savedMode)) {
    currentMode = savedMode;
  }
  label.textContent = currentMode;

  if (icon && MODE_ICONS[currentMode]) {
    icon.innerHTML = MODE_ICONS[currentMode];
  }

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = pill.getBoundingClientRect();

    // Use the global ContextMenu
    const ContextMenu = window.Layer?.ContextMenu;
    if (!ContextMenu) {
      console.warn('ContextMenu not available');
      return;
    }

    ContextMenu.showContextMenu({
      x: rect.left,
      y: rect.top - 8,
      items: [
        {
          label: MODES.AGENT,
          icon: MODE_ICONS.Agent,
          action: () => setMode(MODES.AGENT)
        },
        {
          label: MODES.ASK,
          icon: MODE_ICONS.Ask,
          action: () => setMode(MODES.ASK)
        }
      ]
    });
  });
}

/**
 * Set the current mode
 * @param {string} mode
 */
export function setMode(mode) {
  if (!Object.values(MODES).includes(mode)) return;

  currentMode = mode;
  localStorage.setItem(PANEL_MODE_KEY, mode);

  // Save mode to active tab
  const tab = chatTabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.mode = mode;
    saveChatTabs();
  }

  const label = document.getElementById('agent-mode-label');
  if (label) {
    label.textContent = mode;
  }

  const icon = document.getElementById('agent-mode-icon');
  if (icon && MODE_ICONS[mode]) {
    icon.innerHTML = MODE_ICONS[mode];
  }
}

/**
 * Get current mode
 * @returns {string}
 */
export function getMode() {
  return currentMode;
}

// ========================================
// Chat Tabs
// ========================================

/**
 * Initialize chat tabs
 */
export function initChatTabs() {
  // Load saved tabs or create default
  const savedTabs = localStorage.getItem(CHAT_TABS_KEY);
  const savedActiveTab = localStorage.getItem(ACTIVE_TAB_KEY);

  if (savedTabs) {
    try {
      chatTabs = JSON.parse(savedTabs);
      nextTabId = Math.max(...chatTabs.map(t => t.id), 0) + 1;
    } catch {
      chatTabs = [];
    }
  }

  // Create default tab if none exist
  if (chatTabs.length === 0) {
    createChatTab();
  } else {
    // Restore active tab
    activeTabId = savedActiveTab ? parseInt(savedActiveTab) : chatTabs[0].id;
    if (!chatTabs.find(t => t.id === activeTabId)) {
      activeTabId = chatTabs[0].id;
    }
  }

  // Render tabs
  renderChatTabs();

  // Load active tab's messages
  loadTabMessages(activeTabId);

  // Restore active tab's mode
  const activeTab = chatTabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.mode) {
    setMode(activeTab.mode);
  }

  // Set up event listeners
  initTabEventListeners();
  initTabTearOff();
}

/**
 * Create a new chat tab
 * @param {string} title - Optional title for the tab
 * @returns {number} The new tab's ID
 */
export function createChatTab(title = 'New Chat') {
  const tab = {
    id: nextTabId++,
    title,
    messages: [],
    mode: currentMode, // inherit current mode as default
    selectedContext: [], // per-tab attached context items
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  chatTabs.push(tab);
  saveChatTabs();

  // Switch to new tab
  switchToTab(tab.id);
  renderChatTabs();

  return tab.id;
}

/**
 * Switch to a specific tab
 * @param {number} tabId
 */
export function switchToTab(tabId) {
  const tab = chatTabs.find(t => t.id === tabId);
  if (!tab) return;

  // If the current tab is streaming, detach its parser from DOM (stream continues in background)
  const prevStream = activeTabId ? getTabStream(activeTabId) : null;
  if (prevStream && prevStream.isStreaming && prevStream.parser) {
    // Detach: end the current DOM parser, but keep the stream running
    // The stream callbacks will accumulate text in memory via accumulatedText
    try { smd.parser_end(prevStream.parser); } catch { /* ignore */ }
    prevStream.parser = null;
  }

  // Save current tab's messages before switching
  if (activeTabId) {
    saveCurrentTabMessages();
  }

  activeTabId = tabId;
  localStorage.setItem(ACTIVE_TAB_KEY, tabId);

  // Load new tab's messages
  loadTabMessages(tabId);

  // If the target tab is streaming in the background, re-attach its output to DOM
  const targetStream = getTabStream(tabId);
  if (targetStream.isStreaming) {
    reattachStreamingBubble(tabId, targetStream);
  }

  // Restore per-tab mode
  const tabMode = tab.mode || MODES.AGENT;
  setMode(tabMode);

  // Restore per-tab context chips
  renderContextChips();

  renderChatTabs();
}

/**
 * Close a chat tab
 * @param {number} tabId
 */
export function closeChatTab(tabId) {
  const index = chatTabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  // Abort any active stream for this tab
  cleanupTabStream(tabId);

  // Don't close the last tab
  if (chatTabs.length === 1) {
    // Just clear the messages instead
    clearMessages();
    chatTabs[0].messages = [];
    chatTabs[0].title = 'New Chat';
    saveChatTabs();
    renderChatTabs();
    return;
  }

  // Remove the tab
  chatTabs.splice(index, 1);
  saveChatTabs();

  // If closing active tab, switch to another
  if (activeTabId === tabId) {
    const newIndex = Math.min(index, chatTabs.length - 1);
    switchToTab(chatTabs[newIndex].id);
  } else {
    renderChatTabs();
  }
}

/**
 * Save current tab's messages
 */
function saveCurrentTabMessages() {
  const tab = chatTabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.messages = [...messages];
    tab.updatedAt = Date.now();
    // Update title based on first user message if still "New Chat"
    if (tab.title === 'New Chat' && messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      if (firstUserMsg) {
        tab.title = firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
      }
    }
    saveChatTabs();
  }
}

/**
 * Load a tab's messages into the UI
 * @param {number} tabId
 */
function loadTabMessages(tabId) {
  const tab = chatTabs.find(t => t.id === tabId);
  if (!tab) return;

  // Clear current messages from UI
  const container = document.getElementById('agent-panel-content');
  if (container) {
    container.innerHTML = '';
  }

  // Load tab's messages
  messages = [...tab.messages];
  ChatContext.clearHistory();

  // Render all messages and rebuild context
  for (const msg of messages) {
    renderMessage(msg);
    ChatContext.addMessage(msg.role, msg.content);
  }

  scrollToBottom();
}

/**
 * Save chat tabs to localStorage
 */
function saveChatTabs() {
  localStorage.setItem(CHAT_TABS_KEY, JSON.stringify(chatTabs));
}

/**
 * Render chat tabs to the DOM
 */
function renderChatTabs() {
  const container = document.querySelector('.agent-panel-tabs');
  if (!container) return;

  // Clear existing tabs (except the add button)
  const addBtn = container.querySelector('.tab-add');
  container.innerHTML = '';

  // Render each tab
  for (const tab of chatTabs) {
    const tabEl = document.createElement('div');
    tabEl.className = `agent-panel-tab${tab.id === activeTabId ? ' active' : ''}`;
    tabEl.dataset.tabId = tab.id;

    tabEl.innerHTML = `
      <span class="tab-content">
        <span class="tab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span class="tab-title">${escapeHtml(tab.title)}</span>
        <button class="tab-close" aria-label="Close tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </span>
    `;

    container.appendChild(tabEl);
  }

  // Re-add the add button
  if (addBtn) {
    container.appendChild(addBtn);
  } else {
    const newAddBtn = document.createElement('button');
    newAddBtn.className = 'tab-add';
    newAddBtn.setAttribute('aria-label', 'New chat');
    newAddBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;
    container.appendChild(newAddBtn);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize tab event listeners
 */
function initTabEventListeners() {
  const container = document.querySelector('.agent-panel-tabs');
  if (!container) return;

  container.addEventListener('click', (e) => {
    // Handle tab click
    const tabEl = e.target.closest('.agent-panel-tab');
    if (tabEl && !e.target.closest('.tab-close')) {
      const tabId = parseInt(tabEl.dataset.tabId);
      if (tabId !== activeTabId) {
        switchToTab(tabId);
      }
      return;
    }

    // Handle close button click
    const closeBtn = e.target.closest('.tab-close');
    if (closeBtn) {
      const tabEl = closeBtn.closest('.agent-panel-tab');
      if (tabEl) {
        const tabId = parseInt(tabEl.dataset.tabId);
        closeChatTab(tabId);
      }
      return;
    }

    // Handle add button click
    const addBtn = e.target.closest('.tab-add');
    if (addBtn) {
      createChatTab();
      return;
    }
  });

  // Double-click to rename tab
  container.addEventListener('dblclick', (e) => {
    const tabEl = e.target.closest('.agent-panel-tab');
    if (!tabEl) return;

    const tabId = parseInt(tabEl.dataset.tabId);
    const titleEl = tabEl.querySelector('.tab-title');
    if (!titleEl || titleEl.contentEditable === 'true') return;

    e.preventDefault();
    startTabRename(tabId, titleEl);
  });

  // Handle history button
  const historyBtn = document.querySelector('.agent-panel-actions .agent-header-btn[title="History"]');
  if (historyBtn) {
    historyBtn.addEventListener('click', showChatHistory);
  }
}

/**
 * Show chat history menu
 */
function showChatHistory() {
  const historyBtn = document.querySelector('.agent-panel-actions .agent-header-btn[title="History"]');
  if (!historyBtn) return;

  const rect = historyBtn.getBoundingClientRect();

  const ContextMenu = window.Layer?.ContextMenu;
  if (!ContextMenu) return;

  const items = chatTabs.map(tab => ({
    label: tab.title,
    action: () => switchToTab(tab.id)
  }));

  if (items.length === 0) {
    items.push({ label: 'No chat history', disabled: true });
  }

  ContextMenu.showContextMenu({
    x: rect.right,
    y: rect.bottom + 4,
    items
  });
}

// ========================================
// Tab Tear-Off (Drag to Window)
// ========================================

let tearOffState = null; // { tabId, startX, startY, ghost, active }

/**
 * Initialize drag-to-tear-off detection on tab elements.
 * Called once; uses event delegation on the tabs container.
 */
function initTabTearOff() {
  const container = document.querySelector('.agent-panel-tabs');
  if (!container) return;

  container.addEventListener('mousedown', onTearOffMouseDown);
}

function onTearOffMouseDown(e) {
  const tabEl = e.target.closest('.agent-panel-tab');
  if (!tabEl || e.target.closest('.tab-close')) return;

  const tabId = parseInt(tabEl.dataset.tabId);
  if (!tabId) return;

  tearOffState = {
    tabId,
    startX: e.clientX,
    startY: e.clientY,
    ghost: null,
    active: false,
    tabEl
  };

  document.addEventListener('mousemove', onTearOffMouseMove);
  document.addEventListener('mouseup', onTearOffMouseUp);
}

function onTearOffMouseMove(e) {
  if (!tearOffState) return;

  const dy = e.clientY - tearOffState.startY;

  // Activate tear-off mode once vertical threshold exceeded
  if (!tearOffState.active && Math.abs(dy) > 40) {
    tearOffState.active = true;

    // Create ghost element
    const ghost = tearOffState.tabEl.cloneNode(true);
    ghost.className = 'agent-panel-tab tear-off-ghost';
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.8';
    ghost.style.width = tearOffState.tabEl.offsetWidth + 'px';
    document.body.appendChild(ghost);
    tearOffState.ghost = ghost;

    // Dim the original tab
    tearOffState.tabEl.style.opacity = '0.3';
  }

  if (tearOffState.active && tearOffState.ghost) {
    tearOffState.ghost.style.left = (e.clientX - tearOffState.tabEl.offsetWidth / 2) + 'px';
    tearOffState.ghost.style.top = (e.clientY - 12) + 'px';
  }
}

function onTearOffMouseUp(e) {
  document.removeEventListener('mousemove', onTearOffMouseMove);
  document.removeEventListener('mouseup', onTearOffMouseUp);

  if (!tearOffState) return;

  // Restore original tab opacity
  if (tearOffState.tabEl) {
    tearOffState.tabEl.style.opacity = '';
  }

  // Remove ghost
  if (tearOffState.ghost) {
    tearOffState.ghost.remove();
  }

  if (tearOffState.active) {
    // Tear off the tab into a new window
    tearOffTab(tearOffState.tabId, e.screenX, e.screenY);
  }

  tearOffState = null;
}

/**
 * Tear off a tab into a standalone browser window.
 * @param {number} tabId - The tab to tear off
 * @param {number} screenX - Screen X position for the new window
 * @param {number} screenY - Screen Y position for the new window
 */
function tearOffTab(tabId, screenX, screenY) {
  const tab = chatTabs.find(t => t.id === tabId);
  if (!tab) return;

  // If tab is streaming, finalize the stream first
  const stream = tabStreamState.get(tabId);
  if (stream && stream.isStreaming) {
    // Abort the stream and capture accumulated text as a completed message
    if (stream.abortController) {
      stream.abortController.abort();
      stream.abortController = null;
    }
    if (stream.parser) {
      try { smd.parser_end(stream.parser); } catch { /* ignore */ }
      stream.parser = null;
    }
    if (stream.accumulatedText.trim()) {
      tab.messages.push({
        id: Date.now(),
        content: stream.accumulatedText,
        role: 'assistant',
        timestamp: new Date()
      });
    }
    stream.isStreaming = false;
    stream.accumulatedText = '';
    tabStreamState.delete(tabId);
  }

  // If this is the active tab, make sure messages are saved
  if (tabId === activeTabId) {
    saveCurrentTabMessages();
  }

  // Serialize tab data to a localStorage transfer key
  const transferKey = `layer-tearoff-${tabId}-${Date.now()}`;
  const transferData = {
    messages: tab.messages,
    mode: tab.mode || currentMode,
    title: tab.title
  };
  localStorage.setItem(transferKey, JSON.stringify(transferData));

  // Open standalone chat window
  const width = 500;
  const height = 700;
  const left = Math.max(0, screenX - width / 2);
  const top = Math.max(0, screenY - 20);
  window.open(
    'chat-window.html',
    transferKey,  // window.name = transferKey so child can read it
    `width=${width},height=${height},left=${left},top=${top}`
  );

  // Remove the tab from parent
  const index = chatTabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  chatTabs.splice(index, 1);
  cleanupTabStream(tabId);

  // If we tore off the last tab, create a fresh one
  if (chatTabs.length === 0) {
    createChatTab();
    return; // createChatTab already renders and switches
  }

  // If we tore off the active tab, switch to another
  if (activeTabId === tabId) {
    const newIndex = Math.min(index, chatTabs.length - 1);
    switchToTab(chatTabs[newIndex].id);
  } else {
    saveChatTabs();
    renderChatTabs();
  }
}

// ========================================
// Tab Rename
// ========================================

/**
 * Start inline rename for a tab title
 * @param {number} tabId
 * @param {HTMLElement} titleEl
 */
function startTabRename(tabId, titleEl) {
  const tab = chatTabs.find(t => t.id === tabId);
  if (!tab) return;

  const originalTitle = tab.title;

  titleEl.contentEditable = 'true';
  titleEl.classList.add('editing');
  titleEl.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finishRename = (save) => {
    titleEl.contentEditable = 'false';
    titleEl.classList.remove('editing');

    if (save) {
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== originalTitle) {
        tab.title = newTitle;
        saveChatTabs();
      } else {
        titleEl.textContent = originalTitle;
      }
    } else {
      titleEl.textContent = originalTitle;
    }

    // Clean up listeners
    titleEl.removeEventListener('keydown', onKeyDown);
    titleEl.removeEventListener('blur', onBlur);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishRename(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishRename(false);
    }
  };

  const onBlur = () => {
    finishRename(true);
  };

  titleEl.addEventListener('keydown', onKeyDown);
  titleEl.addEventListener('blur', onBlur);
}

// ========================================
// Auto-expand Textarea
// ========================================

/**
 * Initialize auto-expanding textarea
 */
export function initTextarea() {
  const textarea = document.getElementById('agent-input-text');
  if (!textarea) return;

  const adjustHeight = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  textarea.addEventListener('input', adjustHeight);
  adjustHeight();
}

// ========================================
// Chat Functionality
// ========================================

/**
 * Add a message to the chat
 * @param {string} content - Message text
 * @param {'user' | 'assistant'} role - Who sent the message
 */
function addMessage(content, role) {
  const message = {
    id: Date.now(),
    content,
    role,
    timestamp: new Date()
  };
  messages.push(message);
  renderMessage(message);
  scrollToBottom();

  // Save to current tab
  saveCurrentTabMessages();
}

/**
 * Render a single message to the DOM
 * @param {object} message
 */
function renderMessage(message) {
  const container = document.getElementById('agent-panel-content');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `chat-message chat-message-${message.role}`;
  el.dataset.messageId = message.id;

  const bubble = document.createElement('div');
  bubble.className = message.role === 'assistant' ? 'chat-bubble chat-bubble-markdown' : 'chat-bubble';

  if (message.role === 'assistant') {
    // Render markdown for assistant messages
    const renderer = smd.default_renderer(bubble);
    const parser = smd.parser(renderer);
    smd.parser_write(parser, message.content);
    smd.parser_end(parser);
  } else {
    bubble.textContent = message.content;
  }

  el.appendChild(bubble);
  container.appendChild(el);
}

/**
 * Scroll chat to bottom
 */
function scrollToBottom() {
  const container = document.getElementById('agent-panel-content');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Show typing indicator
 */
function showTypingIndicator() {
  const container = document.getElementById('agent-panel-content');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'chat-message chat-message-assistant';
  el.id = 'typing-indicator';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble typing-bubble';
  bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';

  el.appendChild(bubble);
  container.appendChild(el);
  scrollToBottom();
}

/**
 * Remove typing indicator
 */
function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

/**
 * Create an empty streaming bubble for assistant response (only when tab is active)
 * @param {number} tabId - The tab this bubble belongs to
 * @returns {Object} Parser instance or null if tab is not active
 */
function createStreamingBubble(tabId) {
  if (tabId !== activeTabId) return null;

  const container = document.getElementById('agent-panel-content');
  if (!container) return null;

  const el = document.createElement('div');
  el.className = 'chat-message chat-message-assistant';
  el.id = 'streaming-message';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-markdown';
  bubble.id = 'streaming-bubble';

  el.appendChild(bubble);
  container.appendChild(el);
  scrollToBottom();

  // Initialize streaming markdown parser and store on tab stream state
  const renderer = smd.default_renderer(bubble);
  const stream = getTabStream(tabId);
  stream.parser = smd.parser(renderer);

  return stream.parser;
}

/**
 * Re-attach a streaming bubble for a tab that was streaming in the background.
 * Renders accumulated text and creates a new live parser for ongoing chunks.
 * @param {number} tabId
 * @param {Object} stream - The tab's stream state
 */
function reattachStreamingBubble(tabId, stream) {
  const container = document.getElementById('agent-panel-content');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'chat-message chat-message-assistant';
  el.id = 'streaming-message';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-markdown';
  bubble.id = 'streaming-bubble';

  el.appendChild(bubble);
  container.appendChild(el);

  // Render all accumulated text so far
  const renderer = smd.default_renderer(bubble);
  stream.parser = smd.parser(renderer);
  if (stream.accumulatedText) {
    smd.parser_write(stream.parser, stream.accumulatedText);
  }

  scrollToBottom();
}

/**
 * Write a chunk to the streaming markdown parser for a specific tab.
 * If the tab is active, writes to DOM. Always accumulates in memory.
 * @param {number} tabId - The originating tab
 * @param {string} chunk - New chunk of text
 */
function writeStreamingChunk(tabId, chunk) {
  const stream = getTabStream(tabId);
  stream.accumulatedText += chunk;

  if (stream.parser && tabId === activeTabId) {
    smd.parser_write(stream.parser, chunk);
    scrollToBottom();
  }
}

/**
 * Finalize streaming bubble (end parser and clean up) for a specific tab.
 * @param {number} tabId - The originating tab
 * @param {string} content - Final content for context
 */
function finalizeStreamingBubble(tabId, content) {
  const stream = getTabStream(tabId);

  // End the parser to flush any remaining content
  if (stream.parser) {
    smd.parser_end(stream.parser);
    stream.parser = null;
  }
  stream.isStreaming = false;
  stream.accumulatedText = '';

  // Clean up DOM ids if this tab is active
  if (tabId === activeTabId) {
    const el = document.getElementById('streaming-message');
    const bubble = document.getElementById('streaming-bubble');
    if (el) {
      el.removeAttribute('id');
      el.dataset.messageId = Date.now();
    }
    if (bubble) {
      bubble.removeAttribute('id');
    }
  }

  // Add to the tab's messages
  const tab = chatTabs.find(t => t.id === tabId);
  if (tab) {
    const msg = {
      id: Date.now(),
      content,
      role: 'assistant',
      timestamp: new Date()
    };
    tab.messages.push(msg);
    tab.updatedAt = Date.now();
    saveChatTabs();

    // If this is the active tab, sync the in-memory messages array too
    if (tabId === activeTabId) {
      messages.push(msg);
      ChatContext.addMessage('assistant', content);
    }
  }
}

/**
 * Handle API errors
 * @param {Error} error
 */
function handleApiError(error) {
  removeTypingIndicator();
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) streamingEl.remove();

  const container = document.getElementById('agent-panel-content');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'chat-message chat-message-assistant';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-error';

  let errorMessage = 'Something went wrong. Please try again.';

  if (error.message === 'NO_API_KEY') {
    errorMessage = 'No API key configured. Run: doppler run -- npm run web';
  } else if (error.status === 401) {
    errorMessage = 'Invalid API key. Check your Doppler configuration.';
  } else if (error.status === 429) {
    errorMessage = 'Rate limited. Please wait a moment and try again.';
  } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
    errorMessage = 'Network error. Please check your connection.';
  } else if (error.message) {
    errorMessage = error.message;
  }

  bubble.innerHTML = errorMessage;
  el.appendChild(bubble);
  container.appendChild(el);
  scrollToBottom();
}

/**
 * Cancel ongoing stream for the active tab
 */
export function cancelStream() {
  if (!activeTabId) return;
  const stream = getTabStream(activeTabId);

  if (stream.abortController) {
    stream.abortController.abort();
    stream.abortController = null;
  }
  if (stream.parser) {
    smd.parser_end(stream.parser);
    stream.parser = null;
  }

  // Save partial response if any accumulated text
  if (stream.accumulatedText.trim()) {
    const el = document.getElementById('streaming-message');
    const bubble = document.getElementById('streaming-bubble');
    if (el) {
      el.removeAttribute('id');
      el.dataset.messageId = Date.now();
    }
    if (bubble) {
      bubble.removeAttribute('id');
    }

    const msg = {
      id: Date.now(),
      content: stream.accumulatedText,
      role: 'assistant',
      timestamp: new Date()
    };
    messages.push(msg);
    ChatContext.addMessage('assistant', stream.accumulatedText);
    saveCurrentTabMessages();
  } else {
    const el = document.getElementById('streaming-message');
    if (el) el.remove();
  }

  stream.isStreaming = false;
  stream.accumulatedText = '';
}

/**
 * Handle sending a message
 */
async function sendMessage() {
  const textarea = document.getElementById('agent-input-text');
  if (!textarea) return;

  const content = textarea.value.trim();
  if (!content) return;

  // Don't allow sending while this tab is streaming
  const activeStream = getTabStream(activeTabId);
  if (activeStream.isStreaming) return;

  // Add user message to UI (show original, without context block)
  addMessage(content, 'user');

  // Prepend selected context to the message for the AI
  const contextPrefix = serializeContextForPrompt();
  const contentWithContext = contextPrefix + content;

  // Add to conversation context (with context block so AI sees it)
  ChatContext.addMessage('user', contentWithContext);

  // Clear input and close context search if open
  textarea.value = '';
  textarea.style.height = 'auto';
  closeContextSearch();

  // Route to appropriate handler based on mode (send with context prefix)
  if (currentMode === MODES.AGENT) {
    await sendAgentMessage(contentWithContext);
  } else {
    await sendAskMessage(contentWithContext);
  }
}

/**
 * Send message using backend Agent SDK (Agent mode)
 */
async function sendAgentMessage(content) {
  const tabId = activeTabId;
  const stream = getTabStream(tabId);

  // Show typing indicator
  showTypingIndicator();
  stream.isStreaming = true;
  stream.accumulatedText = '';

  // Create abort controller for cancellation
  stream.abortController = new AbortController();

  try {
    const response = await fetch(AGENT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: content,
        conversationHistory: ChatContext.getConversationHistory().slice(0, -1)
      }),
      signal: stream.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let bubbleCreated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (!data.trim()) continue;

          try {
            const event = JSON.parse(data);
            handleAgentEvent(event, {
              onText: (text) => {
                if (tabId === activeTabId) removeTypingIndicator();
                if (!bubbleCreated) {
                  createStreamingBubble(tabId);
                  bubbleCreated = true;
                }
                writeStreamingChunk(tabId, text);
                fullText += text;
              },
              onToolUse: (toolUse) => {
                if (tabId === activeTabId) showToolUseIndicator(toolUse);
              },
              onToolResult: (toolResult) => {
                if (tabId === activeTabId) handleToolResult(toolResult);
              },
              onDone: () => {
                if (tabId === activeTabId) {
                  removeTypingIndicator();
                  removeToolIndicators();
                }
                stream.abortController = null;
                if (fullText) {
                  finalizeStreamingBubble(tabId, fullText);
                } else {
                  stream.isStreaming = false;
                }
              },
              onError: (errorMsg) => {
                stream.isStreaming = false;
                stream.abortController = null;
                if (tabId === activeTabId) handleApiError(new Error(errorMsg));
              }
            });
          } catch (parseError) {
            console.warn('Failed to parse SSE data:', data);
          }
        }
      }
    }

  } catch (error) {
    stream.isStreaming = false;
    stream.abortController = null;
    if (error.name === 'AbortError') {
      return;
    }
    if (tabId === activeTabId) handleApiError(error);
  }
}

/**
 * Handle an event from the agent backend
 */
function handleAgentEvent(event, callbacks) {
  switch (event.type) {
    case 'text_delta':
      // Streaming text chunk from direct API
      if (event.text) {
        callbacks.onText(event.text);
      }
      break;

    case 'tool_use':
      // Tool being invoked
      if (event.tool) {
        callbacks.onToolUse(event.tool);
      }
      break;

    case 'tool_result':
      callbacks.onToolResult(event);
      break;

    case 'done':
      callbacks.onDone();
      break;

    case 'error':
      callbacks.onError(event.message);
      break;
  }
}

/**
 * Show tool use indicator in chat
 */
function showToolUseIndicator(toolUse) {
  const container = document.getElementById('agent-panel-content');
  if (!container) return;

  // Remove existing tool indicator if any
  const existing = container.querySelector('.tool-indicator');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'tool-indicator';

  // Format tool name nicely (replace underscores with spaces)
  const toolName = toolUse.name.replace(/_/g, ' ');
  el.innerHTML = `
    <span class="tool-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </span>
    <span class="tool-name">${toolName}</span>
    <span class="tool-spinner"></span>
  `;

  container.appendChild(el);
  scrollToBottom();
}

/**
 * Handle tool result - check for actions
 */
function handleToolResult(event) {
  if (!event.result) return;

  // Check if result is an action to execute
  try {
    const result = JSON.parse(event.result);
    if (result.action) {
      executeAction(result);
    }
  } catch {
    // Not JSON or not an action, ignore
  }
}

/**
 * Execute a frontend action from tool result
 */
function executeAction(action) {
  const Tabs = window.Layer?.Tabs;

  switch (action.action) {
    case 'open_note_tab':
      if (Tabs) {
        // Create a new tab for the note
        const tabId = Tabs.createNewTab(action.noteName || 'Note', 'objective');
        // Navigate to the note
        const NavigationController = window.Layer?.NavigationController;
        if (NavigationController) {
          NavigationController.navigateToNote(action.noteId);
        }
      }
      break;

    case 'open_url_tab':
      // Open URL in a new browser tab
      window.open(action.url, '_blank');
      break;
  }
}

/**
 * Remove tool indicators
 */
function removeToolIndicators() {
  const container = document.getElementById('agent-panel-content');
  if (!container) return;

  const indicators = container.querySelectorAll('.tool-indicator');
  indicators.forEach(el => el.remove());
}

/**
 * Send message using direct Anthropic API (Ask mode)
 */
async function sendAskMessage(content) {
  // Check for API key first
  if (!AnthropicService.hasApiKey()) {
    handleApiError(new Error('NO_API_KEY'));
    return;
  }

  const tabId = activeTabId;
  const stream = getTabStream(tabId);

  // Show typing indicator
  showTypingIndicator();
  stream.isStreaming = true;
  stream.accumulatedText = '';

  // Create abort controller for cancellation
  stream.abortController = new AbortController();

  let bubbleCreated = false;

  await AnthropicService.sendMessage({
    message: content,
    mode: currentMode,
    conversationHistory: ChatContext.getConversationHistory().slice(0, -1),
    signal: stream.abortController.signal,

    onChunk: (chunk, fullText) => {
      if (tabId === activeTabId) removeTypingIndicator();
      if (!bubbleCreated) {
        createStreamingBubble(tabId);
        bubbleCreated = true;
      }
      writeStreamingChunk(tabId, chunk);
    },

    onComplete: (fullText) => {
      if (tabId === activeTabId) removeTypingIndicator();
      stream.abortController = null;
      if (fullText) {
        finalizeStreamingBubble(tabId, fullText);
      } else {
        stream.isStreaming = false;
      }
    },

    onError: (error) => {
      stream.isStreaming = false;
      stream.abortController = null;
      if (tabId === activeTabId) handleApiError(error);
    }
  });
}

/**
 * Initialize chat input handlers
 */
function initChatInput() {
  const textarea = document.getElementById('agent-input-text');
  const sendBtn = document.getElementById('agent-send-btn');

  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      // Send on Enter (without shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }
}

/**
 * Clear all messages
 */
export function clearMessages() {
  // Cancel any ongoing stream
  cancelStream();

  messages = [];
  ChatContext.clearHistory();

  const container = document.getElementById('agent-panel-content');
  if (container) {
    container.innerHTML = '';
  }

  // Update current tab
  const tab = chatTabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.messages = [];
    saveChatTabs();
  }
}

// ========================================
// Context Search & Chips
// ========================================

let contextMenuEl = null;

/**
 * Initialize the @ context button
 */
function initContextSearch() {
  const btn = document.getElementById('agent-context-btn');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (contextMenuEl) {
      closeContextSearch();
    } else {
      openContextSearch();
    }
  });
}

function openContextSearch() {
  closeContextSearch();

  const btn = document.getElementById('agent-context-btn');
  if (!btn) return;

  const rect = btn.getBoundingClientRect();

  // Create floating menu
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'context-search-menu';

  // Search input
  const input = document.createElement('input');
  input.className = 'context-search-input';
  input.type = 'text';
  input.placeholder = 'Search items...';
  input.autocomplete = 'off';
  contextMenuEl.appendChild(input);

  // Results container
  const results = document.createElement('div');
  results.className = 'context-search-results';
  contextMenuEl.appendChild(results);

  // Position above the button
  contextMenuEl.style.position = 'fixed';
  contextMenuEl.style.left = rect.left + 'px';
  contextMenuEl.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

  document.body.appendChild(contextMenuEl);

  // Adjust if off-screen right
  const menuRect = contextMenuEl.getBoundingClientRect();
  if (menuRect.right > window.innerWidth - 8) {
    contextMenuEl.style.left = (window.innerWidth - menuRect.width - 8) + 'px';
  }

  input.focus();
  renderContextSearchResults('', results);

  input.addEventListener('input', () => {
    renderContextSearchResults(input.value.trim(), results);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeContextSearch();
    }
  });

  // Close on outside click (delayed to avoid immediate close)
  setTimeout(() => {
    document.addEventListener('click', handleContextSearchOutsideClick);
  }, 0);
}

function handleContextSearchOutsideClick(e) {
  if (contextMenuEl && !contextMenuEl.contains(e.target) &&
      e.target.id !== 'agent-context-btn' && !e.target.closest('#agent-context-btn')) {
    closeContextSearch();
  }
}

function closeContextSearch() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
  document.removeEventListener('click', handleContextSearchOutsideClick);
}

/**
 * Get all searchable items from the side list and repository
 */
function getSearchableItems() {
  const items = [];
  const data = Repository.loadData();

  // Objectives and their children
  if (data && data.objectives) {
    for (const obj of data.objectives) {
      items.push({ type: 'Objective', id: obj.id, name: obj.name, data: obj });
    }
  }

  // Folders
  const folders = SideListState.getFolders();
  if (folders) {
    for (const f of folders) {
      items.push({ type: 'Folder', id: f.id, name: f.name, data: f });
    }
  }

  // Notes - pull from side list items which includes both filed and unfiled notes
  const sideItems = SideListState.getItems();
  if (sideItems) {
    for (const sideItem of sideItems) {
      if (sideItem.type === 'note') {
        items.push({ type: 'Note', id: sideItem.noteId, name: sideItem.name, data: sideItem.data || sideItem });
      }
    }
  }

  return items;
}

/**
 * Render search results in the floating menu
 */
function renderContextSearchResults(query, container) {
  if (!container) return;

  const allItems = getSearchableItems();
  const lowerQuery = query.toLowerCase();

  // Filter — show all items when no query
  const filtered = query
    ? allItems.filter(item => item.name && item.name.toLowerCase().includes(lowerQuery))
    : allItems;

  // Get currently selected IDs for this tab
  const tab = chatTabs.find(t => t.id === activeTabId);
  const selectedIds = new Set((tab?.selectedContext || []).map(c => c.id));

  // Group by type
  const groups = {};
  for (const item of filtered) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<div class="context-search-empty">No items found</div>';
    return;
  }

  const typeIcons = {
    Objective: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    Folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    Note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
  };

  for (const [type, items] of Object.entries(groups)) {
    const groupEl = document.createElement('div');
    groupEl.className = 'context-search-group';

    const header = document.createElement('div');
    header.className = 'context-search-group-header';
    header.textContent = type + 's';
    groupEl.appendChild(header);

    for (const item of items.slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'context-search-item' + (selectedIds.has(item.id) ? ' selected' : '');

      const icon = typeIcons[item.type] || '';
      row.innerHTML = `
        <svg class="context-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        <span class="context-search-name">${escapeHtml(item.name)}</span>
        ${item.parentName ? `<span class="context-search-parent">${escapeHtml(item.parentName)}</span>` : ''}
      `;

      row.addEventListener('click', () => {
        toggleContextItem(item);
        row.classList.toggle('selected');
      });

      groupEl.appendChild(row);
    }

    container.appendChild(groupEl);
  }
}

/**
 * Toggle a context item on/off for the active tab
 */
function toggleContextItem(item) {
  const tab = chatTabs.find(t => t.id === activeTabId);
  if (!tab) return;

  if (!tab.selectedContext) tab.selectedContext = [];

  const index = tab.selectedContext.findIndex(c => c.id === item.id);
  if (index >= 0) {
    tab.selectedContext.splice(index, 1);
  } else {
    tab.selectedContext.push({
      id: item.id,
      type: item.type,
      name: item.name,
      data: item.data
    });
  }

  saveChatTabs();
  renderContextChips();
}

/**
 * Remove a context item by ID
 */
function removeContextItem(itemId) {
  const tab = chatTabs.find(t => t.id === activeTabId);
  if (!tab || !tab.selectedContext) return;

  tab.selectedContext = tab.selectedContext.filter(c => c.id !== itemId);
  saveChatTabs();
  renderContextChips();
}

/**
 * Render context chips above the textarea
 */
function renderContextChips() {
  const container = document.getElementById('agent-context-chips');
  if (!container) return;

  const tab = chatTabs.find(t => t.id === activeTabId);
  const items = tab?.selectedContext || [];

  container.innerHTML = '';
  if (items.length === 0) return;

  const chipIcons = {
    Objective: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    Folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    Note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
  };

  for (const item of items) {
    const chip = document.createElement('span');
    chip.className = 'context-chip';
    const icon = chipIcons[item.type] || '';
    chip.innerHTML = `
      <svg class="context-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
      <span class="context-chip-name">${escapeHtml(item.name)}</span>
      <button class="context-chip-remove" aria-label="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;

    chip.querySelector('.context-chip-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeContextItem(item.id);
    });

    container.appendChild(chip);
  }
}

/**
 * Serialize selected context items into a prompt prefix
 */
function serializeContextForPrompt() {
  const tab = chatTabs.find(t => t.id === activeTabId);
  const items = tab?.selectedContext || [];
  if (items.length === 0) return '';

  const blocks = items.map(item => {
    const lines = [`[${item.type}: ${item.name}]`];
    const d = item.data;

    if (item.type === 'Objective') {
      if (d.description) lines.push(`Description: ${d.description}`);
      if (d.priorities?.length) {
        lines.push('Priorities:');
        for (const p of d.priorities) {
          lines.push(`  - ${p.name}${p.description ? ': ' + p.description : ''}`);
        }
      }
      if (d.steps?.length) {
        lines.push('Steps:');
        for (const s of d.steps) {
          lines.push(`  - ${s.name}${s.status ? ' (' + s.status + ')' : ''}`);
        }
      }
    } else if (item.type === 'Note') {
      if (d.content) lines.push(`Content: ${d.content}`);
    } else if (item.type === 'Folder') {
      if (d.name) lines.push(`Folder: ${d.name}`);
    }

    return lines.join('\n');
  });

  return '--- Selected Context ---\n' + blocks.join('\n\n') + '\n--- End Context ---\n\n';
}

// ========================================
// Initialize
// ========================================

export function init() {
  initPanelToggle();
  initPanelResize();
  initPanelHover();
  initModeSelector();
  initTextarea();
  initChatInput();
  initChatTabs();
  initContextSearch();

  // Set initial toggle icon state
  const collapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) !== 'false';
  updateToggleIcon(collapsed);
}

// ========================================
// Default Export
// ========================================

export default {
  init,
  initPanelToggle,
  initPanelResize,
  initPanelHover,
  initModeSelector,
  initChatTabs,
  toggle,
  isCollapsed,
  open,
  close,
  setWidth,
  getWidth,
  setMode,
  getMode,
  clearMessages,
  cancelStream,
  createChatTab,
  switchToTab,
  closeChatTab
};
