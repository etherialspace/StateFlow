/**
 * StateFlow — Render-Style Developer Workspace Scratchpad
 * Non-sidebar single-page developer UI with horizontal rows.
 */

const STORAGE_KEY = 'slateflow_smart_scratchpad_v1';
const LAYOUT_KEY = 'slateflow_layout_v1';
const THEME_KEY = 'slateflow_contrast_theme_v1';

let cards = [];
let currentFilter = 'ALL';
let currentLayout = 'rows'; // Render-Style Developer UI default
let currentTheme = 'dark';
let selectedSplitCardId = null;
let searchQuery = '';
let globalPrivacyMode = false;
let caseCycleIndex = 0;
let pendingConfirmAction = null;
let editingNoteId = null;
const expandedRowIds = new Set(['demo-tasks', 'demo-url', 'demo-json']);

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_hsenc',
  '_hsmi', 'igshid', 'si', 'ref', 'ref_src', 'mkt_tok'
];

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
  if (!singleLine || singleLine.includes('\n')) return null;
  if (!/^[0-9+\-*/().%\s^]+$/.test(singleLine)) return null;
  if (!/[+\-*/%^]/.test(singleLine)) return null;
  try {
    const sanitized = singleLine.replace(/\^/g, '**');
    const result = Function(`"use strict"; return (${sanitized});`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Number.isInteger(result) ? result.toLocaleString() : Number(result.toFixed(4)).toLocaleString();
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
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.stringify(JSON.parse(jsonPayload), null, 2);
  } catch (e) { return null; }
}

function classifyContent(raw) {
  const text = (raw || '').trim();
  if (!text) return { type: 'NOTE', badge: 'Ready' };

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      const count = Array.isArray(parsed) ? `${parsed.length} items` : `${Object.keys(parsed).length} keys`;
      return { type: 'JSON', badge: `JSON`, countLabel: count, parsed };
    } catch (e) {}
  }

  const jwtDecoded = tryDecodeJwt(text);
  if (jwtDecoded) return { type: 'JSON', badge: 'JWT', countLabel: 'Token', jwtDecoded };

  const secretPatterns = [
    /\b(sk-[a-zA-Z0-9_-]{16,})\b/,
    /\b(ghp_[a-zA-Z0-9]{20,})\b/,
    /\b(AIza[0-9A-Za-z-_]{25,})\b/,
    /\b(xox[baprs]-[0-9a-zA-Z-]{10,})\b/,
    /\b(rnd_[a-zA-Z0-9_-]{16,})\b/,
    /\b(api[_-]?key|secret|password|bearer|token)\s*[:=]\s*\S+/i
  ];
  if (secretPatterns.some(rx => rx.test(text))) return { type: 'SECRET', badge: 'CREDENTIAL', countLabel: 'Secret' };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const explicitBoxes = lines.filter(l => /^([-*•]?\s*\[[ xX]\]|todo:|action:)/i.test(l));
  const bulletTasks = lines.filter(l => /^([-*•]\s+|\d+\.\s+)/.test(l));
  if (explicitBoxes.length >= 1 || (lines.length >= 2 && bulletTasks.length / lines.length >= 0.6)) {
    return { type: 'TASKS', badge: `TASKS`, countLabel: `${lines.length} items` };
  }

  const urls = extractUrlsFromText(text);
  if (urls.length > 0 && lines.length <= 4) {
    return {
      type: 'URL',
      badge: 'URL',
      countLabel: urls.length > 1 ? `${urls.length} links` : '1 link',
      urls,
      urlData: urls[0]
    };
  }

  const mathResult = evaluateMathExpression(text);
  if (mathResult !== null) return { type: 'NOTE', badge: `CALC`, countLabel: `= ${mathResult}`, mathResult };

  if (lines.length >= 2) {
    const commaCounts = lines.map(l => (l.match(/,/g) || []).length);
    const tabCounts = lines.map(l => (l.match(/\t/g) || []).length);
    const consistentCommas = commaCounts[0] >= 2 && commaCounts.every(c => c === commaCounts[0]);
    const consistentTabs = tabCounts[0] >= 1 && tabCounts.every(c => c === tabCounts[0]);
    if (consistentCommas || consistentTabs) {
      return { type: 'TABLE', badge: `TABLE`, countLabel: `${lines.length} rows`, delimiter: consistentTabs ? '\t' : ',' };
    }
  }

  const isCode = /\b(SELECT|FROM|WHERE|function|const|let|import|export|def|class|curl|docker|git)\b/.test(text);
  return { type: 'NOTE', badge: isCode ? 'CODE' : 'NOTE', countLabel: `${text.length} chars`, urls: urls.length > 0 ? urls : undefined };
}

