---
id: task-22
title: 'Selected Context: @ button to attach side list items as AI context'
status: Done
assignee: []
created_date: '2026-01-30 19:48'
updated_date: '2026-01-30 20:16'
labels:
  - feature
  - agent-panel
  - ux
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a "Selected Context" feature to the agent panel chat. An `@` button next to the agent/ask mode selector opens a search menu that lets users search and select any side list items (objectives, priorities, steps, notes, folders) to attach as context chips above the chat input. The AI sees the serialized content of selected items in the prompt.

**Behavior:**
- `@` button sits to the right of the mode pill in the input footer
- Clicking opens a search overlay/dropdown above the input area
- Search queries across all item types (objectives, notes, folders, priorities, steps)
- Matching items show type icon + name, grouped by type
- Selecting an item adds a removable chip/tag above the textarea
- Chips persist across messages until the user removes them (click X)
- Each chat tab maintains its own selected context (per-tab state)
- On send, selected items' full data is serialized into a structured context block prepended to the prompt

**Design notes (Ergonomic Minimalism):**
- `@` button is minimal, same style as mode pill
- Search menu uses progressive disclosure — hidden until invoked
- Chips are compact with type abbreviation + name + X to remove
- No context = no chip bar (zero-state is invisible)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @ button renders next to mode pill in agent panel input footer
- [ ] #2 Clicking @ opens a search overlay that queries all side list item types
- [ ] #3 Search results are grouped by type (Objective, Note, Folder, Priority, Step)
- [ ] #4 Selecting a result adds a removable chip above the textarea
- [ ] #5 Multiple items can be selected
- [ ] #6 Chips persist across messages until removed by user
- [ ] #7 Each chat tab maintains independent selected context
- [ ] #8 Selected context is serialized into the prompt sent to the AI
- [ ] #9 Chip bar is hidden when no context is selected (zero-state invisible)
- [ ] #10 @ button and search menu follow existing design language (minimal, grayscale)
<!-- AC:END -->
