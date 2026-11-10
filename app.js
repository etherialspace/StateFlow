/**
 * StateFlow — Developer Scratchpad & Payload Studio
 * Multi-device responsive workspace supporting both Dark & Light themes,
 * Split / Rows / Grid layouts, URL sanitizer, JSON formatter, Case switcher,
 * Math evaluation, Privacy secret masking, and LocalStorage offline sync.
 */

const STORAGE_KEY = 'stateflow_notes_v2';
const LAYOUT_KEY = 'stateflow_layout_v2';
const THEME_KEY = 'stateflow_theme_v2';
const PRIVACY_KEY = 'stateflow_privacy_v2';
const EVENTS_KEY = 'stateflow_events_v2';
const SUPABASE_CONFIG_KEY = 'stateflow_supabase_config_v1';

let cards = [];
let currentFilter = 'ALL';
let currentLayout = 'split'; // Default layout per mockups
let currentTheme = 'dark';
let selectedSplitCardId = null;
let searchQuery = '';
let globalPrivacyMode = false;
let caseCycleIndex = 0;
let pendingConfirmAction = null;
let editingNoteId = null;
let isComposerCollapsed = false;
let eventsLog = [];
let supabaseClient = null;
let currentUser = null;
let authTabMode = 'signin';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_hsenc',
  '_hsmi', 'igshid', 'si', 'ref', 'ref_src', 'mkt_tok'
];

// ============================================================================
// Event Logging
// ============================================================================
function logEvent(action, details) {
  const event = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toLocaleTimeString(),
    action,
    details
  };
  eventsLog.unshift(event);
  if (eventsLog.length > 50) eventsLog.pop();
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(eventsLog));
  } catch (e) {}
}

// ============================================================================
// Toast Notification
// ============================================================================
let toastTimeout = null;
function triggerToast(message) {
  const toast = document.getElementById('toastNotification');
  const msgElem = document.getElementById('toastMessage');
  if (!toast || !msgElem) return;

  msgElem.textContent = message;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 2200);
}

// ============================================================================
// Data Helpers & Classifiers
// ============================================================================
function extractUrlsFromText(text) {
  const regex = /\b((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|dev|app|co|ai|edu|gov|me|gg|sh|xyz)(?:\/[^\s<>()]*)?|localhost:\d+(?:\/[^\s<>()]*)?)/gi;
  const matches = text.match(regex) || [];
  return [...new Set(matches)].map(raw => cleanUrlString(raw));
}