function parseTasksFromText(raw) {
  return raw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const doneMatch = /^(?:[-*•]?\s*\[[xX]\]\s*)(.*)/.exec(line);
    if (doneMatch) return { text: doneMatch[1], done: true };
    const todoMatch = /^(?:[-*•]?\s*\[\s\]\s*|[-*•]\s*|\d+\.\s*|todo:\s*|action:\s*)(.*)/i.exec(line);
    return { text: todoMatch ? todoMatch[1] : line, done: false };
  });
}

function serializeTasksToText(tasks) {
  return tasks.map(t => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n');
}

function getDefaultDemoCards() {
  const now = Date.now();
  return [
    {
      id: 'demo-tasks',
      title: 'Release Deployment Checklist',
      content: '- [x] Verify API routing in us-east production\n- [x] Rotate database replica read tokens\n- [ ] Deploy Edge CDN caching rules\n- [ ] Run synthetic latency benchmark tests',
      pinned: true,
      revealed: false,
      createdAt: now - 1000 * 60 * 14
    },
    {
      id: 'demo-url',
      title: 'Service Documentation & Webhooks',
      content: 'https://slateflow.dev/docs/webhooks?utm_source=twitter&utm_medium=banner&fbclid=IwAR89234xY\ngithub.com/render/render-cli?utm_campaign=q4_launch&ref=sidebar',
      pinned: true,
      revealed: false,
      createdAt: now - 1000 * 60 * 25
    },
    {
      id: 'demo-json',
      title: 'Production Build Webhook Payload',
      content: JSON.stringify({
        event: "deploy.succeeded",
        service_id: "srv-c8k2m901p",
        environment: "production",
        commit: "7e2a90f",
        build_time_sec: 42.8,
        status: "live"
      }, null, 2),
      pinned: true,
      revealed: false,
      createdAt: now - 1000 * 60 * 36
    },
    {
      id: 'demo-secret',
      title: 'Production Edge Access Keys',
      content: 'RENDER_API_KEY=rnd_99a8B7c6D5e4F3g2H1j0KlMnOpQrStUv\nGITHUB_TOKEN=ghp_78kLmN90pQrStUvWxYz1234567890abcd',
      pinned: false,
      revealed: false,
      createdAt: now - 1000 * 60 * 50
    },
    {
      id: 'demo-table',
      title: 'Regional Edge Latency Benchmark',
      content: 'Region,P50,P99,Status\nus-east-1,18ms,64ms,Healthy\neu-central-1,26ms,82ms,Healthy\nap-south-1,42ms,118ms,Degraded',
      pinned: false,
      revealed: false,
      createdAt: now - 1000 * 60 * 65
    }
  ];
}

function loadState() {
  const savedLayout = localStorage.getItem(LAYOUT_KEY);
  currentLayout = ['rows', 'grid', 'split'].includes(savedLayout) ? savedLayout : 'rows';
  currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.body.setAttribute('data-theme', currentTheme);
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.textContent = currentTheme === 'dark' ? 'Theme: Dark' : 'Theme: Light';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    cards = saved ? JSON.parse(saved) : getDefaultDemoCards();
  } catch (e) {
    cards = getDefaultDemoCards();
  }
  if (cards.length > 0) selectedSplitCardId = cards[0].id;
}

function saveCards() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); } catch (e) {}
  updateCounters();
}

function toggleContrastTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', currentTheme);
  localStorage.setItem(THEME_KEY, currentTheme);
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    const isDark = currentTheme === 'dark';
    themeBtn.innerHTML = `
      <span class="btn-text-full">${isDark ? 'Theme: Dark' : 'Theme: Light'}</span>
      <span class="btn-text-short">${isDark ? 'Dark' : 'Light'}</span>
    `;
  }
}

function setLayout(layout) {
  currentLayout = layout;
  localStorage.setItem(LAYOUT_KEY, layout);
  renderBoard();
}

function showToast(msg) {
  const stack = document.getElementById('toastContainer');
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = msg;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 2000);
}

function copyText(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => showToast(label)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(label);
  });
}

function copyCardContent(cardId) {
  const c = cards.find(item => item.id === cardId);
  if (c) copyText(c.content, 'Copied Note');
}

