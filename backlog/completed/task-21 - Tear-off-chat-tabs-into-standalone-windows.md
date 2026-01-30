---
id: task-21
title: Tear-off chat tabs into standalone windows
status: Done
assignee: []
created_date: '2026-01-30 19:43'
updated_date: '2026-01-30 19:57'
labels:
  - feature
  - agent-panel
  - ux
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow users to drag a chat tab out of the agent panel to create a standalone browser window containing just that chat conversation, similar to Chrome's tab tear-off behavior.

## Context

The agent panel (`src/features/agent-panel.js`) manages multiple chat tabs, each holding independent state: messages, mode (Agent/Ask), and streaming state via `tabStreamState` Map. Tabs persist to localStorage and support background streaming with seamless reattach on tab switch.

## Behavior

**Tear-off trigger:** User drags a tab downward or away from the tab bar beyond a threshold (~40px vertical). A ghost preview follows the cursor during drag. On release outside the tab bar, a new browser window opens.

**Standalone window contents:**
- Full-viewport chat UI: messages area + input bar + mode pill
- No side list, no objectives panel — just the chat
- Same styling (inherits `styles.css` via shared stylesheet)
- Window title set to the tab's title

**State handoff:**
- The tab's `messages[]`, `mode`, and `title` are passed to the new window
- The tab is removed from the parent window's `chatTabs[]` array
- If the tab was actively streaming, the stream is finalized in the parent and the accumulated text transfers as a completed message
- The new window gets its own independent chat capability (can send new messages, stream responses)

**Re-docking (stretch goal, not required for v1):**
- Not needed initially. User can simply copy content or start a new tab.

## Implementation Plan

### 1. Add drag detection to tabs
- Attach `mousedown` → `mousemove` → `mouseup` listeners to `.agent-panel-tab` elements
- Track drag delta from origin; if vertical offset > 40px, enter "tear-off" mode
- Show a ghost element (cloned tab) following cursor during drag
- On `mouseup` in tear-off mode, trigger the window spawn

### 2. Create a standalone chat HTML page
- New file: `chat-window.html` — minimal HTML shell that loads styles.css and a dedicated `chat-window.js` module
- Layout: full viewport with just `#agent-panel-content` (messages) and `#agent-panel-input` (textarea + mode pill + send button)
- No header tabs, no resize handle, no side panel integration

### 3. Build `src/features/chat-window.js` module
- Standalone entry point for the popped-out chat
- Reads initial state from `window.name` or `localStorage` transfer key (JSON-serialized tab data)
- Renders all existing messages using the same smd.js markdown pipeline
- Wires up `sendAgentMessage()` / `sendAskMessage()` for new messages
- Imports shared modules: `anthropic-service.js`, `chat-context.js`, `config.js`, `constants.js`

### 4. Window spawn logic in agent-panel.js
- `tearOffTab(tabId)` function:
  1. Serialize the tab object (messages, mode, title) to a localStorage transfer key like `layer-tearoff-{tabId}`
  2. `window.open('chat-window.html', ...)` with appropriate size (500x700)
  3. Remove the tab from `chatTabs[]`, switch to adjacent tab
  4. If tab was streaming, call `finalizeStreamingBubble()` first to save accumulated text as a completed message before serialization
  5. Clean up `tabStreamState` entry

### 5. Cleanup and edge cases
- If only one tab exists and it's torn off, create a fresh "New Chat" tab in the parent
- Transfer key in localStorage cleaned up by the child window after reading
- Child window title set via `document.title = tab.title`
- Handle `beforeunload` in child to clean up any active streams

## Key Files
- `src/features/agent-panel.js` — drag detection, `tearOffTab()`, tab removal
- `chat-window.html` — new standalone HTML shell
- `src/features/chat-window.js` — new standalone chat module
- `src/styles.css` — may need a few layout overrides for full-viewport chat mode

## Technical Notes
- Use `window.open()` rather than the Popover API — we need a true OS-level window
- State transfer via localStorage is simplest; `window.postMessage` is an alternative but adds complexity
- The child window reuses the same Supabase config and API services
- smd.js (markdown streaming parser) must be available in the child window
- Streaming in the torn-off window works independently — it makes its own fetch calls
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 User can drag a chat tab away from the tab bar to tear it off
- [ ] #2 A new browser window opens containing the full chat conversation
- [ ] #3 The torn-off window has a full-viewport chat UI (messages + input) with no side panel
- [ ] #4 All existing messages from the tab appear in the new window
- [ ] #5 User can send new messages and receive streamed responses in the torn-off window
- [ ] #6 The tab is removed from the parent window's tab bar after tear-off
- [ ] #7 If the last tab is torn off, a fresh 'New Chat' tab is created in the parent
- [ ] #8 Active streams are gracefully finalized before tear-off transfer
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
### 1. Add drag detection to tabs
- Attach `mousedown` → `mousemove` → `mouseup` listeners to `.agent-panel-tab` elements
- Track drag delta from origin; if vertical offset > 40px, enter "tear-off" mode
- Show a ghost element (cloned tab) following cursor during drag
- On `mouseup` in tear-off mode, trigger the window spawn

### 2. Create a standalone chat HTML page
- New file: `chat-window.html` — minimal HTML shell that loads styles.css and a dedicated `chat-window.js` module
- Layout: full viewport with just `#agent-panel-content` (messages) and `#agent-panel-input` (textarea + mode pill + send button)
- No header tabs, no resize handle, no side panel integration

### 3. Build `src/features/chat-window.js` module
- Standalone entry point for the popped-out chat
- Reads initial state from `window.name` or `localStorage` transfer key (JSON-serialized tab data)
- Renders all existing messages using the same smd.js markdown pipeline
- Wires up `sendAgentMessage()` / `sendAskMessage()` for new messages
- Imports shared modules: `anthropic-service.js`, `chat-context.js`, `config.js`, `constants.js`

### 4. Window spawn logic in agent-panel.js
- `tearOffTab(tabId)` function:
  1. Serialize the tab object (messages, mode, title) to a localStorage transfer key like `layer-tearoff-{tabId}`
  2. `window.open('chat-window.html', ...)` with appropriate size (500x700)
  3. Remove the tab from `chatTabs[]`, switch to adjacent tab
  4. If tab was streaming, call `finalizeStreamingBubble()` first to save accumulated text as a completed message before serialization
  5. Clean up `tabStreamState` entry

### 5. Cleanup and edge cases
- If only one tab exists and it's torn off, create a fresh "New Chat" tab in the parent
- Transfer key in localStorage cleaned up by the child window after reading
- Child window title set via `document.title = tab.title`
- Handle `beforeunload` in child to clean up any active streams

## Key Files
- `src/features/agent-panel.js` — drag detection, `tearOffTab()`, tab removal
- `chat-window.html` — new standalone HTML shell
- `src/features/chat-window.js` — new standalone chat module
- `src/styles.css` — may need a few layout overrides for full-viewport chat mode

## Technical Notes
- Use `window.open()` rather than the Popover API — we need a true OS-level window
- State transfer via localStorage is simplest; `window.postMessage` is an alternative but adds complexity
- The child window reuses the same Supabase config and API services
- smd.js (markdown streaming parser) must be available in the child window
- Streaming in the torn-off window works independently — it makes its own fetch calls
<!-- SECTION:DESCRIPTION:END -->
<!-- SECTION:PLAN:END -->
