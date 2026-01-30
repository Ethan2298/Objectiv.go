---
id: task-19
title: Make agent panel chat tabs fully independent instances
status: Done
assignee: []
created_date: '2026-01-30 19:28'
updated_date: '2026-01-30 19:57'
labels:
  - feature
  - agent-panel
  - architecture
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

The agent panel chat tabs exist visually but don't behave as truly independent instances. Several pieces of state are shared globally across all tabs via module-level variables in `src/features/agent-panel.js`, meaning switching tabs can leak state or cause bugs.

### Current Architecture (what exists)

**Per-tab state** (stored in `chatTabs[n]`):
- `messages[]` — array of `{id, content, role, timestamp}` objects
- `title` — auto-generated from first user message
- `createdAt` — timestamp

**Global/shared state** (module-level variables, lines 41-47):
- `messages` — the *active* tab's messages (swapped on tab switch)
- `isStreaming` — whether an API stream is in progress
- `currentAbortController` — for cancelling the active stream
- `currentParser` — the `smd` streaming markdown parser
- `currentMode` — Agent vs Ask mode (shared across ALL tabs)

**ChatContext** (`src/services/chat-context.js`):
- Single global `conversationHistory[]` — rebuilt from scratch on every tab switch via `clearHistory()` + re-adding all messages

### What Breaks / Is Missing

1. **Streaming interruption on tab switch** — If a stream is active on Tab A and you switch to Tab B, the global `isStreaming` flag, `currentAbortController`, and `currentParser` all belong to Tab A. Switching doesn't abort the stream or isolate it, so streaming chunks could write into the wrong tab's DOM, or the streaming state gets orphaned.

2. **Mode is global** — Agent/Ask mode (`currentMode`) is shared. If Tab A is in Agent mode and Tab B should be in Ask mode, switching doesn't restore per-tab mode. The mode selector pill reflects whatever was last set globally.

3. **No per-tab model selection** — The LLM model selected via `AnthropicService` is stored in a single localStorage key (`layer-agent-model`). All tabs use the same model.

4. **ChatContext is a singleton** — `chat-context.js` has a single `conversationHistory` array. On tab switch it's cleared and rebuilt, which works for simple cases but means any in-flight API call using the old context could get corrupted mid-stream.

5. **No per-tab system prompt or context** — All tabs share the same system prompt. There's no way for one tab to have different instructions or context than another.

6. **Tab title persistence** — Tab titles auto-generate from the first user message but can't be manually renamed.

## Solution: Per-Tab Instance Isolation

### Core Data Model Change

Each tab becomes a self-contained conversation instance:

```js
{
  id: number,
  title: string,
  messages: [],          // existing
  mode: 'Agent' | 'Ask', // NEW — per-tab mode
  model: string | null,  // NEW — per-tab model override (null = use global default)
  createdAt: number,
  updatedAt: number       // NEW — for sorting by recency
}
```

### Implementation

#### 1. Isolate streaming state per tab

When switching tabs while a stream is active:
- **Option A (recommended):** Abort the active stream on the old tab, save partial response to that tab's messages, and load the new tab cleanly. When switching back, the partial message is visible and the user can re-send.
- **Option B:** Let the stream continue in the background, buffering chunks to the tab's messages array. When switching back, render the accumulated content. (More complex, deferred.)

For now, implement Option A:
```
switchToTab(newId):
  1. If isStreaming → abort current stream, finalize partial message on current tab
  2. saveCurrentTabMessages() 
  3. Reset streaming state (isStreaming=false, currentParser=null, currentAbortController=null)
  4. Load new tab
```

#### 2. Per-tab mode (Agent/Ask)

- Store `mode` on each tab object
- On tab switch, restore the mode from the tab and update the UI pill
- When mode changes, save it to the active tab
- Default new tabs to the global default mode

#### 3. Per-tab model selection (stretch)

- Store optional `model` override on each tab object
- When `null`, fall back to the global model setting
- When sending messages, pass the tab's model to `AnthropicService`

#### 4. ChatContext scoping

The current approach (clear + rebuild on switch) is adequate as long as we abort in-flight streams before switching. No structural change needed — just ensure the abort happens first.

#### 5. Tab rename

- Double-click on tab title to enter inline edit mode
- Escape to cancel, Enter to save
- Save to tab object and persist

### Files to Modify

| File | Changes |
|------|---------|
| `src/features/agent-panel.js` | Tab data model, switchToTab abort logic, per-tab mode, tab rename |
| `src/services/chat-context.js` | No changes needed (clear+rebuild approach works) |
| `src/services/anthropic-service.js` | Accept per-tab model parameter |
| `src/styles.css` | Tab rename inline editing styles |

### Key Code Locations

- Tab state & switching: `agent-panel.js:346-560`
- Module-level shared state: `agent-panel.js:41-47`
- Mode selector: `agent-panel.js:267-342`  
- Streaming: `agent-panel.js:757-831` (bubble creation), `agent-panel.js:891-1011` (agent send), `agent-panel.js:1133-1178` (ask send)
- ChatContext singleton: `chat-context.js` (entire file)
- Model selection: `anthropic-service.js` `getSelectedModelConfig()`
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching tabs while streaming aborts the active stream and saves partial response to the originating tab
- [x] #2 Each tab has its own Agent/Ask mode that persists across tab switches
- [x] #3 Mode pill UI updates to reflect the active tab's mode when switching
- [x] #4 New tabs inherit the global default mode
- [x] #5 Tab titles can be renamed by double-clicking
- [x] #6 Per-tab state (messages, mode, title) persists across app reload via localStorage
- [x] #7 No state leaks between tabs — sending a message on Tab A never affects Tab B
- [x] #8 Streaming on Tab A, switching to Tab B, switching back to Tab A shows the partial response that was saved
<!-- AC:END -->