function toggleRowExpanded(id, event) {
  if (event) {
    if (event.target.closest('button') || event.target.closest('input') || event.target.closest('textarea') || event.target.closest('a')) {
      return;
    }
  }
  if (expandedRowIds.has(id)) {
    expandedRowIds.delete(id);
  } else {
    expandedRowIds.add(id);
  }
  renderBoard();
}

function insertTemplate(type) {
  const input = document.getElementById('scratchInput');
  const titleInput = document.getElementById('scratchTitleInput');
  if (type === 'checklist') {
    input.value = '- [ ] Review API latency\n- [ ] Update staging environment\n- [ ] Run regression suite';
    titleInput.value = 'Sprint Action Checklist';
  } else if (type === 'json') {
    input.value = JSON.stringify({ service: "auth-gateway", port: 8080, active: true, endpoints: ["/login", "/refresh"] }, null, 2);
    titleInput.value = 'Service Config JSON';
  } else if (type === 'urls') {
    input.value = 'https://slateflow.dev/docs?utm_source=twitter&utm_medium=social\ngithub.com/render/render-cli?utm_campaign=dev';
    titleInput.value = 'Reference Documentation';
  } else if (type === 'table') {
    input.value = 'Service,Instances,Status,Uptime\nweb-api,4,Healthy,99.98%\nworker-queue,2,Healthy,100%\ncache-redis,1,Degraded,98.2%';
    titleInput.value = 'Service Health Metrics';
  } else if (type === 'secret') {
    input.value = 'RENDER_API_KEY=rnd_live_9a8b7c6d5e4f3g2h1\nDATABASE_URL=postgres://user:pass@render-db:5432/main';
    titleInput.value = 'Environment Credentials';
  }
  input.focus();
  updateLiveComposerMeta();
  showToast(`Loaded ${type} template`);
}

function composerInsertCheckbox() {
  const input = document.getElementById('scratchInput');
  const raw = input.value;
  if (!raw.trim()) {
    input.value = '- [ ] ';
    input.focus();
    updateLiveComposerMeta();
    return;
  }
  const lines = raw.split('\n');
  const alreadyHasCheckboxes = lines.some(l => /^\s*[-*•]?\s*\[[ xX]\]/.test(l));
  if (!alreadyHasCheckboxes) {
    input.value = lines.map(l => {
      const clean = l.trim().replace(/^([-*•]|\d+\.)\s+/, '');
      return clean ? `- [ ] ${clean}` : '';
    }).filter(Boolean).join('\n');
  } else {
    input.value = raw.trimEnd() + '\n- [ ] ';
  }
  input.focus();
  input.selectionStart = input.selectionEnd = input.value.length;
  updateLiveComposerMeta();
}

function composerCleanUrls() {
  const input = document.getElementById('scratchInput');
  const raw = input.value.trim();
  if (!raw) return;
  const urls = extractUrlsFromText(raw);
  if (urls.length === 0) { showToast('No URLs found'); return; }
  let updated = raw;
  urls.forEach(u => { updated = updated.replace(u.original, u.clean); });
  input.value = updated;
  updateLiveComposerMeta();
  showToast('Sanitized URLs');
}

function composerCycleCase() {
  const input = document.getElementById('scratchInput');
  const raw = input.value;
  if (!raw.trim()) return;
  const modes = ['UPPERCASE', 'lowercase', 'Title Case', 'snake_case'];
  const mode = modes[caseCycleIndex % modes.length];
  caseCycleIndex++;
  if (mode === 'UPPERCASE') input.value = raw.toUpperCase();
  else if (mode === 'lowercase') input.value = raw.toLowerCase();
  else if (mode === 'Title Case') input.value = raw.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  else if (mode === 'snake_case') {
    input.value = raw.trim().split('\n').map(l => l.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).join('\n');
  }
  updateLiveComposerMeta();
  showToast(mode);
}

function formatComposerInPlace() {
  const input = document.getElementById('scratchInput');
  const raw = input.value.trim();
  if (!raw) return;
  const meta = classifyContent(raw);
  if (meta.type === 'JSON' && meta.parsed) {
    input.value = JSON.stringify(meta.parsed, null, 2);
    showToast('Formatted JSON');
  } else if (meta.type === 'TASKS') {
    const tasks = parseTasksFromText(raw);
    input.value = serializeTasksToText(tasks);
    showToast('Normalized Checklist');
  } else if (meta.mathResult !== null) {
    input.value = `${raw} = ${meta.mathResult}`;
    showToast('Appended Result');
  } else {
    composerCleanUrls();
  }
  updateLiveComposerMeta();
}

