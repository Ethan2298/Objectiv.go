/**
 * History Storage Module
 *
 * localStorage-based browsing history with frecency ranking.
 * Tracks visited URLs and surfaces them in address bar autocomplete.
 */

const STORAGE_KEY = 'objectiv_url_history';
const MAX_HISTORY_ENTRIES = 500;

// ========================================
// Common Sites (fallback suggestions)
// ========================================

const COMMON_SITES = [
  { url: 'https://google.com', title: 'Google', faviconUrl: 'https://www.google.com/favicon.ico' },
  { url: 'https://youtube.com', title: 'YouTube', faviconUrl: 'https://www.youtube.com/favicon.ico' },
  { url: 'https://github.com', title: 'GitHub', faviconUrl: 'https://github.com/favicon.ico' },
  { url: 'https://twitter.com', title: 'Twitter', faviconUrl: 'https://twitter.com/favicon.ico' },
  { url: 'https://reddit.com', title: 'Reddit', faviconUrl: 'https://www.reddit.com/favicon.ico' },
  { url: 'https://stackoverflow.com', title: 'Stack Overflow', faviconUrl: 'https://stackoverflow.com/favicon.ico' },
  { url: 'https://linkedin.com', title: 'LinkedIn', faviconUrl: 'https://www.linkedin.com/favicon.ico' },
  { url: 'https://amazon.com', title: 'Amazon', faviconUrl: 'https://www.amazon.com/favicon.ico' },
  { url: 'https://wikipedia.org', title: 'Wikipedia', faviconUrl: 'https://www.wikipedia.org/favicon.ico' },
  { url: 'https://netflix.com', title: 'Netflix', faviconUrl: 'https://www.netflix.com/favicon.ico' },
  { url: 'https://discord.com', title: 'Discord', faviconUrl: 'https://discord.com/favicon.ico' },
  { url: 'https://twitch.tv', title: 'Twitch', faviconUrl: 'https://www.twitch.tv/favicon.ico' },
  { url: 'https://notion.so', title: 'Notion', faviconUrl: 'https://www.notion.so/favicon.ico' },
  { url: 'https://figma.com', title: 'Figma', faviconUrl: 'https://www.figma.com/favicon.ico' },
  { url: 'https://dribbble.com', title: 'Dribbble', faviconUrl: 'https://dribbble.com/favicon.ico' },
  { url: 'https://spotify.com', title: 'Spotify', faviconUrl: 'https://www.spotify.com/favicon.ico' },
  { url: 'https://gmail.com', title: 'Gmail', faviconUrl: 'https://www.gmail.com/favicon.ico' },
  { url: 'https://docs.google.com', title: 'Google Docs', faviconUrl: 'https://docs.google.com/favicon.ico' },
  { url: 'https://chat.openai.com', title: 'ChatGPT', faviconUrl: 'https://chat.openai.com/favicon.ico' },
  { url: 'https://claude.ai', title: 'Claude', faviconUrl: 'https://claude.ai/favicon.ico' },
];

// ========================================
// Frecency Algorithm
// ========================================

/**
 * Calculate frecency score for a history entry
 * Higher score = more relevant suggestion
 *
 * Based on Firefox's frecency algorithm:
 * score = visitCount × recencyBoost
 */
function calculateFrecency(entry) {
  const now = Date.now();
  const lastVisit = new Date(entry.lastVisitedAt).getTime();
  const hoursSinceVisit = (now - lastVisit) / (1000 * 60 * 60);

  // Recency boost based on how recently visited
  let recencyBoost;
  if (hoursSinceVisit < 4) {
    recencyBoost = 100;      // Last 4 hours
  } else if (hoursSinceVisit < 24) {
    recencyBoost = 90;       // Today
  } else if (hoursSinceVisit < 24 * 7) {
    recencyBoost = 70;       // This week
  } else if (hoursSinceVisit < 24 * 30) {
    recencyBoost = 50;       // This month
  } else if (hoursSinceVisit < 24 * 90) {
    recencyBoost = 30;       // Last 3 months
  } else {
    recencyBoost = 10;       // Older
  }

  // Visit count contributes logarithmically (diminishing returns)
  const visitBoost = Math.log2(entry.visitCount + 1) * 10;

  return (recencyBoost + visitBoost);
}

// ========================================
// Storage Operations
// ========================================

/**
 * Load all history from localStorage
 */
export function loadAllHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const history = JSON.parse(stored);
    return Array.isArray(history) ? history : [];
  } catch (err) {
    console.error('Failed to load history:', err);
    return [];
  }
}

/**
 * Save all history to localStorage
 */
function saveAllHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

/**
 * Normalize URL for comparison (removes trailing slash, www prefix)
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    let normalized = parsed.origin + parsed.pathname + parsed.search;
    // Remove trailing slash for consistency
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Record a visit to a URL
 * Updates existing entry or creates new one
 */
