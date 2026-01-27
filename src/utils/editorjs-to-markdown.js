/**
 * Editor.js to Markdown Converter
 *
 * Converts Editor.js JSON format to raw markdown text.
 * Used for lazy migration when opening notes stored in Editor.js format.
 */

// ========================================
// Block Converters
// ========================================

/**
 * Convert a paragraph block
 */
function convertParagraph(block) {
  const text = convertInlineFormatting(block.data?.text || '');
  return text;
}

/**
 * Convert a header block
 */
function convertHeader(block) {
  const level = block.data?.level || 2;
  const text = convertInlineFormatting(block.data?.text || '');
  return '#'.repeat(level) + ' ' + text;
}

/**
 * Convert a list block (nested list)
 */
function convertList(block) {
  const style = block.data?.style || 'unordered';
  const items = block.data?.items || [];
  return convertListItems(items, style, 0);
}

/**
 * Recursively convert list items with nesting
 */
function convertListItems(items, style, indent) {
  const lines = [];
  const prefix = '  '.repeat(indent);

  items.forEach((item, index) => {
    // Handle both string items and object items (nested list format)
    let content, children;
    if (typeof item === 'string') {
      content = item;
      children = [];
    } else {
      content = item.content || '';
      children = item.items || [];
    }

    const text = convertInlineFormatting(content);
    const marker = style === 'ordered' ? `${index + 1}.` : '-';
    lines.push(`${prefix}${marker} ${text}`);

    // Handle nested items
    if (children.length > 0) {
      lines.push(convertListItems(children, style, indent + 1));
    }
  });

  return lines.join('\n');
}

/**
 * Convert a checklist block
 */
function convertChecklist(block) {
  const items = block.data?.items || [];
  return items.map(item => {
    const checked = item.checked ? 'x' : ' ';
    const text = convertInlineFormatting(item.text || '');
    return `- [${checked}] ${text}`;
  }).join('\n');
}

/**
 * Convert a quote block
 */
function convertQuote(block) {
  const text = convertInlineFormatting(block.data?.text || '');
  const caption = block.data?.caption || '';

  const lines = text.split('\n').map(line => `> ${line}`);
  if (caption) {
    lines.push(`> — ${convertInlineFormatting(caption)}`);
  }

  return lines.join('\n');
}

/**
 * Convert a code block
 */
function convertCode(block) {
  const code = block.data?.code || '';
  const language = block.data?.language || '';
  return '```' + language + '\n' + code + '\n```';
}

/**
 * Convert a delimiter block
 */
function convertDelimiter() {
  return '---';
}

/**
 * Convert a table block
 */
function convertTable(block) {
  const content = block.data?.content || [];
  const withHeadings = block.data?.withHeadings ?? true;

  if (content.length === 0) return '';

  const lines = [];

  content.forEach((row, rowIndex) => {
    const cells = row.map(cell => convertInlineFormatting(cell || ''));
    lines.push('| ' + cells.join(' | ') + ' |');

    // Add header separator after first row if withHeadings
    if (rowIndex === 0 && withHeadings) {
      lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
    }
  });

  return lines.join('\n');
}

/**
 * Convert a warning/callout block
 */
function convertWarning(block) {
  const title = block.data?.title || 'Warning';
  const message = convertInlineFormatting(block.data?.message || '');
  return `> **${title}**\n> ${message}`;
}

/**
 * Convert an embed block
 */
function convertEmbed(block) {
  const service = block.data?.service || '';
  const source = block.data?.source || block.data?.embed || '';
  const caption = block.data?.caption || '';

  if (!source) return '';

  let result = `[${service || 'Embed'}](${source})`;
  if (caption) {
    result += `\n*${convertInlineFormatting(caption)}*`;
  }
  return result;
}

/**
 * Convert a toggle block
 */
function convertToggle(block) {
  const text = convertInlineFormatting(block.data?.text || '');
  const items = block.data?.items || [];

  const lines = [`<details>`, `<summary>${text}</summary>`, ''];

  items.forEach(item => {
    lines.push(convertInlineFormatting(item));
  });

  lines.push('', '</details>');
  return lines.join('\n');
}