function addScratchCard() {
  const input = document.getElementById('scratchInput');
  const titleInput = document.getElementById('scratchTitleInput');
  const pinCheck = document.getElementById('pinOnCreate');

  const rawTitle = (titleInput.value || '').trim();
  if (!rawTitle) {
    titleInput.focus();
    showToast('Note title is required');
    return;
  }

  const raw = (input.value || '').trim();
  if (!raw) {
    input.focus();
    showToast('Note content is required');
    return;
  }

  const meta = classifyContent(raw);
  const newCard = {
    id: `card-${Date.now()}`,
    title: rawTitle,
    content: raw,
    pinned: pinCheck.checked,
    revealed: false,
    createdAt: Date.now()
  };
  cards.unshift(newCard);
  expandedRowIds.add(newCard.id);
  selectedSplitCardId = newCard.id;
  saveCards();
  input.value = '';
  titleInput.value = '';
  pinCheck.checked = false;
  updateLiveComposerMeta();
  renderBoard();
  showToast('Note entry saved to workspace');
}

function updateLiveComposerMeta() {
  const badge = document.getElementById('liveDetectedBadge');
  if (!badge) return;
  const raw = document.getElementById('scratchInput').value;
  if (!raw.trim()) { badge.textContent = 'Ready'; return; }
  const meta = classifyContent(raw);
  badge.textContent = `${meta.badge}${meta.countLabel ? ' • ' + meta.countLabel : ''}`;
}

function togglePin(id) {
  const c = cards.find(item => item.id === id);
  if (c) {
    c.pinned = !c.pinned;
    saveCards();
    renderBoard();
    showToast(c.pinned ? 'Pinned Note' : 'Unpinned Note');
  }
}

function deleteCard(id) {
  cards = cards.filter(item => item.id !== id);
  expandedRowIds.delete(id);
  if (editingNoteId === id) editingNoteId = null;
  if (selectedSplitCardId === id) selectedSplitCardId = cards[0]?.id || null;
  saveCards();
  renderBoard();
  showToast('Note entry removed');
}

function startEditingNote(id) {
  editingNoteId = id;
  expandedRowIds.add(id);
  renderBoard();
  const area = document.getElementById(`editArea-${id}`);
  if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); }
}

function cancelNoteEdit(id) {
  editingNoteId = null;
  renderBoard();
}

function saveNoteEdit(id) {
  const c = cards.find(item => item.id === id);
  if (!c) return;
  const area = document.getElementById(`editArea-${id}`);
  const titleEl = document.getElementById(`editTitle-${id}`);
  if (!area) return;
  const newContent = area.value.trim();
  if (!newContent) { showToast('Note entry content cannot be empty'); return; }
  c.content = newContent;
  if (titleEl && titleEl.value.trim()) {
    c.title = titleEl.value.trim();
  }
  editingNoteId = null;
  saveCards();
  renderBoard();
  showToast('Note entry updated');
}

function toggleRevealSecret(id) {
  const c = cards.find(item => item.id === id);
  if (c) {
    c.revealed = !c.revealed;
    saveCards();
    renderBoard();
  }
}

function toggleTaskItem(cardId, taskIndex) {
  const c = cards.find(item => item.id === cardId);
  if (!c) return;
  const tasks = parseTasksFromText(c.content);
  if (tasks[taskIndex]) {
    tasks[taskIndex].done = !tasks[taskIndex].done;
    c.content = serializeTasksToText(tasks);
    saveCards();
    renderBoard();
  }
}

function addInlineTaskItem(cardId, inputEl) {
  const text = (inputEl.value || '').trim();
  if (!text) return;
  const c = cards.find(item => item.id === cardId);
  if (!c) return;
  const tasks = parseTasksFromText(c.content);
  tasks.push({ text, done: false });
  c.content = serializeTasksToText(tasks);
  saveCards();
  renderBoard();
}

function deleteTaskItem(cardId, taskIndex) {
  const c = cards.find(item => item.id === cardId);
  if (!c) return;
  const tasks = parseTasksFromText(c.content);
  tasks.splice(taskIndex, 1);
  c.content = tasks.length ? serializeTasksToText(tasks) : '- [ ] Item';
  saveCards();
  renderBoard();
}

function clearCompletedTasks(cardId) {
  const c = cards.find(item => item.id === cardId);
  if (!c) return;
  const tasks = parseTasksFromText(c.content);
  const remaining = tasks.filter(t => !t.done);
  if (remaining.length === 0) { deleteCard(cardId); return; }
  c.content = serializeTasksToText(remaining);
  saveCards();
  renderBoard();
  showToast('Cleared completed items');
}