export function recordVisit(url, title, faviconUrl = null) {
  const history = loadAllHistory();
  const normalizedUrl = normalizeUrl(url);
  const now = new Date().toISOString();

  // Find existing entry
  const existingIndex = history.findIndex(h => normalizeUrl(h.url) === normalizedUrl);

  if (existingIndex >= 0) {
    // Update existing entry
    const entry = history[existingIndex];
    entry.visitCount += 1;
    entry.lastVisitedAt = now;
    // Update title/favicon if provided and different
    if (title && title !== entry.title) {
      entry.title = title;
    }
    if (faviconUrl && faviconUrl !== entry.faviconUrl) {
      entry.faviconUrl = faviconUrl;
    }
  } else {
    // Create new entry
    history.push({
      url,
      title: title || url,
      faviconUrl,
      visitCount: 1,
      firstVisitedAt: now,
      lastVisitedAt: now
    });
  }

  // Prune old entries if over limit
  if (history.length > MAX_HISTORY_ENTRIES) {
    // Sort by frecency and keep top entries
    history.sort((a, b) => calculateFrecency(b) - calculateFrecency(a));
    history.length = MAX_HISTORY_ENTRIES;
  }

  saveAllHistory(history);
}

/**
 * Search history by query
 * Returns matches sorted by frecency
 */
export function searchHistory(query, limit = 8) {
  const history = loadAllHistory();
  const lowerQuery = query.toLowerCase();

  // Filter matches (URL or title contains query)
  const matches = history.filter(entry => {
    const urlMatch = entry.url.toLowerCase().includes(lowerQuery);
    const titleMatch = entry.title.toLowerCase().includes(lowerQuery);
    return urlMatch || titleMatch;
  });

  // Sort by frecency (highest first)
  matches.sort((a, b) => calculateFrecency(b) - calculateFrecency(a));

  // Return top results
  return matches.slice(0, limit).map(entry => ({
    ...entry,
    frecency: calculateFrecency(entry)
  }));
}

/**
 * Get suggestions combining history and common sites
 * Used when user starts typing in address bar
 */
export function getSuggestions(query, limit = 8) {
  const lowerQuery = query.toLowerCase();
  const results = [];
  const seenUrls = new Set();

  // First: Add history matches (highest priority)
  const historyMatches = searchHistory(query, limit);
  for (const match of historyMatches) {
    results.push({
      type: 'history',
      ...match
    });
    seenUrls.add(normalizeUrl(match.url));
  }

  // Second: Add common sites that match (if we have room)
  if (results.length < limit) {
    const commonMatches = COMMON_SITES.filter(site => {
      if (seenUrls.has(normalizeUrl(site.url))) return false;
      const urlMatch = site.url.toLowerCase().includes(lowerQuery);
      const titleMatch = site.title.toLowerCase().includes(lowerQuery);
      return urlMatch || titleMatch;
    });

    for (const site of commonMatches) {
      if (results.length >= limit) break;
      results.push({
        type: 'suggestion',
        url: site.url,
        title: site.title,
        faviconUrl: site.faviconUrl,
        visitCount: 0
      });
      seenUrls.add(normalizeUrl(site.url));
    }
  }

  return results;
}

/**
 * Get top frecent sites (for empty query / new tab page)
 */
export function getTopSites(limit = 8) {
  const history = loadAllHistory();

  // Sort by frecency
  history.sort((a, b) => calculateFrecency(b) - calculateFrecency(a));

  const results = history.slice(0, limit).map(entry => ({
    type: 'history',
    ...entry,
    frecency: calculateFrecency(entry)
  }));

  // If not enough history, pad with common sites
  if (results.length < limit) {
    const seenUrls = new Set(results.map(r => normalizeUrl(r.url)));
    for (const site of COMMON_SITES) {
      if (results.length >= limit) break;
      if (seenUrls.has(normalizeUrl(site.url))) continue;
      results.push({
        type: 'suggestion',
        url: site.url,
        title: site.title,
        faviconUrl: site.faviconUrl,
        visitCount: 0
      });
    }
  }

  return results;
}

/**
 * Delete a specific history entry by URL
 */
export function deleteHistoryEntry(url) {
  const history = loadAllHistory();
  const normalizedUrl = normalizeUrl(url);
  const filtered = history.filter(h => normalizeUrl(h.url) !== normalizedUrl);
  saveAllHistory(filtered);
}

/**
 * Clear all history
 */
export function clearAllHistory() {
  saveAllHistory([]);
}

// ========================================
// Default Export
// ========================================

export default {
  loadAllHistory,
  recordVisit,
  searchHistory,
  getSuggestions,
  getTopSites,
  deleteHistoryEntry,
  clearAllHistory
};
