/**
 * CodeMirror Theme
 *
 * Matches the app's CSS variables for consistent styling.
 * Uses Solarized colors from the main theme.
 */

import { EditorView, HighlightStyle, syntaxHighlighting, tags } from './index.js';

/**
 * Base editor theme using CSS variables
 */
export const layerTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'transparent',
    fontSize: '14px',
    fontFamily: 'var(--font-family, ui-sans-serif, system-ui, sans-serif)',
    height: '100%'
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    fontFamily: 'var(--font-family, ui-sans-serif, system-ui, sans-serif)',
    padding: '0',
    lineHeight: '1.6'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)'
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--accent)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection, rgba(0, 128, 128, 0.2))'
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
    minWidth: '24px'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit'
  },
  '.cm-placeholder': {
    color: 'var(--text-muted)',
    fontStyle: 'italic'
  },
  // Link styling
  '.cm-link': {
    color: 'var(--accent)',
    textDecoration: 'none'
  },
  // Focus ring removal (handled by container)
  '&.cm-focused': {
    outline: 'none'
  }
}, { dark: true });

/**
 * Syntax highlighting using Solarized colors
 */
export const layerHighlightStyle = HighlightStyle.define([
  // Headers
  { tag: tags.heading1, color: 'var(--text)', fontWeight: '700', fontSize: '1.75em', textDecoration: 'none' },
  { tag: tags.heading2, color: 'var(--text)', fontWeight: '600', fontSize: '1.5em', textDecoration: 'none' },
  { tag: tags.heading3, color: 'var(--text)', fontWeight: '600', fontSize: '1.25em', textDecoration: 'none' },
  { tag: tags.heading4, color: 'var(--text)', fontWeight: '600', fontSize: '1.1em', textDecoration: 'none' },
  { tag: tags.heading5, color: 'var(--text)', fontWeight: '600', fontSize: '1em', textDecoration: 'none' },
  { tag: tags.heading6, color: 'var(--text)', fontWeight: '600', fontSize: '0.9em', textDecoration: 'none' },

  // Emphasis
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },

  // Links
  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent)' },

  // Code
  { tag: tags.monospace, fontFamily: 'var(--font-mono, monospace)', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', padding: '1px 4px' },

  // Quotes
  { tag: tags.quote, color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '3px solid var(--border)', paddingLeft: '12px' },

  // Lists
  { tag: tags.list, color: 'var(--text)' },

  // Markdown syntax characters (lighter when visible)
  { tag: tags.processingInstruction, color: 'var(--text-muted)' },
  { tag: tags.meta, color: 'var(--text-muted)' },

  // Content
  { tag: tags.content, color: 'var(--text)' },
  { tag: tags.contentSeparator, color: 'var(--border)' }
]);

/**
 * Combined theme extension
 */
export const layerThemeExtension = [
  layerTheme,
  syntaxHighlighting(layerHighlightStyle)
];

export default layerThemeExtension;
