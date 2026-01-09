---
id: task-10
title: Modular instant-edit pattern with blue cursor for all lists
status: Done
assignee: []
created_date: '2026-01-09 23:08'
updated_date: '2026-01-09 23:13'
labels:
  - ui
  - ux
  - component
  - editing
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Objectives list has a great "add" UX - clicking the add button creates a new row that's instantly editable inline with a placeholder. This pattern should be:

1. **Styled** - Make the typing cursor (caret) blue to match the app's visual language
2. **Modular** - Extract this instant-edit-on-add pattern into a reusable approach
3. **Applied** - Use this same pattern for Priorities and Steps lists

## Current State

- **Objectives**: Click add → new row appears → instantly editable with placeholder
- **Priorities**: Different add flow (needs to match objectives)
- **Steps**: Different add flow (needs to match objectives)

## Goals

- Blue caret color when editing any list item
- Consistent "add" experience: click add → new item → immediately in edit mode with placeholder
- Single reusable pattern/function for this behavior across all list types
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Typing cursor (caret) is blue when editing list items
- [x] #2 Objectives add flow works as reference implementation
- [x] #3 Priorities list uses same instant-edit-on-add pattern
- [x] #4 Steps list uses same instant-edit-on-add pattern
- [x] #5 Pattern is reusable/shared code (not duplicated per list)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-01-09)

### Changes Made:

1. **Blue caret color** - Updated `caret-color: #0891b2` in three CSS rules:
   - `.side-item-name[contenteditable]`
   - `.list-item-content[contenteditable="true"]`
   - `.prompt-input`

2. **Priorities instant-edit** - Updated `startAddPriority()` to:
   - Create placeholder priority with empty name
   - Add to array immediately
   - Set up inline contenteditable in render

3. **Steps instant-edit** - Updated `startLogStep()` to:
   - Create placeholder step with timestamp and orderNumber
   - Add to array immediately
   - Set up inline contenteditable in render

4. **Unified pattern** - All three list types now use:
   - `processAddStep()` - handles save or removal based on `promptData.item`
   - `cancelPrompt()` - cleans up placeholders for any type
   - CSS `.list-item-content[contenteditable]:empty:before` for placeholder text

5. **Removed legacy code**:
   - Removed `processLogStepInput()` function
   - Removed `promptMode === 'log'` checks
   - Removed `createPromptRow()` usage for add flows
<!-- SECTION:NOTES:END -->