function cleanUrlString(rawUrl) {
  const normalized = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : (rawUrl.startsWith('localhost') ? `http://${rawUrl}` : `https://${rawUrl}`);
  try {
    const u = new URL(normalized);
    const removed = [];
    const params = new URLSearchParams(u.search);
    for (const key of [...params.keys()]) {
      if (TRACKING_PARAMS.includes(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        removed.push(key);
        params.delete(key);
      }
    }
    u.search = params.toString();
    return {
      original: rawUrl,
      clean: u.toString(),
      hostname: u.hostname.replace(/^www\./, ''),
      removedCount: removed.length,
      removedKeys: removed
    };
  } catch (e) {
    return { original: rawUrl, clean: normalized, hostname: 'Link', removedCount: 0, removedKeys: [] };
  }
}

function evaluateMathExpression(text) {
  const singleLine = text.trim();
  if (singleLine.length > 120 || !/^[\d\s+\-*/%^().,MathEPIsqrtcossintanabsfloorceil]+$/i.test(singleLine)) {
    return null;
  }
  if (!/[+\-*/%^]/.test(singleLine)) return null;
  try {
    const sanitized = singleLine.replace(/\^/g, '**');
    const result = Function(`"use strict"; return (${sanitized});`)();
    if (typeof result === 'number' && !Number.isNaN(result) && Number.isFinite(result)) {
      return result;
    }
  } catch (e) {}
  return null;
}

function tryDecodeJwt(text) {
  const match = text.trim().match(/\b(eyJ[A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]*\b/);
  if (!match) return null;
  try {
    const base64 = match[2].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function classifyContent(raw, titleHint = '') {
  const text = (raw || '').trim();
  const title = (titleHint || '').trim();

  // Explicit title hint check
  if (title.startsWith('#include') || title.endsWith('.c') || title.endsWith('.h')) {
    return { type: 'NOTE', subType: 'C Header', filename: 'source.c', language: 'c' };
  }
  if (title === 't1' || title.endsWith('.js') || text.includes('const testRunner')) {
    return { type: 'CODE', subType: 'JS Snippet', filename: 'testRunner.js', language: 'javascript' };
  }

  // 1. JSON
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      const count = Array.isArray(parsed) ? `${parsed.length} items` : `${Object.keys(parsed).length} keys`;
      return { type: 'JSON', subType: count, filename: 'payload.json', language: 'json', parsed };
    } catch (e) {}
  }

  // 2. JWT / Secrets
  const jwtDecoded = tryDecodeJwt(text);
  if (jwtDecoded) {
    return { type: 'SECRET', subType: 'JWT Token', filename: 'token.jwt', language: 'jwt', jwtPayload: jwtDecoded };
  }
  const secretPatterns = [
    /ghp_[A-Za-z0-9]{30,}/,
    /sk_live_[A-Za-z0-9]{20,}/,
    /rnd_[A-Za-z0-9]{20,}/,
    /AIza[0-9A-Za-z-_]{35}/,
    /(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{12,}["']?/i
  ];
  if (secretPatterns.some(p => p.test(text))) {
    return { type: 'SECRET', subType: 'Credentials', filename: 'secrets.env', language: 'shell' };
  }

  // 3. Tasks / Checklist
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const explicitBoxes = lines.filter(l => /^([-*•]?\s*\[[ xX]\]|todo:|action:)/i.test(l));
  if (lines.length > 0 && explicitBoxes.length >= 1) {
    return { type: 'TASKS', subType: `${explicitBoxes.length} tasks`, filename: 'tasks.md', language: 'markdown' };
  }

  // 4. URLs
  const urls = extractUrlsFromText(text);
  if (urls.length > 0 && (urls.length >= lines.length / 2 || urls.length >= 2)) {
    const trackingCount = urls.reduce((sum, u) => sum + u.removedCount, 0);
    return {
      type: 'URL',
      subType: trackingCount > 0 ? `${trackingCount} tracking stripped` : `${urls.length} link(s)`,
      filename: 'links.txt',
      language: 'text',
      urls
    };
  }

  // 5. Code
  if (/^(?:import\s+|export\s+|const\s+|let\s+|var\s+|function\s+|class\s+|#include|def\s+|public\s+class)/m.test(text) ||
      text.includes('=>') || text.includes('async ()') || text.includes('console.log')) {
    const isC = text.includes('#include') || text.includes('printf(') || text.includes('int main(');
    const isPy = text.includes('def ') || text.includes('import ') && text.includes(':');
    const lang = isC ? 'c' : (isPy ? 'python' : 'javascript');
    const fn = isC ? 'source.c' : (isPy ? 'script.py' : 'script.js');
    return { type: 'CODE', subType: isC ? 'C Header' : 'JS Snippet', filename: fn, language: lang };
  }

  // 6. Math
  const mathResult = evaluateMathExpression(text);
  if (mathResult !== null) {
    return { type: 'NOTE', subType: `Math: ${mathResult}`, filename: 'calc.txt', language: 'text', mathResult };
  }

  // 7. CSV / Tables
  if (lines.length >= 2) {
    const commaCounts = lines.map(l => (l.match(/,/g) || []).length);
    if (commaCounts[0] >= 1 && commaCounts.every(c => c === commaCounts[0])) {
      return { type: 'TABLE', subType: `${lines.length} rows CSV`, filename: 'data.csv', language: 'csv' };
    }
  }

  // Default: Note
  return { type: 'NOTE', subType: 'Text Note', filename: 'note.txt', language: 'text' };
}

function formatRelativeTime(ts) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  return `${days}d ago`;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskSecretString(str) {
  return (str || '').replace(/(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]{20,}/g, '$1••••••••••••')
    .replace(/(sk_live_[A-Za-z0-9]{4})[A-Za-z0-9]{16,}/g, '$1••••••••••••')
    .replace(/(rnd_[A-Za-z0-9]{4})[A-Za-z0-9]{16,}/g, '$1••••••••••••')
    .replace(/(AIza[0-9A-Za-z-_]{4})[0-9A-Za-z-_]{30,}/g, '$1••••••••••••')
    .replace(/((?:API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*["']?)[A-Za-z0-9_\-./+=]{6,}/gi, '$1••••••••••••');
}

// ============================================================================
// Syntax Highlighter for Code Canvas & Previews
// ============================================================================
function highlightSyntax(code, lang) {
  const escaped = escapeHtml(code);
  const lines = escaped.split('\n');

  return lines.map((line) => {
    // Comments
    let formatted = line.replace(/(\/\/.*$)/, '<span class="syntax-comment">$1</span>');
    // Preprocessor (#include)
    formatted = formatted.replace(/(#include\s+)(&lt;[^&]+&gt;|"[^"]+")/, '<span class="syntax-keyword">$1</span><span class="syntax-string">$2</span>');
    // Keywords
    formatted = formatted.replace(/\b(const|let|var|function|return|async|await|class|import|from|export|if|else|try|catch|new|typeof)\b/g, '<span class="syntax-keyword">$1</span>');
    // Numbers
    formatted = formatted.replace(/\b(\d+)\b/g, '<span class="syntax-number">$1</span>');
    return formatted;
  });
}

// ============================================================================
// Default Initial Cards (matching user mockups exactly)
// ============================================================================
function getDefaultDemoCards() {
  const now = Date.now();
  return [
    {
      id: 'demo-c-header',
      title: '#include<string.h>',
      content: '#include <string.h>\n// Standard C library for string manipulation\n',
      pinned: false,
      createdAt: now - 24 * 3600 * 1000 // 1d ago
    },
    {
      id: 'demo-t1',
      title: 't1',
      content: 'const testRunner = async () => {\n  console.log("Running suite...");\n  return true;\n}',
      pinned: false,
      createdAt: now - 48 * 3600 * 1000 // 2d ago
    }
  ];
}

// ============================================================================
// State Loading & Saving
// ============================================================================
function loadState() {
  try {
    const savedCards = localStorage.getItem(STORAGE_KEY);
    if (savedCards) {
      cards = JSON.parse(savedCards);
    } else {
      cards = getDefaultDemoCards();
      saveCardsToStorage();
    }
  } catch (e) {
    cards = getDefaultDemoCards();
  }

  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) {
    currentTheme = savedTheme;
  }

  const savedLayout = localStorage.getItem(LAYOUT_KEY);
  if (savedLayout) {
    currentLayout = savedLayout;
  }

  const savedPrivacy = localStorage.getItem(PRIVACY_KEY);
  if (savedPrivacy !== null) {
    globalPrivacyMode = savedPrivacy === 'true';
  }

  try {
    const savedEvents = localStorage.getItem(EVENTS_KEY);
    if (savedEvents) eventsLog = JSON.parse(savedEvents);
  } catch (e) {}

  if (cards.length > 0 && !selectedSplitCardId) {
    selectedSplitCardId = cards[0].id;
  }

  applyThemeUI();
  applyPrivacyUI();
  applyLayoutUI();
  renderBoard();
  updateCounters();
}

function saveCardsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (e) {}
}

// ============================================================================
// Theme Management (Dark / Light)
// ============================================================================
function applyThemeUI() {
  const html = document.documentElement;
  const isDark = currentTheme === 'dark';

  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  // Desktop header theme button
  const desktopBtn = document.getElementById('themeToggleBtn');
  const themeLabel = document.getElementById('themeToggleLabel');
  const themeIcon = document.getElementById('themeToggleIcon');
  if (themeLabel) {
    themeLabel.textContent = isDark ? 'Dark' : 'Light';
  }
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
    themeIcon.className = isDark ? 'w-3.5 h-3.5 text-brand-400' : 'w-3.5 h-3.5 text-amber-500';
  }

  // Mobile header theme icon
  const mobileIcon = document.getElementById('mobileThemeIcon');
  if (mobileIcon) {
    mobileIcon.textContent = isDark ? 'dark_mode' : 'light_mode';
    mobileIcon.className = isDark ? 'material-symbols-outlined text-[19px] text-brand-400' : 'material-symbols-outlined text-[19px] text-amber-500';
  }

  lucide.createIcons();
}

function toggleContrastTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, currentTheme);
  applyThemeUI();
  renderBoard();
  logEvent('Theme Switched', `Active theme: ${currentTheme}`);
  triggerToast(`Switched to ${currentTheme === 'dark' ? 'Dark' : 'Light'} theme`);
}

// ============================================================================
// Privacy Mode Management
// ============================================================================
function applyPrivacyUI() {
  const label = document.getElementById('privacyBtnLabel');
  if (label) {
    label.textContent = globalPrivacyMode ? 'Privacy: Masked' : 'Privacy: Local Only';
  }
  const mobIcon = document.getElementById('mobilePrivacyIcon');
  if (mobIcon) {
    mobIcon.className = globalPrivacyMode
      ? 'material-symbols-outlined text-[19px] text-amber-400'
      : 'material-symbols-outlined text-[19px] text-emerald-500';
  }
}

function togglePrivacyMode() {
  globalPrivacyMode = !globalPrivacyMode;
  localStorage.setItem(PRIVACY_KEY, globalPrivacyMode ? 'true' : 'false');
  applyPrivacyUI();
  renderBoard();
  logEvent('Privacy Mode', globalPrivacyMode ? 'Secrets masked' : 'Secrets visible');
  triggerToast(globalPrivacyMode ? 'Privacy Mode: Secrets Masked' : 'Privacy Mode: Secrets Revealed');
}

// ============================================================================
// Layout Switcher (Rows, Grid, Split)
// ============================================================================
function applyLayoutUI() {
  const btns = {
    rows: document.getElementById('viewRowsBtn'),
    grid: document.getElementById('viewGridBtn'),
    split: document.getElementById('viewSplitBtn')
  };

  const activeClassDark = 'bg-white dark:bg-brand-600/30 text-brand-700 dark:text-brand-300 border border-slate-200/80 dark:border-brand-500/40 shadow-sm';
  const inactiveClass = 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';

  Object.entries(btns).forEach(([layout, btn]) => {
    if (!btn) return;
    if (layout === currentLayout) {
      btn.className = `layout-toggle-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${activeClassDark} transition-colors`;
    } else {
      btn.className = `layout-toggle-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${inactiveClass} transition-colors`;
    }
  });
}

function setLayout(layout) {
  currentLayout = layout;
  localStorage.setItem(LAYOUT_KEY, layout);
  applyLayoutUI();
  renderBoard();
  logEvent('Layout Changed', `Switched layout to ${layout}`);
}

// ============================================================================
// Filter Stream
// ============================================================================
function setFilter(filter) {
  currentFilter = filter;
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => {
    const f = pill.getAttribute('data-filter');
    if (f === filter) {
      pill.className = 'filter-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white shadow-sm shrink-0';
    } else {
      pill.className = 'filter-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-dark-card hover:bg-slate-50 dark:hover:bg-dark-cardHover border border-surface-border dark:border-dark-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs shrink-0';
    }
  });

  renderBoard();
}

function updateCounters() {
  const counts = {
    ALL: cards.length,
    PINNED: cards.filter(c => c.pinned).length,
    TASKS: 0,
    URL: 0,
    JSON: 0,
    SECRET: 0,
    TABLE: 0,
    NOTE: 0
  };

  cards.forEach(c => {
    const meta = classifyContent(c.content, c.title);
    if (counts[meta.type] !== undefined) {
      counts[meta.type]++;
    } else {
      counts.NOTE++;
    }
  });

  const map = {
    countAll: counts.ALL,
    countPinned: counts.PINNED,
    countTasks: counts.TASKS,
    countUrl: counts.URL,
    countJson: counts.JSON,
    countSecret: counts.SECRET,
    countTable: counts.TABLE,
    countNote: counts.NOTE
  };

  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

// ============================================================================
// Composer Actions (+ Checklist, Clean URLs, Format JSON, Case, Math/Calc)
// ============================================================================
function composerInsertCheckbox() {
  const ta = document.getElementById('noteBodyInput');
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;

  if (start !== end) {
    const selected = text.substring(start, end);
    const converted = selected.split('\n').map(l => l.startsWith('- [ ] ') ? l : `- [ ] ${l}`).join('\n');
    ta.value = text.substring(0, start) + converted + text.substring(end);
  } else {
    const prefix = (start > 0 && text[start - 1] !== '\n') ? '\n- [ ] ' : '- [ ] ';
    ta.value = text.substring(0, start) + prefix + text.substring(end);
    ta.selectionStart = ta.selectionEnd = start + prefix.length;
  }
  ta.focus();
  updateComposerStats();
  triggerToast('Inserted checklist task');
}

function composerCleanUrls() {
  const ta = document.getElementById('noteBodyInput');
  if (!ta) return;
  const text = ta.value;
  const urls = extractUrlsFromText(text);

  if (urls.length === 0) {
    triggerToast('No URLs detected in note');
    return;
  }

  let updated = text;
  let totalStripped = 0;
  urls.forEach(u => {
    if (u.removedCount > 0) {
      updated = updated.replace(u.original, u.clean);
      totalStripped += u.removedCount;
    }
  });

  ta.value = updated;
  updateComposerStats();
  logEvent('Clean URLs', `Removed ${totalStripped} tracking params from ${urls.length} link(s)`);
  triggerToast(`Cleaned ${urls.length} URL(s) (${totalStripped} params removed)`);
}

function composerFormatJson() {
  const ta = document.getElementById('noteBodyInput');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) {
    triggerToast('Note body is empty');
    return;
  }

  try {
    const parsed = JSON.parse(text);
    ta.value = JSON.stringify(parsed, null, 2);
    updateComposerStats();
    logEvent('Format JSON', 'Prettified JSON structure');
    triggerToast('JSON formatted successfully');
  } catch (err) {
    triggerToast(`Invalid JSON: ${err.message.slice(0, 32)}`);
  }
}

function composerCycleCase() {
  const ta = document.getElementById('noteBodyInput');
  if (!ta) return;
  const text = ta.value;
  if (!text.trim()) return;

  const modes = ['lower', 'UPPER', 'Title', 'camel'];
  const mode = modes[caseCycleIndex % modes.length];
  caseCycleIndex++;

  let result = text;
  if (mode === 'lower') {
    result = text.toLowerCase();
  } else if (mode === 'UPPER') {
    result = text.toUpperCase();
  } else if (mode === 'Title') {
    result = text.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  } else if (mode === 'camel') {
    result = text.replace(/([-_ ][a-z])/gi, ($1) => $1.toUpperCase().replace(/[-_ ]/, ''));
  }

  ta.value = result;
  updateComposerStats();
  triggerToast(`Case converted: ${mode}`);
}

function composerEvaluateMath() {
  const ta = document.getElementById('noteBodyInput');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;

  const mathRes = evaluateMathExpression(text);
  if (mathRes !== null) {
    ta.value = `${text} = ${mathRes}`;
    updateComposerStats();
    logEvent('Math Calc', `Calculated: ${mathRes}`);
    triggerToast(`Evaluated: ${mathRes}`);
    return;
  }

  // Scan multiple lines for math
  const lines = text.split('\n');
  let solved = 0;
  const newLines = lines.map(line => {
    const m = evaluateMathExpression(line);
    if (m !== null && !line.includes('=')) {
      solved++;
      return `${line} = ${m}`;
    }
    return line;
  });

  if (solved > 0) {
    ta.value = newLines.join('\n');
    updateComposerStats();
    triggerToast(`Calculated ${solved} expression(s)`);
  } else {
    triggerToast('No valid math expression found');
  }
}

function updateComposerStats() {
  const ta = document.getElementById('noteBodyInput');
  const titleInput = document.getElementById('noteTitleInput');
  const wordsEl = document.getElementById('wordCountLabel');
  const charsEl = document.getElementById('charCountLabel');
  const autoDetect = document.getElementById('autoDetectBadge');

  if (!ta) return;
  const text = ta.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;

  if (wordsEl) wordsEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
  if (charsEl) charsEl.textContent = `${chars} chars`;

  if (autoDetect) {
    const meta = classifyContent(text, titleInput ? titleInput.value : '');
    autoDetect.textContent = words > 0 ? `${meta.type} • ${meta.subType}` : 'Auto-detect mode';
  }
}

function toggleComposerCollapse() {
  const body = document.getElementById('composerBodyContainer');
  const icon = document.getElementById('collapseComposerIcon');
  if (!body || !icon) return;

  isComposerCollapsed = !isComposerCollapsed;
  if (isComposerCollapsed) {
    body.classList.add('hidden');
    icon.textContent = 'expand_more';
  } else {
    body.classList.remove('hidden');
    icon.textContent = 'expand_less';
  }
}

// ============================================================================
// Add / Save Note
// ============================================================================
function addScratchCard() {
  const titleInput = document.getElementById('noteTitleInput');
  const bodyInput = document.getElementById('noteBodyInput');
  const pinInput = document.getElementById('pinNoteCheckbox');

  const title = (titleInput ? titleInput.value : '').trim();
  const content = (bodyInput ? bodyInput.value : '').trim();
  const pinned = pinInput ? pinInput.checked : false;

  if (!title && !content) {
    triggerToast('Please enter a note title or content');
    if (titleInput) titleInput.focus();
    return;
  }

  // If in edit mode, update existing card
  if (editingNoteId) {
    const target = cards.find(c => c.id === editingNoteId);
    if (target) {
      target.title = title || 'Untitled Note';
      target.content = content;
      target.pinned = pinned;
      target.updatedAt = Date.now();
      saveCardsToStorage();
      syncCardToCloud(target);
      logEvent('Note Updated', `Updated "${target.title}"`);
      triggerToast('Note updated successfully');
      editingNoteId = null;
      document.getElementById('saveNoteBtnText').textContent = 'Save Note';
    }
  } else {
    // New card
    const newCard = {
      id: 'card-' + Date.now(),
      title: title || (content ? content.slice(0, 32) : 'Untitled Note'),
      content: content,
      pinned: pinned,
      createdAt: Date.now()
    };

    if (pinned) {
      cards.unshift(newCard);
    } else {
      const firstUnpinnedIndex = cards.findIndex(c => !c.pinned);
      if (firstUnpinnedIndex === -1) {
        cards.push(newCard);
      } else {
        cards.splice(firstUnpinnedIndex, 0, newCard);
      }
    }

    selectedSplitCardId = newCard.id;
    saveCardsToStorage();
    syncCardToCloud(newCard);
    logEvent('Note Saved', `Created "${newCard.title}"`);
    triggerToast('Note saved successfully');
  }

  // Reset inputs
  if (titleInput) titleInput.value = '';
  if (bodyInput) bodyInput.value = '';
  if (pinInput) pinInput.checked = false;
  updateComposerStats();

  renderBoard();
  updateCounters();
}

// ============================================================================
// Card Operations (Pin, Copy, Delete, Run, Convert, Edit)
// ============================================================================
function togglePinCard(id, event) {
  if (event) event.stopPropagation();
  const card = cards.find(c => c.id === id);
  if (!card) return;
  card.pinned = !card.pinned;

  // Re-sort: pinned first
  cards.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  saveCardsToStorage();
  syncCardToCloud(card);
  updateCounters();
  renderBoard();
  logEvent('Pin Toggled', `Note "${card.title}" ${card.pinned ? 'pinned' : 'unpinned'}`);
  triggerToast(card.pinned ? 'Note pinned to top' : 'Note unpinned');
}

function copyCardContent(id, event) {
  if (event) event.stopPropagation();
  const card = cards.find(c => c.id === id);
  if (!card) return;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(card.content).then(() => {
      logEvent('Content Copied', `Copied "${card.title}"`);
      triggerToast('Payload copied to clipboard');
    }).catch(() => fallbackCopy(card.content));
  } else {
    fallbackCopy(card.content);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  triggerToast('Payload copied to clipboard');
}

function deleteCard(id, event) {
  if (event) event.stopPropagation();
  const idx = cards.findIndex(c => c.id === id);
  if (idx === -1) return;
  const deleted = cards.splice(idx, 1)[0];
  saveCardsToStorage();
  deleteCardFromCloud(deleted.id);

  if (selectedSplitCardId === id) {
    selectedSplitCardId = cards.length > 0 ? cards[0].id : null;
  }

  updateCounters();
  renderBoard();
  logEvent('Note Deleted', `Deleted "${deleted.title}"`);
  triggerToast('Note deleted');
}

function editCardInComposer(id, event) {
  if (event) event.stopPropagation();
  const card = cards.find(c => c.id === id);
  if (!card) return;

  const titleInput = document.getElementById('noteTitleInput');
  const bodyInput = document.getElementById('noteBodyInput');
  const pinInput = document.getElementById('pinNoteCheckbox');
  const saveBtnText = document.getElementById('saveNoteBtnText');

  if (titleInput) titleInput.value = card.title;
  if (bodyInput) bodyInput.value = card.content;
  if (pinInput) pinInput.checked = card.pinned;
  if (saveBtnText) saveBtnText.textContent = 'Update Note';

  editingNoteId = card.id;

  if (isComposerCollapsed) {
    toggleComposerCollapse();
  }

  if (titleInput) {
    titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => titleInput.focus(), 250);
  }
  triggerToast('Note loaded into editor');
}

function convertCardToTasks(id, event) {
  if (event) event.stopPropagation();
  const card = cards.find(c => c.id === id);
  if (!card) return;

  const lines = card.content.split('\n');
  const taskLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (/^[-*•]?\s*\[[ xX]\]/i.test(trimmed)) return line;
    return `- [ ] ${trimmed}`;
  });

  card.content = taskLines.join('\n');
  saveCardsToStorage();
  syncCardToCloud(card);
  updateCounters();
  renderBoard();
  logEvent('Converted to Checklist', `Card "${card.title}"`);
  triggerToast('Converted to interactive checklist');
}

function runCodeSnippet(id, event) {
  if (event) event.stopPropagation();
  const card = cards.find(c => c.id === id);
  if (!card) return;

  try {
    const result = Function(`"use strict"; ${card.content}`)();
    logEvent('Executed Snippet', `Run: ${card.title} -> ${result}`);
    triggerToast(`Snippet executed: ${result !== undefined ? String(result) : 'Success'}`);
  } catch (err) {
    triggerToast(`Execution error: ${err.message}`);
  }
}

function selectSplitCard(id) {
  selectedSplitCardId = id;
  renderBoard();
}

// ============================================================================
// Render Board (Split, Rows, Grid)
// ============================================================================
function renderBoard() {
  const container = document.getElementById('workspaceContentArea');
  if (!container) return;

  // Filter cards
  let visibleCards = [...cards];

  if (currentFilter === 'PINNED') {
    visibleCards = visibleCards.filter(c => c.pinned);
  } else if (currentFilter !== 'ALL') {
    visibleCards = visibleCards.filter(c => {
      const meta = classifyContent(c.content, c.title);
      return meta.type === currentFilter;
    });
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    visibleCards = visibleCards.filter(c => {
      return (c.title || '').toLowerCase().includes(q) || (c.content || '').toLowerCase().includes(q);
    });
  }

  // Ensure a card is selected for Split View
  if (visibleCards.length > 0 && !visibleCards.some(c => c.id === selectedSplitCardId)) {
    selectedSplitCardId = visibleCards[0].id;
  }

  if (visibleCards.length === 0) {
    container.innerHTML = `
      <div class="w-full py-16 flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-white dark:bg-dark-card border border-dashed border-surface-border dark:border-dark-border">
        <span class="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-600 mb-3">folder_open</span>
        <h4 class="text-base font-semibold text-slate-800 dark:text-slate-200 font-mono">No matching notes</h4>
        <p class="text-xs text-slate-500 max-w-sm mt-1">Try clearing your search query or creating a new entry above.</p>
        <button onclick="clearSearch()" class="mt-4 px-4 py-2 rounded-xl text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20">Clear Search Filter</button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  if (currentLayout === 'split') {
    renderSplitLayout(container, visibleCards);
  } else if (currentLayout === 'rows') {
    renderRowsLayout(container, visibleCards);
  } else {
    renderGridLayout(container, visibleCards);
  }

  lucide.createIcons();
}

// ----------------------------------------------------------------------------
// 1. Split Layout (4 cols list + 8 cols inspector)
// ----------------------------------------------------------------------------
function renderSplitLayout(container, visibleCards) {
  const selectedCard = cards.find(c => c.id === selectedSplitCardId) || visibleCards[0];
  const selectedMeta = selectedCard ? classifyContent(selectedCard.content, selectedCard.title) : null;

  let leftCardsHtml = visibleCards.map(c => {
    const isSelected = c.id === selectedCard.id;
    const meta = classifyContent(c.content, c.title);
    const byteSize = new Blob([c.content]).size;
    const timeAgo = formatRelativeTime(c.createdAt);
    const contentPreview = escapeHtml(c.content.trim().split('\n')[0] || c.title);

    const borderClasses = isSelected
      ? 'border-2 border-brand-500/80 shadow-sm dark:shadow-glow-sm'
      : 'border border-surface-border dark:border-dark-border hover:border-slate-300 dark:hover:border-slate-700';

    return `
      <article
        onclick="selectSplitCard('${c.id}')"
        class="group relative rounded-xl bg-white dark:bg-dark-card ${borderClasses} p-4 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-dark-cardHover"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${c.pinned ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}"></span>
            <span class="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20">${meta.type}</span>
          </div>
          <span class="text-[11px] font-mono text-slate-400 dark:text-slate-500">${timeAgo}</span>
        </div>
        <h3 class="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate mb-1">
          ${escapeHtml(c.title)}
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
          ${contentPreview}
        </p>
        <div class="mt-3 pt-2.5 border-t border-surface-border dark:border-dark-border flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <span class="text-[11px] font-mono text-slate-500">${byteSize} bytes • ${meta.subType}</span>
          <div class="flex items-center gap-1">
            <button onclick="togglePinCard('${c.id}', event)" class="p-1 hover:text-brand-600 dark:hover:text-brand-400 rounded transition-colors" title="${c.pinned ? 'Unpin' : 'Pin'}">
              <i class="w-3.5 h-3.5 ${c.pinned ? 'text-amber-500' : ''}" data-lucide="pin"></i>
            </button>
            <button onclick="copyCardContent('${c.id}', event)" class="p-1 hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition-colors" title="Quick copy">
              <i class="w-3.5 h-3.5" data-lucide="copy"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Inspector Right Column
  let inspectorHtml = '';
  if (selectedCard && selectedMeta) {
    const rawContent = globalPrivacyMode ? maskSecretString(selectedCard.content) : selectedCard.content;
    const syntaxLines = highlightSyntax(rawContent, selectedMeta.language);
    const lineCount = rawContent.split('\n').length;
    const byteSize = new Blob([rawContent]).size;

    const lineNumsHtml = syntaxLines.map((_, i) => `<div>${i + 1}</div>`).join('');
    const codeContentHtml = syntaxLines.map(l => `<div>${l || '&nbsp;'}</div>`).join('');

    inspectorHtml = `
      <div class="lg:col-span-8 rounded-2xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border overflow-hidden shadow-sm dark:shadow-2xl" data-purpose="note-editor-inspector">
        <!-- Note Header & Toolbar -->
        <div class="px-5 sm:px-6 py-4 border-b border-surface-border dark:border-dark-border flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-surface-subtle/50 dark:bg-dark-surface/60">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-glow-emerald shrink-0"></span>
            <span class="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20 shrink-0">${selectedMeta.type}</span>
            <h2 class="text-base font-semibold text-slate-900 dark:text-white font-mono tracking-tight truncate">
              ${escapeHtml(selectedCard.title)}
            </h2>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="togglePinCard('${selectedCard.id}')" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-dark-surface hover:bg-slate-50 dark:hover:bg-dark-border border border-surface-border dark:border-dark-border rounded-lg transition-colors shadow-xs">
              <i class="w-3.5 h-3.5 ${selectedCard.pinned ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}" data-lucide="pin"></i>
              <span>${selectedCard.pinned ? 'Pinned' : 'Pin'}</span>
            </button>
            <button onclick="copyCardContent('${selectedCard.id}')" class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-all active:scale-95 shadow-xs">
              <i class="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" data-lucide="copy"></i>
              <span>Copy</span>
            </button>
            <button onclick="deleteCard('${selectedCard.id}')" class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100/70 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/30 rounded-lg transition-colors">
              <i class="w-3.5 h-3.5" data-lucide="trash-2"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>

        <!-- Editor Code Canvas Area -->
        <div class="p-4 sm:p-6">
          <div class="relative rounded-xl bg-slate-50 dark:bg-dark-surface/90 border border-surface-border dark:border-dark-border font-mono text-sm overflow-hidden">
            <!-- Code Canvas Top Bar -->
            <div class="px-4 py-2 bg-slate-100/80 dark:bg-dark-base/70 border-b border-surface-border dark:border-dark-border flex items-center justify-between text-xs text-slate-500">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-400 dark:bg-red-500/70 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-400 dark:bg-yellow-500/70 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 dark:bg-green-500/70 inline-block"></span>
                <span class="ml-2 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-400">${selectedMeta.filename}</span>
              </div>
              <span class="text-[11px] font-mono text-slate-400 dark:text-slate-500">UTF-8 • CRLF</span>
            </div>

            <!-- Code Body with Line Numbers -->
            <div class="p-4 flex gap-4 min-h-[160px] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
              <div class="line-num font-mono text-xs space-y-1 select-none">
                ${lineNumsHtml}
              </div>
              <div class="flex-1 font-mono text-xs md:text-sm space-y-1">
                ${codeContentHtml}
              </div>
            </div>
          </div>
        </div>

        <!-- Note Detail Footer: Edit & Convert Actions -->
        <div class="px-5 sm:px-6 py-3.5 bg-surface-subtle/50 dark:bg-dark-surface/40 border-t border-surface-border dark:border-dark-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-3 sm:gap-4 text-slate-500 font-mono text-[11px]">
            <span>Payload: <strong class="text-slate-800 dark:text-slate-300">${byteSize} Bytes</strong></span>
            <span>Lines: <strong class="text-slate-800 dark:text-slate-300">${lineCount}</strong></span>
            <span>Encoding: <strong class="text-slate-800 dark:text-slate-300">ASCII</strong></span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="editCardInComposer('${selectedCard.id}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-dark-card hover:bg-slate-50 dark:hover:bg-dark-cardHover border border-surface-border dark:border-dark-border transition-colors font-medium shadow-xs">
              <i class="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" data-lucide="edit-3"></i>
              <span>Edit Note</span>
            </button>
            <button onclick="convertCardToTasks('${selectedCard.id}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-dark-card hover:bg-slate-50 dark:hover:bg-dark-cardHover border border-surface-border dark:border-dark-border transition-colors font-medium shadow-xs">
              <i class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" data-lucide="check-square"></i>
              <span>To Checklist</span>
            </button>
            ${selectedMeta.type === 'CODE' ? `
            <button onclick="runCodeSnippet('${selectedCard.id}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-brand-700 dark:text-brand-300 hover:text-brand-900 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-500/40 transition-colors font-medium shadow-xs">
              <i class="w-3.5 h-3.5" data-lucide="play"></i>
              <span>Run</span>
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" data-purpose="split-view-workspace">
      <!-- Left Column: Item List (4 Cols) -->
      <div class="lg:col-span-4 space-y-3" data-purpose="notes-list-column">
        ${leftCardsHtml}
        <!-- New Item Placeholder Button -->
        <button
          onclick="focusComposer()"
          class="w-full py-3.5 rounded-xl border border-dashed border-slate-300 dark:border-dark-border hover:border-brand-500 hover:bg-white dark:hover:bg-dark-card/40 text-slate-500 hover:text-brand-700 dark:hover:text-slate-300 transition-all flex items-center justify-center gap-2 text-xs font-mono font-medium"
        >
          <i class="w-4 h-4" data-lucide="plus-circle"></i>
          <span>Create New Entry</span>
        </button>
      </div>

      <!-- Right Column: Inspector (8 Cols) -->
      ${inspectorHtml}
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 2. Rows Layout (Render-style full-width rows)
// ----------------------------------------------------------------------------
function renderRowsLayout(container, visibleCards) {
  const rowsHtml = visibleCards.map(c => {
    const meta = classifyContent(c.content, c.title);
    const byteSize = new Blob([c.content]).size;
    const timeAgo = formatRelativeTime(c.createdAt);
    const contentPreview = escapeHtml(c.content.trim().slice(0, 160));

    return `
      <article class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition-all">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <span class="w-2 h-2 rounded-full ${c.pinned ? 'bg-amber-400' : 'bg-emerald-500'} mt-1.5 shrink-0"></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.2 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20">${meta.type}</span>
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">${escapeHtml(c.title)}</h3>
              <span class="text-[11px] font-mono text-slate-400 dark:text-slate-500 ml-auto md:ml-2">${timeAgo}</span>
            </div>
            <p class="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">${contentPreview}</p>
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-surface-border dark:border-dark-border">
          <span class="text-[11px] font-mono text-slate-500">${byteSize}B • ${meta.subType}</span>
          <div class="flex items-center gap-1.5">
            <button onclick="togglePinCard('${c.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 dark:hover:text-white bg-slate-100 dark:bg-dark-surface" title="Pin note">
              <i class="w-3.5 h-3.5 ${c.pinned ? 'text-amber-500' : ''}" data-lucide="pin"></i>
            </button>
            <button onclick="copyCardContent('${c.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 dark:hover:text-white bg-slate-100 dark:bg-dark-surface" title="Copy payload">
              <i class="w-3.5 h-3.5" data-lucide="copy"></i>
            </button>
            <button onclick="editCardInComposer('${c.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 dark:hover:text-white bg-slate-100 dark:bg-dark-surface" title="Edit note">
              <i class="w-3.5 h-3.5" data-lucide="edit-3"></i>
            </button>
            <button onclick="deleteCard('${c.id}')" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title="Delete note">
              <i class="w-3.5 h-3.5" data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col space-y-3">
      ${rowsHtml}
      <button
        onclick="focusComposer()"
        class="w-full py-3.5 rounded-xl border border-dashed border-slate-300 dark:border-dark-border hover:border-brand-500 hover:bg-white dark:hover:bg-dark-card/40 text-slate-500 hover:text-brand-700 dark:hover:text-slate-300 transition-all flex items-center justify-center gap-2 text-xs font-mono font-medium"
      >
        <i class="w-4 h-4" data-lucide="plus-circle"></i>
        <span>Create New Entry</span>
      </button>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 3. Grid Layout (Responsive 2 / 3 columns)
// ----------------------------------------------------------------------------
function renderGridLayout(container, visibleCards) {
  const gridHtml = visibleCards.map(c => {
    const meta = classifyContent(c.content, c.title);
    const byteSize = new Blob([c.content]).size;
    const timeAgo = formatRelativeTime(c.createdAt);
    const contentPreview = escapeHtml(c.content.trim().slice(0, 200));

    return `
      <article class="flex flex-col rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition-all overflow-hidden">
        <div class="p-4 flex items-center justify-between border-b border-surface-border dark:border-dark-border bg-surface-subtle/40 dark:bg-dark-surface/40">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full ${c.pinned ? 'bg-amber-400' : 'bg-emerald-500'} shrink-0"></span>
            <span class="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.2 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20">${meta.type}</span>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">${escapeHtml(c.title)}</h3>
          </div>
          <span class="text-[11px] font-mono text-slate-400 shrink-0 ml-2">${timeAgo}</span>
        </div>
        <div class="p-4 flex-1 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-5">
          ${contentPreview}
        </div>
        <div class="px-4 py-3 border-t border-surface-border dark:border-dark-border flex items-center justify-between text-xs text-slate-400">
          <span class="text-[11px] font-mono text-slate-500">${byteSize}B • ${meta.subType}</span>
          <div class="flex items-center gap-1">
            <button onclick="togglePinCard('${c.id}')" class="p-1 hover:text-brand-600 dark:hover:text-brand-400" title="Pin">
              <i class="w-3.5 h-3.5 ${c.pinned ? 'text-amber-500' : ''}" data-lucide="pin"></i>
            </button>
            <button onclick="copyCardContent('${c.id}')" class="p-1 hover:text-emerald-600 dark:hover:text-emerald-400" title="Copy">
              <i class="w-3.5 h-3.5" data-lucide="copy"></i>
            </button>
            <button onclick="editCardInComposer('${c.id}')" class="p-1 hover:text-brand-600 dark:hover:text-brand-400" title="Edit">
              <i class="w-3.5 h-3.5" data-lucide="edit-3"></i>
            </button>
            <button onclick="deleteCard('${c.id}')" class="p-1 text-rose-500 hover:text-rose-700" title="Delete">
              <i class="w-3.5 h-3.5" data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  container.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${gridHtml}
    </div>
    <div class="mt-4">
      <button
        onclick="focusComposer()"
        class="w-full py-3.5 rounded-xl border border-dashed border-slate-300 dark:border-dark-border hover:border-brand-500 hover:bg-white dark:hover:bg-dark-card/40 text-slate-500 hover:text-brand-700 dark:hover:text-slate-300 transition-all flex items-center justify-center gap-2 text-xs font-mono font-medium"
      >
        <i class="w-4 h-4" data-lucide="plus-circle"></i>
        <span>Create New Entry</span>
      </button>
    </div>
  `;
}

function focusComposer() {
  const titleInput = document.getElementById('noteTitleInput');
  if (isComposerCollapsed) {
    toggleComposerCollapse();
  }
  if (titleInput) {
    titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => titleInput.focus(), 250);
  }
}

function clearSearch() {
  searchQuery = '';
  const d = document.getElementById('desktopSearchInput');
  const m = document.getElementById('mobileSearchInput');
  if (d) d.value = '';
  if (m) m.value = '';
  renderBoard();
}

// ============================================================================
// Export Operations
// ============================================================================
function toggleExportDropdown() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.classList.toggle('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const trigger = document.getElementById('exportDropdownTrigger');
  const menu = document.getElementById('exportDropdownMenu');
  if (menu && !menu.classList.contains('hidden') && trigger && !trigger.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

function generateWorkspaceMarkdown() {
  let md = `# StateFlow Workspace Digest\n`;
  md += `Exported: ${new Date().toISOString()} • Total Notes: ${cards.length}\n\n`;

  cards.forEach((c, i) => {
    const meta = classifyContent(c.content, c.title);
    md += `## ${i + 1}. ${c.title} [${meta.type}]\n`;
    md += `- Status: ${c.pinned ? 'Pinned' : 'Active'}\n`;
    md += `- Created: ${new Date(c.createdAt).toLocaleString()}\n\n`;
    md += `\`\`\`${meta.language || ''}\n${c.content}\n\`\`\`\n\n---\n\n`;
  });
  return md;
}

function openExportModal() {
  const modal = document.getElementById('exportModal');
  const ta = document.getElementById('exportMarkdownArea');
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.classList.add('hidden');

  if (ta) ta.value = generateWorkspaceMarkdown();
  if (modal) modal.classList.remove('hidden');
  logEvent('Export Opened', 'Generated workspace markdown');
}

function closeExportModal() {
  const modal = document.getElementById('exportModal');
  if (modal) modal.classList.add('hidden');
}

function copyExportAreaMarkdown() {
  const ta = document.getElementById('exportMarkdownArea');
  if (!ta) return;
  navigator.clipboard.writeText(ta.value).then(() => {
    triggerToast('Markdown copied to clipboard');
    closeExportModal();
  });
}

function copyAllMarkdownDigest() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.classList.add('hidden');
  const md = generateWorkspaceMarkdown();
  navigator.clipboard.writeText(md).then(() => {
    triggerToast('All notes copied as Markdown');
  });
}

function downloadMarkdownFile() {
  const menu = document.getElementById('exportDropdownMenu');
  if (menu) menu.classList.add('hidden');
  const md = generateWorkspaceMarkdown();
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StateFlow-Digest-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  triggerToast('Markdown file downloaded');
  closeExportModal();
}

// ============================================================================
// Clear Unpinned Notes Confirmation
// ============================================================================
function requestSweepUnpinned() {
  const unpinnedCount = cards.filter(c => !c.pinned).length;
  if (unpinnedCount === 0) {
    triggerToast('No unpinned notes to clear');
    return;
  }
  const modal = document.getElementById('confirmModal');
  const body = document.getElementById('confirmModalBody');
  if (body) {
    body.textContent = `Remove ${unpinnedCount} unpinned note(s) from your workspace? Pinned notes will be safely kept.`;
  }
  if (modal) modal.classList.remove('hidden');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.classList.add('hidden');
}

function confirmModalProceed() {
  const beforeCount = cards.length;
  cards = cards.filter(c => c.pinned);
  const removed = beforeCount - cards.length;
  saveCardsToStorage();
  updateCounters();
  renderBoard();
  closeConfirmModal();
  logEvent('Cleared Unpinned', `Removed ${removed} card(s)`);
  triggerToast(`Cleared ${removed} unpinned note(s)`);
}

// ============================================================================
// Telemetry & Modals (Status, Events)
// ============================================================================
function openStatsModal() {
  const modal = document.getElementById('statsModal');
  if (!modal) return;
  const activeEl = document.getElementById('statActiveNotes');
  const pinnedEl = document.getElementById('statPinnedNotes');
  const sizeEl = document.getElementById('statPayloadSize');

  const totalBytes = cards.reduce((sum, c) => sum + new Blob([c.content]).size, 0);
  if (activeEl) activeEl.textContent = cards.length;
  if (pinnedEl) pinnedEl.textContent = cards.filter(c => c.pinned).length;
  if (sizeEl) sizeEl.textContent = `${totalBytes} Bytes (~${(totalBytes / 1024).toFixed(2)} KB)`;

  modal.classList.remove('hidden');
}

function closeStatsModal() {
  const modal = document.getElementById('statsModal');
  if (modal) modal.classList.add('hidden');
}

function openEventsModal() {
  const modal = document.getElementById('eventsModal');
  const container = document.getElementById('eventsLogContainer');
  if (!modal || !container) return;

  if (eventsLog.length === 0) {
    container.innerHTML = `<p class="text-slate-500 italic">No events logged yet.</p>`;
  } else {
    container.innerHTML = eventsLog.map(e => `
      <div class="flex items-center justify-between py-1 border-b border-surface-border dark:border-dark-border">
        <div class="flex items-center gap-2">
          <span class="text-brand-500 font-semibold">[${e.timestamp}]</span>
          <span class="text-slate-800 dark:text-slate-200">${escapeHtml(e.action)}</span>
        </div>
        <span class="text-slate-400 text-[10px] truncate max-w-[140px]">${escapeHtml(e.details || '')}</span>
      </div>
    `).join('');
  }

  modal.classList.remove('hidden');
}

function closeEventsModal() {
  const modal = document.getElementById('eventsModal');
  if (modal) modal.classList.add('hidden');
}

function clearEventsLog() {
  eventsLog = [];
  try {
    localStorage.removeItem(EVENTS_KEY);
  } catch (e) {}
  openEventsModal();
  triggerToast('Events log cleared');
}

// ============================================================================
// Mobile Navigation Tab Switcher
// ============================================================================
function mobileNavSelect(tab) {
  const mobScratch = document.getElementById('mobNavScratchpad');
  const mobSnippets = document.getElementById('mobNavSnippets');

  if (tab === 'scratchpad') {
    setFilter('ALL');
    if (mobScratch) mobScratch.className = 'flex flex-col items-center justify-center w-14 h-12 transition-colors text-brand-600 dark:text-brand-400 font-semibold';
    if (mobSnippets) mobSnippets.className = 'flex flex-col items-center justify-center w-14 h-12 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
  } else if (tab === 'snippets') {
    setFilter('CODE');
    if (mobSnippets) mobSnippets.className = 'flex flex-col items-center justify-center w-14 h-12 transition-colors text-brand-600 dark:text-brand-400 font-semibold';
    if (mobScratch) mobScratch.className = 'flex flex-col items-center justify-center w-14 h-12 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
  }
}

// ============================================================================
// Supabase Authentication & Real-Time Cloud Sync
// ============================================================================

function getStoredSupabaseConfig() {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function initSupabase() {
  const config = getStoredSupabaseConfig();
  if (!config || !config.url || !config.key) {
    updateUserUI();
    return;
  }

  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(config.url, config.key);

      // Check active session
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          currentUser = session.user;
          updateUserUI();
          syncNotesFromCloud();
        }
      });

      // Listen for session auth changes
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        currentUser = session?.user || null;
        updateUserUI();
        if (event === 'SIGNED_IN' && currentUser) {
          logEvent('User Signed In', currentUser.email || 'Google User');
          triggerToast(`Signed in as ${currentUser.email || 'User'}`);
          await syncNotesFromCloud();
        } else if (event === 'SIGNED_OUT') {
          logEvent('User Signed Out', '');
          triggerToast('Signed out of cloud account');
          renderBoard();
        }
      });
    }
  } catch (err) {
    console.error('Supabase init failed:', err);
  }
}