/**
 * Convert a link tool block
 */
function convertLinkTool(block) {
  const link = block.data?.link || '';
  const meta = block.data?.meta || {};
  const title = meta.title || link;

  return `[${title}](${link})`;
}

// ========================================
// Inline Formatting Converter
// ========================================

/**
 * Convert inline HTML formatting to markdown
 */
function convertInlineFormatting(html) {
  if (!html) return '';

  let text = html;

  // Bold: <b> or <strong>
  text = text.replace(/<(b|strong)>(.*?)<\/\1>/gi, '**$2**');

  // Italic: <i> or <em>
  text = text.replace(/<(i|em)>(.*?)<\/\1>/gi, '*$2*');

  // Underline: <u> - no standard markdown, preserve as HTML or convert to bold
  // We'll just strip it for now
  text = text.replace(/<\/?u>/gi, '');

  // Strikethrough: <s> or <strike> or <del>
  text = text.replace(/<(s|strike|del)>(.*?)<\/\1>/gi, '~~$2~~');

  // Inline code: <code>
  text = text.replace(/<code>(.*?)<\/code>/gi, '`$1`');

  // Links: <a href="...">text</a>
  text = text.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Mark/highlight: <mark> - convert to ==text== (some markdown flavors support this)
  text = text.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '==$1==');

  // Subscript/superscript - strip for now
  text = text.replace(/<su[bp]>(.*?)<\/su[bp]>/gi, '$1');

  // Break tags
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  return text;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

// ========================================
// Main Converter
// ========================================

/**
 * Block type to converter mapping
 */
const blockConverters = {
  paragraph: convertParagraph,
  header: convertHeader,
  list: convertList,
  checklist: convertChecklist,
  quote: convertQuote,
  code: convertCode,
  delimiter: convertDelimiter,
  table: convertTable,
  warning: convertWarning,
  embed: convertEmbed,
  toggle: convertToggle,
  linkTool: convertLinkTool
};

/**
 * Convert Editor.js JSON to markdown
 * @param {string|Object} editorJsData - Editor.js data (JSON string or object)
 * @returns {string} Markdown text
 */
export function convert(editorJsData) {
  // Parse if string
  let data;
  if (typeof editorJsData === 'string') {
    try {
      data = JSON.parse(editorJsData);
    } catch (e) {
      console.warn('Failed to parse Editor.js JSON:', e);
      return editorJsData; // Return as-is if not valid JSON
    }
  } else {
    data = editorJsData;
  }

  // Validate structure
  if (!data || !Array.isArray(data.blocks)) {
    console.warn('Invalid Editor.js data structure');
    return '';
  }

  // Convert each block
  const markdownBlocks = [];

  for (const block of data.blocks) {
    const converter = blockConverters[block.type];

    if (converter) {
      const markdown = converter(block);
      if (markdown) {
        markdownBlocks.push(markdown);
      }
    } else {
      // Unknown block type - try to extract text
      console.warn(`Unknown Editor.js block type: ${block.type}`);
      if (block.data?.text) {
        markdownBlocks.push(convertInlineFormatting(block.data.text));
      }
    }
  }

  // Join blocks with double newlines (markdown paragraph separation)
  return markdownBlocks.join('\n\n');
}

/**
 * Check if content is in Editor.js format
 * @param {string} content - Content to check
 * @returns {boolean}
 */
export function isEditorJsFormat(content) {
  if (!content || typeof content !== 'string') return false;
  try {
    const parsed = JSON.parse(content);
    return parsed && Array.isArray(parsed.blocks);
  } catch {
    return false;
  }
}

/**
 * Check if content is markdown (not Editor.js JSON)
 * @param {string} content - Content to check
 * @returns {boolean}
 */
export function isMarkdownFormat(content) {
  if (!content || typeof content !== 'string') return true; // Empty is treated as markdown
  return !isEditorJsFormat(content);
}

// ========================================
// Exports
// ========================================

export default {
  convert,
  isEditorJsFormat,
  isMarkdownFormat
};
