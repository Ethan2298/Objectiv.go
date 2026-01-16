/**
 * Markdown Format Module
 *
 * Handles parsing and serialization of objective markdown files.
 * Format: YAML frontmatter + Markdown body
 */

// ========================================
// YAML Frontmatter Utilities
// ========================================

/**
 * Parse YAML frontmatter from markdown content
 * Returns { frontmatter: object, body: string }
 */
export function parseYamlFrontmatter(content) {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = match[1];
  const body = match[2];

  // Simple YAML parser (handles our specific format)
  const frontmatter = parseSimpleYaml(yamlContent);

  return { frontmatter, body };
}

/**
 * Simple YAML parser for our specific format
 * Handles: strings, numbers, arrays of objects, nested objects
 */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split(/\r?\n/);
  let currentKey = null;
  let currentArray = null;
  let currentArrayItem = null;
  let currentObject = null; // For nested objects like nextStep
  let currentObjectKey = null;

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Array item start (- key: value or just -)
    const arrayItemMatch = line.match(/^(\s*)- (.*)$/);
    if (arrayItemMatch && currentArray !== null) {
      // Save previous array item
      if (currentArrayItem) {
        result[currentArray].push(currentArrayItem);
      }
      currentArrayItem = {};
      currentObject = null;
      currentObjectKey = null;

      // Check if there's inline content
      const inlineContent = arrayItemMatch[2].trim();
      if (inlineContent) {
        const colonIdx = inlineContent.indexOf(':');
        if (colonIdx > 0) {
          const key = inlineContent.substring(0, colonIdx).trim();
          const value = inlineContent.substring(colonIdx + 1).trim();
          currentArrayItem[key] = parseValue(value);
        }
      }
      continue;
    }

    // Nested object property (2-space indent, key: value) - for objects like nextStep
    const nestedObjPropMatch = line.match(/^  (\w+):\s*(.*)$/);
    if (nestedObjPropMatch && currentObject !== null && currentArray === null) {
      const key = nestedObjPropMatch[1];
      const value = nestedObjPropMatch[2].trim();
      currentObject[key] = parseValue(value);
      continue;
    }

    // Array item property (indented key: value)
    const arrayPropMatch = line.match(/^\s{4,}(\w+):\s*(.*)$/);
    if (arrayPropMatch && currentArrayItem) {
      const key = arrayPropMatch[1];
      const value = arrayPropMatch[2].trim();
      currentArrayItem[key] = parseValue(value);
      continue;
    }

    // Top-level key: value
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyValueMatch) {
      // Save any pending array item
      if (currentArray && currentArrayItem) {
        result[currentArray].push(currentArrayItem);
        currentArrayItem = null;
      }

      const key = keyValueMatch[1];
      const value = keyValueMatch[2].trim();

      // Check if this is an array or object start (empty value)
      if (value === '') {
        // Look ahead to determine if it's an array or object
        const lineIdx = lines.indexOf(line);
        const nextLine = lines[lineIdx + 1] || '';
        if (nextLine.trim().startsWith('-')) {
          // It's an array
          currentArray = key;
          result[key] = [];
          currentArrayItem = null;
          currentObject = null;
          currentObjectKey = null;
        } else {
          // It's a nested object
          currentObject = {};
          currentObjectKey = key;
          result[key] = currentObject;
          currentArray = null;
          currentArrayItem = null;
        }
      } else {
        currentArray = null;
        currentObject = null;
        currentObjectKey = null;
        result[key] = parseValue(value);
      }
      currentKey = key;
    }
  }

  // Save final array item
  if (currentArray && currentArrayItem) {
    result[currentArray].push(currentArrayItem);
  }

  return result;
}

/**
 * Parse a YAML value (string, number, boolean)
 */
function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;

  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

/**
 * Stringify data to YAML frontmatter format
 */