function updateUserUI() {
  const desktopBtnText = document.getElementById('desktopAuthBtnText');
  const desktopBtnIcon = document.getElementById('desktopAuthIcon');
  const mobileInitial = document.getElementById('mobileUserInitial');
  const userDropdownEmail = document.getElementById('userDropdownEmail');
  const userSyncStatus = document.getElementById('userSyncStatus');

  if (currentUser) {
    const displayName = currentUser.user_metadata?.full_name || currentUser.email || 'Account';
    const initial = (displayName.charAt(0) || 'U').toUpperCase();

    if (desktopBtnText) desktopBtnText.textContent = displayName.split(' ')[0] || displayName.split('@')[0];
    if (desktopBtnIcon) desktopBtnIcon.setAttribute('data-lucide', 'user-check');
    if (mobileInitial) mobileInitial.textContent = initial;
    if (userDropdownEmail) userDropdownEmail.textContent = currentUser.email || displayName;
    if (userSyncStatus) userSyncStatus.textContent = 'Cloud Synced';
  } else {
    if (desktopBtnText) desktopBtnText.textContent = 'Sign In';
    if (desktopBtnIcon) desktopBtnIcon.setAttribute('data-lucide', 'log-in');
    if (mobileInitial) mobileInitial.textContent = 'person';
    if (userSyncStatus) userSyncStatus.textContent = 'Offline (Local)';
  }
  lucide.createIcons();
}

