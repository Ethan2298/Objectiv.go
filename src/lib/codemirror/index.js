/**
 * CodeMirror 6 Module Exports
 *
 * Uses deps parameter to pin all shared dependencies to exact versions.
 * This ensures all packages use the same @codemirror/state instance.
 */

// Pin dependencies using esm.sh deps parameter
const DEPS = 'deps=@codemirror/state@6.4.1,@codemirror/view@6.26.3,@codemirror/language@6.10.2,@lezer/common@1.2.1,@lezer/highlight@1.2.0,@lezer/lr@1.4.1';

// State module - base dependency (no deps needed)
export {
  EditorState,
  StateField,
  StateEffect,
  Compartment,
  RangeSetBuilder
} from 'https://esm.sh/@codemirror/state@6.4.1';

// View module
export {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLineGutter,
  placeholder,
  Decoration,
  ViewPlugin,
  WidgetType
} from 'https://esm.sh/@codemirror/view@6.26.3?deps=@codemirror/state@6.4.1';

// Language module
export {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  syntaxTree
} from 'https://esm.sh/@codemirror/language@6.10.2?deps=@codemirror/state@6.4.1,@codemirror/view@6.26.3,@lezer/common@1.2.1,@lezer/highlight@1.2.0';

// Highlight tags
export { tags } from 'https://esm.sh/@lezer/highlight@1.2.0';

// Commands module
export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from 'https://esm.sh/@codemirror/commands@6.6.0?deps=@codemirror/state@6.4.1,@codemirror/view@6.26.3,@codemirror/language@6.10.2';

// Autocomplete module
export {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap
} from 'https://esm.sh/@codemirror/autocomplete@6.16.3?deps=@codemirror/state@6.4.1,@codemirror/view@6.26.3,@codemirror/language@6.10.2';

// Markdown language
export {
  markdown,
  markdownLanguage
} from 'https://esm.sh/@codemirror/lang-markdown@6.2.5?deps=@codemirror/state@6.4.1,@codemirror/view@6.26.3,@codemirror/language@6.10.2,@lezer/common@1.2.1,@lezer/highlight@1.2.0,@lezer/markdown@1.3.0';

// Search module
export {
  searchKeymap,
  highlightSelectionMatches
} from 'https://esm.sh/@codemirror/search@6.5.6?deps=@codemirror/state@6.4.1,@codemirror/view@6.26.3';