function convertCardToChecklist(cardId) {
  const c = cards.find(item => item.id === cardId);
  if (!c) return;
  const lines = c.content.split('\n').map(l => l.trim()).filter(Boolean);
  c.content = lines.map(l => `- [ ] ${l.replace(/^([-*•]|\d+\.)\s+/, '')}`).join('\n');
  saveCards();
  renderBoard();
  showToast('Converted to checklist');
}

function transformCardContent(id, mode) {
  const c = cards.find(item => item.id === id);
  if (!c) return;
  const meta = classifyContent(c.content);
  if (mode === 'json-pretty' && meta.parsed) c.content = JSON.stringify(meta.parsed, null, 2);
  else if (mode === 'json-minify' && meta.parsed) c.content = JSON.stringify(meta.parsed);
  saveCards();
  renderBoard();
}

function copyTableAsMarkdown(id) {
  const c = cards.find(item => item.id === id);
  if (!c) return;
  const meta = classifyContent(c.content);
  const delim = meta.delimiter || ',';
  const rows = c.content.trim().split('\n').map(r => r.split(delim).map(cell => cell.trim()));
  if (!rows.length) return;
  const header = `| ${rows[0].join(' | ')} |`;
  const divider = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
  copyText([header, divider, body].join('\n'), 'Copied Markdown Table');
}

function requestSweepUnpinned() {
  const unpinnedCount = cards.filter(c => !c.pinned).length;
  if (unpinnedCount === 0) {
    showToast('No unpinned notes to clear');
    return;
  }
  openConfirmModal({
    title: 'Sweep Unpinned Notes',
    body: `Remove ${unpinnedCount} unpinned note entry${unpinnedCount === 1 ? '' : 'ies'} from your workspace? Pinned notes will remain preserved.`,
    actionLabel: 'Sweep Notes',
    onConfirm: sweepUnpinned
  });
}

function sweepUnpinned() {
  cards = cards.filter(c => c.pinned);
  saveCards();
  renderBoard();
  showToast('Cleared unpinned notes');
}

function openConfirmModal(opts) {
  const modal = document.getElementById('confirmModal');
  const title = document.getElementById('confirmDialogTitle');
  const body = document.getElementById('confirmDialogBody');
  const actionBtn = document.getElementById('confirmActionBtn');

  title.textContent = opts.title || 'Confirm Action';
  body.textContent = opts.body || '';
  actionBtn.textContent = opts.actionLabel || 'Confirm';
  pendingConfirmAction = opts.onConfirm || null;

  modal.classList.add('open');
  actionBtn.focus();
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('open');
  pendingConfirmAction = null;
}

function confirmModalProceed() {
  const fn = pendingConfirmAction;
  closeConfirmModal();
  if (typeof fn === 'function') fn();
}

function togglePrivacyMode() {
  globalPrivacyMode = !globalPrivacyMode;
  const btn = document.getElementById('privacyToggleBtn');
  if (btn) btn.classList.toggle('active', globalPrivacyMode);
  const label = document.getElementById('privacyLabel');
  if (label) {
    label.innerHTML = `
      <span class="btn-text-full">${globalPrivacyMode ? 'Privacy: On' : 'Privacy: Off'}</span>
      <span class="btn-text-short">${globalPrivacyMode ? 'Masked' : 'Public'}</span>
    `;
  }
  renderBoard();
  showToast(globalPrivacyMode ? 'Privacy Masking Active' : 'Privacy Masking Inactive');
}

function setFilter(filter) {
  currentFilter = filter;
  renderBoard();
}

function selectSplitCard(id) {
  selectedSplitCardId = id;
  renderBoard();
}

function formatRelativeTime(ts) {
  const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function maskSecretString(str) {
  return str.replace(/([:=]\s*|sk-[a-zA-Z0-9_-]{4}|ghp_[a-zA-Z0-9]{4}|rnd_[a-zA-Z0-9]{4})([^\s]+)/g, (m, prefix, rest) => {
    return prefix + '•'.repeat(Math.min(16, rest.length));
  });
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
    const meta = classifyContent(c.content);
    if (counts[meta.type] !== undefined) counts[meta.type]++;
  });

  const setElText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('countAll', counts.ALL);
  setElText('countPinned', counts.PINNED);
  setElText('countTasks', counts.TASKS);
  setElText('countUrl', counts.URL);
  setElText('countJson', counts.JSON);
  setElText('countSecret', counts.SECRET);
  setElText('countTable', counts.TABLE);
  setElText('countNote', counts.NOTE);
}