function handleUserButtonPress() {
  if (currentUser) {
    const menu = document.getElementById('userDropdownMenu');
    if (menu) menu.classList.toggle('hidden');
  } else {
    openAuthModal();
  }
}

// Close user dropdown when clicking outside
document.addEventListener('click', (e) => {
  const container = document.getElementById('desktopAuthContainer');
  const menu = document.getElementById('userDropdownMenu');
  if (menu && !menu.classList.contains('hidden') && container && !container.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
}

function setAuthTab(mode) {
  authTabMode = mode;
  const tabIn = document.getElementById('authTabSignIn');
  const tabUp = document.getElementById('authTabSignUp');
  const btn = document.getElementById('authSubmitBtn');

  if (mode === 'signin') {
    if (tabIn) tabIn.className = 'flex-1 py-1.5 rounded-lg font-semibold bg-white dark:bg-dark-card text-brand-600 dark:text-brand-400 shadow-xs';
    if (tabUp) tabUp.className = 'flex-1 py-1.5 rounded-lg text-slate-500 dark:text-slate-400';
    if (btn) btn.textContent = 'Sign In';
  } else {
    if (tabUp) tabUp.className = 'flex-1 py-1.5 rounded-lg font-semibold bg-white dark:bg-dark-card text-brand-600 dark:text-brand-400 shadow-xs';
    if (tabIn) tabIn.className = 'flex-1 py-1.5 rounded-lg text-slate-500 dark:text-slate-400';
    if (btn) btn.textContent = 'Create Account';
  }
}

async function handleGoogleSignIn() {
  if (!supabaseClient) {
    closeAuthModal();
    openCloudSettingsModal();
    triggerToast('Please configure your Supabase keys first');
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
  } catch (err) {
    triggerToast(`Google sign-in error: ${err.message}`);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) {
    closeAuthModal();
    openCloudSettingsModal();
    triggerToast('Please configure your Supabase keys first');
    return;
  }

  const email = document.getElementById('authEmailInput')?.value.trim();
  const password = document.getElementById('authPasswordInput')?.value;
  if (!email || !password) return;

  const btn = document.getElementById('authSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Authenticating...';
  }

  try {
    if (authTabMode === 'signin') {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      closeAuthModal();
      triggerToast('Signed in successfully');
      updateUserUI();
      await syncNotesFromCloud();
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      closeAuthModal();
      triggerToast('Account created! Please check your email to confirm');
    }
  } catch (err) {
    triggerToast(`Auth error: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = authTabMode === 'signin' ? 'Sign In' : 'Create Account';
    }
  }
}

async function handleSignOut() {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.classList.add('hidden');

  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {}
  }
  currentUser = null;
  updateUserUI();
  triggerToast('Signed out of cloud account');
}

// ----------------------------------------------------------------------------
// Cloud Database Sync: Upsert & Delete
// ----------------------------------------------------------------------------
async function syncCardToCloud(card) {
  if (!supabaseClient || !currentUser) return;

  try {
    await supabaseClient.from('notes').upsert({
      id: card.id,
      user_id: currentUser.id,
      title: card.title,
      content: card.content,
      pinned: !!card.pinned,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Cloud note sync error:', err);
  }
}

async function deleteCardFromCloud(cardId) {
  if (!supabaseClient || !currentUser) return;

  try {
    await supabaseClient.from('notes').delete().eq('id', cardId);
  } catch (err) {
    console.error('Cloud note delete error:', err);
  }
}

async function syncNotesFromCloud() {
  if (!supabaseClient || !currentUser) {
    triggerToast('Sign in to sync notes with the cloud');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('notes')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      const cloudCards = data.map(n => ({
        id: n.id,
        title: n.title,
        content: n.content || '',
        pinned: !!n.pinned,
        createdAt: new Date(n.created_at).getTime()
      }));

      // Merge cloud cards with local cards (keep newest)
      const mergedMap = new Map();
      cloudCards.forEach(c => mergedMap.set(c.id, c));
      cards.forEach(c => {
        if (!mergedMap.has(c.id)) {
          mergedMap.set(c.id, c);
          syncCardToCloud(c); // push local-only note up to cloud
        }
      });

      cards = Array.from(mergedMap.values()).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      saveCardsToStorage();
      if (cards.length > 0 && !selectedSplitCardId) selectedSplitCardId = cards[0].id;
      renderBoard();
      updateCounters();
      triggerToast(`Synced ${cards.length} note(s) with cloud`);
    } else if (cards.length > 0) {
      // First time cloud user: upload existing local notes to cloud!
      for (const c of cards) {
        await syncCardToCloud(c);
      }
      triggerToast(`Uploaded ${cards.length} local note(s) to cloud`);
    }
  } catch (err) {
    triggerToast(`Cloud sync error: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// Cloud Settings Modal (Configure Supabase Keys)
// ----------------------------------------------------------------------------
function openCloudSettingsModal() {
  const modal = document.getElementById('cloudSettingsModal');
  const urlIn = document.getElementById('cfgSupabaseUrl');
  const keyIn = document.getElementById('cfgSupabaseKey');
  const cfg = getStoredSupabaseConfig();

  if (urlIn) urlIn.value = cfg?.url || '';
  if (keyIn) keyIn.value = cfg?.key || '';
  if (modal) modal.classList.remove('hidden');
}

function closeCloudSettingsModal() {
  const modal = document.getElementById('cloudSettingsModal');
  if (modal) modal.classList.add('hidden');
}

function saveCloudConfig() {
  const urlIn = document.getElementById('cfgSupabaseUrl')?.value.trim();
  const keyIn = document.getElementById('cfgSupabaseKey')?.value.trim();

  if (!urlIn || !keyIn) {
    triggerToast('Please provide both Project URL and Anon Key');
    return;
  }

  const config = { url: urlIn, key: keyIn };
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
  closeCloudSettingsModal();
  initSupabase();
  triggerToast('Connected to Supabase! You can now sign in');
}

function resetCloudConfigToOffline() {
  localStorage.removeItem(SUPABASE_CONFIG_KEY);
  supabaseClient = null;
  currentUser = null;
  updateUserUI();
  closeCloudSettingsModal();
  triggerToast('Reset to Offline Local Storage');
}

// ============================================================================
// Event Listeners & Keyboard Shortcuts
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initSupabase();

  const titleInput = document.getElementById('noteTitleInput');
  const bodyInput = document.getElementById('noteBodyInput');
  const desktopSearch = document.getElementById('desktopSearchInput');
  const mobileSearch = document.getElementById('mobileSearchInput');

  if (bodyInput) {
    bodyInput.addEventListener('input', updateComposerStats);
  }
  if (titleInput) {
    titleInput.addEventListener('input', updateComposerStats);
  }

  // Live search handler
  function handleSearch(e) {
    searchQuery = e.target.value;
    if (e.target === desktopSearch && mobileSearch) mobileSearch.value = searchQuery;
    if (e.target === mobileSearch && desktopSearch) desktopSearch.value = searchQuery;
    renderBoard();
  }

  if (desktopSearch) desktopSearch.addEventListener('input', handleSearch);
  if (mobileSearch) mobileSearch.addEventListener('input', handleSearch);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // / to focus search (when not in input)
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      if (window.innerWidth >= 768 && desktopSearch) desktopSearch.focus();
      else if (mobileSearch) mobileSearch.focus();
    }

    // Ctrl+K or Cmd+K to search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (window.innerWidth >= 768 && desktopSearch) desktopSearch.focus();
      else if (mobileSearch) mobileSearch.focus();
    }

    // Ctrl+N or Cmd+N to create new entry
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      focusComposer();
    }

    // Ctrl+Enter or Cmd+Enter to Save Note
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (document.activeElement === bodyInput || document.activeElement === titleInput) {
        e.preventDefault();
        addScratchCard();
      }
    }

    // Escape to close modals or blur search
    if (e.key === 'Escape') {
      closeExportModal();
      closeConfirmModal();
      closeStatsModal();
      closeEventsModal();
      if (document.activeElement) document.activeElement.blur();
    }
  });
});