export function stringifyYamlFrontmatter(data) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === 'object') {
          const entries = Object.entries(item);
          if (entries.length > 0) {
            lines.push(`  - ${entries[0][0]}: ${formatValue(entries[0][1])}`);
            for (let i = 1; i < entries.length; i++) {
              lines.push(`    ${entries[i][0]}: ${formatValue(entries[i][1])}`);
            }
          }
        } else {
          lines.push(`  - ${formatValue(item)}`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      // Nested object (like nextStep)
      lines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        lines.push(`  ${subKey}: ${formatValue(subValue)}`);
      }
    } else {
      lines.push(`${key}: ${formatValue(value)}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Format a value for YAML output
 */
function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') {
    // Quote if contains special chars
    if (value.includes(':') || value.includes('#') || value.includes('\n')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

// ========================================
// Slugify
// ========================================

/**
 * Convert a name to a valid filename slug
 */
export function slugify(name) {
  if (!name) return 'untitled';

  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')      // Spaces to hyphens
    .replace(/-+/g, '-')       // Multiple hyphens to single
    .replace(/^-|-$/g, '')     // Trim hyphens from ends
    || 'untitled';
}

// ========================================
// Parse Objective from Markdown
// ========================================

/**
 * Parse a markdown file into an objective data structure
 */
export function parseObjectiveMarkdown(content) {
  const { frontmatter, body } = parseYamlFrontmatter(content);

  // Parse the markdown body
  const lines = body.split(/\r?\n/);

  let objectiveName = '';
  let objectiveDescription = '';
  const priorities = [];
  const steps = [];

  let currentSection = 'description'; // 'description', 'priorities', 'steps'
  let currentPriority = null;
  let descriptionLines = [];
  let priorityDescLines = [];

  for (const line of lines) {
    // H1 = Objective name
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      objectiveName = h1Match[1].trim();
      continue;
    }

    // H2 = Section header
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const sectionName = h2Match[1].trim().toLowerCase();

      // Save current priority description
      if (currentPriority && priorityDescLines.length > 0) {
        currentPriority.description = priorityDescLines.join('\n').trim();
        priorityDescLines = [];
      }

      // Save objective description
      if (currentSection === 'description' && descriptionLines.length > 0) {
        objectiveDescription = descriptionLines.join('\n').trim();
      }

      if (sectionName === 'priorities') {
        currentSection = 'priorities';
      } else if (sectionName === 'steps' || sectionName === 'activity log') {
        currentSection = 'steps';
      }
      continue;
    }

    // H3 under Priorities = Priority name
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match && currentSection === 'priorities') {
      // Save previous priority description
      if (currentPriority && priorityDescLines.length > 0) {
        currentPriority.description = priorityDescLines.join('\n').trim();
        priorityDescLines = [];
      }

      const priorityName = h3Match[1].trim();
      const priorityIndex = priorities.length;

      // Get ID and clarity from frontmatter
      const frontmatterPriority = frontmatter.priorities?.[priorityIndex] || {};

      currentPriority = {
        id: frontmatterPriority.id || generateId(),
        name: priorityName,
        description: ''
      };
      priorities.push(currentPriority);
      continue;
    }

    // List item under Steps = Step entry
    // Parse: - [timestamp] Step name [with optional status/duration suffix]
    const stepMatch = line.match(/^-\s+\[(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\]\s*(.+)$/);
    if (stepMatch && currentSection === 'steps') {
      const timestamp = stepMatch[1];
      // Strip any status indicators from step name (✓, ⏸, duration suffix)
      const rawStepName = stepMatch[2].trim();
      const stepName = rawStepName.replace(/\s*[✓⏸]\s*(\d+[hm]\d*[m]?)?$/, '').replace(/\s*\(\d+[hm]\d*[m]?\)$/, '').trim();
      const stepIndex = steps.length;

      // Get metadata from frontmatter
      const frontmatterStep = frontmatter.steps?.[stepIndex] || {};

      // Build step with new fields, with backwards compatibility
      const step = {
        id: frontmatterStep.id || generateId(),
        name: stepName || rawStepName,
        loggedAt: parseTimestamp(timestamp),
        orderNumber: stepIndex + 1,
        // Status: default to 'completed' for legacy steps (logged steps were implicitly done)
        // Never load as 'active' - convert to 'paused' for safety
        status: frontmatterStep.status === 'active' ? 'paused' : (frontmatterStep.status || 'completed'),
        // Elapsed: prefer new field, fall back to old duration field
        elapsed: frontmatterStep.elapsed ?? frontmatterStep.duration ?? 0,
        // Timestamps
        startedAt: frontmatterStep.startedAt || null,
        completedAt: frontmatterStep.completedAt || null
      };
      steps.push(step);
      continue;
    }

    // Collect description lines
    if (currentSection === 'description') {
      descriptionLines.push(line);
    } else if (currentSection === 'priorities' && currentPriority) {
      priorityDescLines.push(line);
    }
  }

  // Save final priority description
  if (currentPriority && priorityDescLines.length > 0) {
    currentPriority.description = priorityDescLines.join('\n').trim();
  }

  // Save objective description if not already saved
  if (!objectiveDescription && descriptionLines.length > 0) {
    objectiveDescription = descriptionLines.join('\n').trim();
  }

  // Parse nextStep from frontmatter
  let nextStep = null;
  if (frontmatter.nextStep) {
    nextStep = {
      text: frontmatter.nextStep.text || '',
      elapsedSeconds: frontmatter.nextStep.elapsedSeconds || 0,
      isRunning: false // Always start paused when loading
    };
  }

  return {
    id: frontmatter.id || generateId(),
    name: objectiveName,
    description: objectiveDescription,
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
    priorities,
    steps,
    nextStep
  };
}

/**
 * Parse a timestamp string to ISO format
 */
function parseTimestamp(timestamp) {
  // Handle "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" or just "YYYY-MM-DD"
  const parts = timestamp.split(/\s+/);
  const datePart = parts[0];
  const timePart = parts[1] || '00:00:00';

  // Ensure time has seconds
  const timeParts = timePart.split(':');
  const hours = timeParts[0] || '00';
  const minutes = timeParts[1] || '00';
  const seconds = timeParts[2] || '00';

  return `${datePart}T${hours}:${minutes}:${seconds}Z`;
}

/**
 * Generate a unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ========================================
// Serialize Objective to Markdown
// ========================================

/**
 * Serialize an objective to markdown format
 */
export function serializeObjective(objective) {
  const now = new Date().toISOString();

  // Build frontmatter data
  const frontmatterData = {
    id: objective.id,
    createdAt: objective.createdAt || now,
    updatedAt: now
  };

  // Add nextStep if present
  if (objective.nextStep && (objective.nextStep.text || objective.nextStep.elapsedSeconds > 0)) {
    frontmatterData.nextStep = {
      text: objective.nextStep.text || '',
      elapsedSeconds: objective.nextStep.elapsedSeconds || 0
    };
  }

  // Add priorities metadata
  if (objective.priorities && objective.priorities.length > 0) {
    frontmatterData.priorities = objective.priorities.map(p => ({
      id: p.id
    }));
  }

  // Add steps metadata
  if (objective.steps && objective.steps.length > 0) {
    frontmatterData.steps = objective.steps.map(s => {
      const stepMeta = {
        id: s.id,
        loggedAt: s.loggedAt
      };
      // Status: never persist 'active' - convert to 'paused' for safety
      const status = s.status === 'active' ? 'paused' : (s.status || 'pending');
      if (status && status !== 'pending') {
        stepMeta.status = status;
      }
      // Include elapsed time if present (renamed from duration)
      if (s.elapsed && s.elapsed > 0) {
        stepMeta.elapsed = s.elapsed;
      } else if (s.duration && s.duration > 0) {
        // Backwards compat: migrate old duration field
        stepMeta.elapsed = s.duration;
      }
      // Include timestamps if present
      if (s.startedAt) {
        stepMeta.startedAt = s.startedAt;
      }
      if (s.completedAt) {
        stepMeta.completedAt = s.completedAt;
      }
      return stepMeta;
    });
  }

  // Build markdown body
  const bodyLines = [];

  // H1: Objective name
  bodyLines.push(`# ${objective.name || 'Untitled Objective'}`);
  bodyLines.push('');

  // Description
  if (objective.description) {
    bodyLines.push(objective.description);
    bodyLines.push('');
  }

  // Priorities section
  if (objective.priorities && objective.priorities.length > 0) {
    bodyLines.push('## Priorities');
    bodyLines.push('');

    for (const priority of objective.priorities) {
      bodyLines.push(`### ${priority.name || 'Untitled Priority'}`);
      if (priority.description) {
        bodyLines.push(priority.description);
      }
      bodyLines.push('');
    }
  }

  // Steps section
  if (objective.steps && objective.steps.length > 0) {
    bodyLines.push('## Steps');
    bodyLines.push('');

    for (const step of objective.steps) {
      const timestamp = formatTimestamp(step.loggedAt);
      const name = step.name || 'Step';

      // Build status indicator and duration suffix
      let suffix = '';
      const elapsed = step.elapsed || step.duration || 0;
      const status = step.status || 'completed';

      if (status === 'completed') {
        suffix = elapsed > 0 ? ` ✓ ${formatDuration(elapsed)}` : ' ✓';
      } else if (status === 'paused') {
        suffix = elapsed > 0 ? ` ⏸ ${formatDuration(elapsed)}` : ' ⏸';
      } else if (status === 'pending' && elapsed > 0) {
        suffix = ` (${formatDuration(elapsed)})`;
      }

      bodyLines.push(`- [${timestamp}] ${name}${suffix}`);
    }
    bodyLines.push('');
  }

  // Combine frontmatter and body
  const frontmatter = stringifyYamlFrontmatter(frontmatterData);
  const body = bodyLines.join('\n');

  return `${frontmatter}\n${body}`;
}

/**
 * Format an ISO timestamp for display in markdown
 */
function formatTimestamp(isoString) {
  if (!isoString) return new Date().toISOString().slice(0, 16).replace('T', ' ');

  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString.slice(0, 16).replace('T', ' ');
  }
}

/**
 * Format elapsed seconds as human-readable duration
 * Examples: 45 -> "45s", 90 -> "1m", 3600 -> "1h", 5400 -> "1h30m"
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${secs}s`;
  }
}

// ========================================
// Exports
// ========================================

export default {
  parseYamlFrontmatter,
  stringifyYamlFrontmatter,
  slugify,
  parseObjectiveMarkdown,
  serializeObjective
};