function renderDrawerBody(card, meta) {
  const blurClass = globalPrivacyMode ? 'privacy-blur' : '';

  // Inline Note Editor
  if (editingNoteId === card.id) {
    return `
      <div style="display:flex;flex-direction:column;gap:10px">
        <input
          id="editTitle-${card.id}"
          type="text"
          class="title-input"
          value="${escapeHtml(card.title)}"
          placeholder="Note title"
          style="width:100%"
        />
        <textarea
          id="editArea-${card.id}"
          class="composer-textarea"
          rows="6"
          style="min-height:120px"
        >${escapeHtml(card.content)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="cancelNoteEdit('${card.id}')">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveNoteEdit('${card.id}')">Save Changes</button>
        </div>
      </div>
    `;
  }

  if (meta.type === 'TASKS') {
    const tasks = parseTasksFromText(card.content);
    const doneCount = tasks.filter(t => t.done).length;
    return `
      <div class="checklist-container ${blurClass}">
        <div class="checklist-header">
          <span>PROGRESS: ${doneCount} of ${tasks.length} tasks completed</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-tertiary btn-sm" onclick="startEditingNote('${card.id}')">Edit Raw</button>
            <button class="btn btn-tertiary btn-sm" onclick="clearCompletedTasks('${card.id}')">Clear Completed</button>
          </div>
        </div>
        <div class="checklist-items">
          ${tasks.map((t, idx) => `
            <div class="checklist-row">
              <label class="checklist-label">
                <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTaskItem('${card.id}', ${idx})" />
                <span class="${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
              </label>
              <button class="btn btn-tertiary btn-sm" onclick="deleteTaskItem('${card.id}', ${idx})" title="Remove item">×</button>
            </div>
          `).join('')}
        </div>
        <div class="checklist-add-bar">
          <input
            type="text"
            class="checklist-input"
            placeholder="Add checklist task..."
            onkeydown="if(event.key==='Enter'){event.preventDefault();addInlineTaskItem('${card.id}', this);}"
          />
          <button class="btn btn-secondary btn-sm" onclick="addInlineTaskItem('${card.id}', this.previousElementSibling)">Add Task</button>
        </div>
      </div>
    `;
  }

  if (meta.type === 'URL' && meta.urls) {
    return `
      <div class="url-group ${blurClass}">
        ${meta.urls.map(info => `
          <div class="url-card">
            <div class="url-card-top">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="url-host-badge">${escapeHtml(info.hostname)}</span>
                ${info.removedCount > 0 ? `<span class="url-clean-badge">${info.removedCount} Tracking Tags Removed</span>` : ''}
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="copyText('${escapeHtml(info.clean)}', 'Copied Clean URL')">Copy Link</button>
                <a href="${escapeHtml(info.clean)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Open ↗</a>
              </div>
            </div>
            <div class="url-href-text">${escapeHtml(info.clean)}</div>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:flex-end;margin-top:4px">
          <button class="btn btn-tertiary btn-sm" onclick="startEditingNote('${card.id}')">Edit Links</button>
        </div>
      </div>
    `;
  }

  if (meta.type === 'SECRET') {
    const displayValue = (card.revealed && !globalPrivacyMode) ? card.content : maskSecretString(card.content);
    return `
      <div style="display:flex;flex-direction:column;gap:8px">
        <pre class="content-snippet ${globalPrivacyMode ? 'privacy-blur' : ''}">${escapeHtml(displayValue)}</pre>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)">ENVIRONMENT SECRET ISOLATION</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-tertiary btn-sm" onclick="startEditingNote('${card.id}')">Edit Keys</button>
            <button class="btn btn-secondary btn-sm" onclick="toggleRevealSecret('${card.id}')">
              ${card.revealed ? 'Hide Secret' : 'Reveal Secret'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (meta.type === 'TABLE') {
    const delim = meta.delimiter || ',';
    const rows = card.content.trim().split('\n').map(r => r.split(delim).map(c => c.trim()));
    const headers = rows[0] || [];
    const bodyRows = rows.slice(1);
    return `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="table-wrapper ${blurClass}">
          <table class="dev-table">
            <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${bodyRows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:6px">
          <button class="btn btn-tertiary btn-sm" onclick="startEditingNote('${card.id}')">Edit CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="copyTableAsMarkdown('${card.id}')">Copy Markdown Table</button>
        </div>
      </div>
    `;
  }

  if (meta.type === 'JSON' && meta.parsed) {
    return `
      <div style="display:flex;flex-direction:column;gap:8px">
        <pre class="content-snippet ${blurClass}">${escapeHtml(card.content)}</pre>
        <div style="display:flex;justify-content:flex-end;gap:6px">
          <button class="btn btn-tertiary btn-sm" onclick="startEditingNote('${card.id}')">Edit JSON</button>
          <button class="btn btn-secondary btn-sm" onclick="transformCardContent('${card.id}', 'json-pretty')">Format JSON</button>
          <button class="btn btn-tertiary btn-sm" onclick="transformCardContent('${card.id}', 'json-minify')">Minify</button>
        </div>
      </div>
    `;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      <pre class="content-snippet ${blurClass}">${escapeHtml(card.content)}</pre>
      <div style="display:flex;justify-content:flex-end;gap:6px">
        <button class="btn btn-tertiary btn-sm" onclick="startEditingNote('${card.id}')">Edit Note</button>
        <button class="btn btn-tertiary btn-sm" onclick="convertCardToChecklist('${card.id}')">To Checklist</button>
      </div>
    </div>
  `;
}

/**
 * Render-Style Developer UI: Full-width horizontal row
 */
function renderHorizontalRowHtml(card, meta) {
  const isExpanded = expandedRowIds.has(card.id);
  const snippet = card.content.replace(/\n+/g, ' ').slice(0, 85);

  return `
    <article class="render-row ${card.pinned ? 'pinned-row' : ''} ${isExpanded ? 'is-expanded' : ''}" id="row-${card.id}">
      <div class="row-header" onclick="toggleRowExpanded('${card.id}', event)">
        <div class="row-left">
          <span class="status-dot ${card.pinned ? 'dot-pinned' : ''}" title="${card.pinned ? 'Pinned Note' : 'Live Note Entry'}"></span>
          <span class="badge-tag">${meta.badge}</span>
        </div>

        <div class="row-mid">
          <span class="row-title">${escapeHtml(card.title)}</span>
          <span class="row-preview">${escapeHtml(snippet)}</span>
        </div>

        <div class="row-right">
          <span class="row-meta-text">${formatRelativeTime(card.createdAt)}</span>
          <div class="row-actions">
            <button class="btn btn-secondary btn-sm ${card.pinned ? 'btn-pinned' : ''}" onclick="togglePin('${card.id}')">
              ${card.pinned ? 'Pinned' : 'Pin'}
            </button>
            <button class="btn btn-primary btn-sm" onclick="copyCardContent('${card.id}')">
              Copy
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteCard('${card.id}')">
              Delete
            </button>
            <button class="btn btn-tertiary btn-sm" onclick="toggleRowExpanded('${card.id}', event)" title="Toggle details tray">
              <svg class="expand-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="row-drawer">
        ${renderDrawerBody(card, meta)}
      </div>
    </article>
  `;
}

function renderBoard() {
  updateCounters();

  document.querySelectorAll('.filter-pills .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === currentFilter);
  });
  document.querySelectorAll('.layout-toggle-group .layout-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-layout') === currentLayout);
  });

  const grid = document.getElementById('cardsGrid');
  grid.className = `layout-${currentLayout}`;

  const filtered = cards
    .map(c => ({ card: c, meta: classifyContent(c.content) }))
    .filter(({ card, meta }) => {
      if (currentFilter === 'PINNED' && !card.pinned) return false;
      if (currentFilter !== 'ALL' && currentFilter !== 'PINNED' && meta.type !== currentFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return card.title.toLowerCase().includes(q) || card.content.toLowerCase().includes(q) || meta.badge.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => (b.card.pinned ? 1 : 0) - (a.card.pinned ? 1 : 0) || b.card.createdAt - a.card.createdAt);

  if (filtered.length === 0) {
    grid.className = 'layout-rows';
    grid.innerHTML = `
      <div class="render-row" style="text-align: center; padding: 40px;">
        <p style="font-weight:600;font-size:14px;color:var(--text-primary)">
          ${searchQuery ? `No note entries match "${escapeHtml(searchQuery)}"` : 'No note entries found in this view'}
        </p>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">
          ${searchQuery ? `<button class="btn btn-secondary btn-sm" onclick="document.getElementById('searchInput').value='';searchQuery='';renderBoard();">Clear search</button>` : 'Create a new note entry above or select "All".'}
        </p>
      </div>
    `;
    return;
  }

  // Render-Style Horizontal Rows (Primary View)
  if (currentLayout === 'rows') {
    grid.innerHTML = filtered.map(({ card, meta }) => renderHorizontalRowHtml(card, meta)).join('');
    return;
  }

  // Card Grid View
  if (currentLayout === 'grid') {
    grid.innerHTML = filtered.map(({ card, meta }) => renderHorizontalRowHtml(card, meta)).join('');
    return;
  }

  // Split Inspector View
  if (currentLayout === 'split') {
    const activeEntry = filtered.find(f => f.card.id === selectedSplitCardId) || filtered[0];
    selectedSplitCardId = activeEntry.card.id;
    const { card, meta } = activeEntry;

    grid.innerHTML = `
      <aside class="split-nav-list">
        ${filtered.map(item => `
          <div class="split-nav-item ${item.card.id === selectedSplitCardId ? 'active' : ''}" onclick="selectSplitCard('${item.card.id}')">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span class="badge-tag">${item.meta.badge}</span>
              <span class="row-meta-text">${item.card.pinned ? 'Pinned • ' : ''}${formatRelativeTime(item.card.createdAt)}</span>
            </div>
            <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-top:4px">${escapeHtml(item.card.title)}</div>
          </div>
        `).join('')}
      </aside>

      <div class="render-row is-expanded" style="background-color:var(--bg-surface);min-width:0;overflow:hidden">
        <div class="row-header" style="border-bottom:1px solid var(--border-default)">
          <div class="row-left" style="min-width:0;flex:1">
            <span class="status-dot ${card.pinned ? 'dot-pinned' : ''}"></span>
            <span class="badge-tag">${meta.badge}</span>
            <span class="row-title" style="max-width:none;overflow:hidden;text-overflow:ellipsis">${escapeHtml(card.title)}</span>
          </div>
          <div class="row-right">
            <button class="btn btn-secondary btn-sm ${card.pinned ? 'btn-pinned' : ''}" onclick="togglePin('${card.id}')">${card.pinned ? 'Pinned' : 'Pin'}</button>
            <button class="btn btn-primary btn-sm" onclick="copyCardContent('${card.id}')">Copy</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCard('${card.id}')">Delete</button>
          </div>
        </div>
        <div class="row-drawer" style="display:flex">
          ${renderDrawerBody(card, meta)}
        </div>
      </div>
    `;
  }
}

function openExportModal() {
  const modal = document.getElementById('exportModal');
  const area = document.getElementById('exportMarkdownArea');
  const lines = [
    `# StateFlow Workspace Export`,
    `Generated: ${new Date().toISOString()}`,
    `Environment: production-us-east`,
    `Total Note Entries: ${cards.length}`,
    '',
    '---',
    ''
  ];
  cards.forEach(c => {
    const meta = classifyContent(c.content);
    lines.push(`## ${c.title} [${meta.badge}]`);
    lines.push(`*Created: ${new Date(c.createdAt).toLocaleString()} | Pinned: ${c.pinned ? 'Yes' : 'No'}*`);
    lines.push('');
    lines.push(c.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  area.value = lines.join('\n');
  modal.classList.add('open');
}

function closeExportModal() {
  document.getElementById('exportModal').classList.remove('open');
}

function copyDigestMarkdown() {
  const area = document.getElementById('exportMarkdownArea');
  copyText(area.value, 'Copied Workspace Markdown');
  closeExportModal();
}

// Global Keyboard Shortcuts and Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderBoard();

  const scratch = document.getElementById('scratchInput');
  if (scratch) {
    scratch.addEventListener('input', updateLiveComposerMeta);
    scratch.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        addScratchCard();
      }
    });
  }

  const search = document.getElementById('searchInput');
  const mobileSearch = document.getElementById('mobileSearchInput');

  function handleSearchInput(val) {
    searchQuery = val.trim();
    if (search && search.value !== val) search.value = val;
    if (mobileSearch && mobileSearch.value !== val) mobileSearch.value = val;
    renderBoard();
  }

  if (search) {
    search.addEventListener('input', (e) => handleSearchInput(e.target.value));
  }
  if (mobileSearch) {
    mobileSearch.addEventListener('input', (e) => handleSearchInput(e.target.value));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const s = document.getElementById('searchInput');
      if (s) { s.focus(); s.select(); }
    }
    if (e.key === 'Escape') {
      closeExportModal();
      closeConfirmModal();
      if (editingNoteId) {
        editingNoteId = null;
        renderBoard();
      }
    }
  });
});
