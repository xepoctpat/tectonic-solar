// ===== AI SITUATION BRIEFING =====
// Streams a plain-language briefing / Q&A / daily digest from the Node proxy
// (SpaceXAI / Grok). The backend assembles the live space-weather + seismic
// context itself, so this module only handles the UI and SSE streaming.
// Conversation history, saved questions and today's digest are browser-local.
import { AI_APIS } from './config.js';
import { showInAppNotification } from './notifications.js';

const AI_ENDPOINT = AI_APIS.briefing;
const HISTORY_KEY = 'space-earth-ai-history';
const SESSION_KEY = 'space-earth-ai-session';
const SAVED_KEY = 'space-earth-ai-saved';
const DIGEST_KEY = 'space-earth-ai-digest';
const MAX_SAVED = 12;
const CURSOR = '<span class="ai-cursor">▍</span>';

let history = [];
let saved = [];
let streaming = false;

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore quota */ }
}

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `ses-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function saveHistory() {
  writeJson(HISTORY_KEY, history.slice(-20));
}

// --- tiny, safe markdown renderer (escape first, then a few inline rules) ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdown(md) {
  const lines = escapeHtml(md).split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  const isTableSep = (s) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s);
  const isRow = (s) => s.includes('|');
  const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Table: header row followed by a |---|---| separator, then body rows
    if (isRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeList();
      const header = cells(line);
      let body = '';
      i += 2;
      while (i < lines.length && isRow(lines[i]) && lines[i].trim() !== '') {
        const row = cells(lines[i].trimEnd());
        body += '<tr>' + row.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
        i++;
      }
      i--; // outer loop re-increments
      html += '<table class="ai-table"><thead><tr>'
        + header.map(c => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>' + body + '</tbody></table>';
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      closeList();
      html += `<h4>${inline(line.replace(/^#{1,3}\s+/, ''))}</h4>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
    } else if (/^---+$/.test(line)) {
      closeList();
      html += '<hr>';
    } else if (line === '') {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// --- conversation DOM helpers ---
function conversationEl() {
  return document.getElementById('ai-conversation');
}

function scrollToBottom() {
  const el = conversationEl();
  if (el) el.scrollTop = el.scrollHeight;
}

function hideEmptyState() {
  const empty = document.getElementById('ai-empty');
  if (empty) empty.style.display = 'none';
}

function appendMessage(role, initialText = '') {
  hideEmptyState();
  const wrap = document.createElement('div');
  wrap.className = `ai-msg ai-msg-${role}`;
  wrap.setAttribute('data-testid', `ai-message-${role}`);

  const avatar = document.createElement('div');
  avatar.className = 'ai-avatar';
  avatar.textContent = role === 'user' ? 'YOU' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble ai-md';
  if (role === 'user') {
    bubble.textContent = initialText;
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'ai-msg-save';
    star.title = 'Save this question';
    star.setAttribute('aria-label', 'Save this question');
    star.setAttribute('data-testid', 'ai-message-save-btn');
    star.textContent = '☆';
    star.addEventListener('click', () => addSavedQuestion(initialText));
    wrap.appendChild(star);
  } else {
    bubble.innerHTML = initialText || CURSOR;
  }

  wrap.prepend(bubble);
  wrap.prepend(avatar);
  conversationEl()?.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function renderContextChips(context) {
  if (!context) return;
  const parts = [];
  if (context.briefing_engine === 'local') parts.push('Local snapshot');
  if (context.briefing_engine === 'grok') parts.push('Grok');
  const geo = context.geomagnetic;
  if (geo && geo.kp_index != null) parts.push(`Kp ${Number(geo.kp_index).toFixed(1)} · ${geo.status}`);
  const sw = context.solar_wind;
  if (sw && sw.speed_kms != null) parts.push(`Wind ${Math.round(sw.speed_kms)} km/s`);
  if (sw && sw.bz_nT != null) parts.push(`Bz ${Number(sw.bz_nT).toFixed(1)} nT`);
  const dst = context.dst_index;
  if (dst && dst.nT != null) parts.push(`Dst ${Math.round(dst.nT)} nT`);
  const fl = context.solar_flares;
  if (fl && fl.current_class) parts.push(`X-ray ${fl.current_class}`);
  const seis = context.seismic;
  if (seis) parts.push(`${seis.count} quakes/24h`);
  if (seis && seis.largest) parts.push(`Largest M${Number(seis.largest.mag).toFixed(1)}`);

  const bar = document.getElementById('ai-context-chips');
  if (!bar) return;
  bar.innerHTML = '';
  parts.forEach(text => {
    const chip = document.createElement('span');
    chip.className = 'ai-chip-live';
    chip.textContent = text;
    bar.appendChild(chip);
  });
  bar.style.display = parts.length ? 'flex' : 'none';
}

// --- SSE streaming core, shared by briefing and digest ---
// Bare fetch is required here: the Node proxy streams Server-Sent Events.
async function streamSSE(payload, onDelta) {
  if (!AI_ENDPOINT) {
    throw new Error('AI briefing needs the Node proxy (npm run launch on port 3000). The static Python server cannot reach Grok.');
  }

  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Backend error ${res.status}. ${detail}`.trim());
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = chunk.replace(/^data:\s?/, '');
      if (!line) continue;

      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }

      if (msg.context) renderContextChips(msg.context);
      if (msg.delta) { fullText += msg.delta; onDelta(fullText); }
      if (msg.error) fullText += `\n\n**⚠️ ${msg.error}**`;
    }
  }
  return fullText;
}

function setBusy(busy) {
  streaming = busy;
  ['btn-ai-generate', 'ai-send', 'btn-ai-digest', 'btn-ai-digest-refresh'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  });
}

async function streamBriefing(question) {
  if (streaming) return;
  setBusy(true);

  if (question) appendMessage('user', question);
  const bubble = appendMessage('assistant');
  let fullText = '';

  const finalize = (text) => {
    bubble.innerHTML = text ? renderMarkdown(text) : '<p class="ai-error">No response received.</p>';
    scrollToBottom();
  };

  try {
    fullText = await streamSSE(
      { question: question || '', history, session_id: getSessionId() },
      (text) => { bubble.innerHTML = renderMarkdown(text) + CURSOR; scrollToBottom(); },
    );
    finalize(fullText);
    if (question) history.push({ role: 'user', content: question });
    history.push({ role: 'assistant', content: fullText });
    saveHistory();
  } catch (err) {
    finalize(fullText + `\n\n**⚠️ ${err.message || 'Request failed.'}**`);
  } finally {
    setBusy(false);
    const input = document.getElementById('ai-input');
    if (input) { input.value = ''; input.focus(); }
  }
}

// --- daily digest (cached per UTC day) ---
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDigest() {
  const d = readJson(DIGEST_KEY, null);
  return d && d.date === todayKey() ? d : null;
}

function showDigestCard(html, meta) {
  const card = document.getElementById('ai-digest');
  const body = document.getElementById('ai-digest-body');
  const metaEl = document.getElementById('ai-digest-meta');
  if (!card || !body) return;
  card.hidden = false;
  body.innerHTML = html;
  if (metaEl) metaEl.textContent = meta;
}

function renderDigest(digest) {
  const when = new Date(digest.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  showDigestCard(renderMarkdown(digest.text), `${digest.date} · generated ${when} · cached for today`);
  const btn = document.getElementById('btn-ai-digest');
  if (btn) btn.textContent = "☀ Today's Digest";
}

async function generateDigest(force = false) {
  const cached = loadDigest();
  if (cached && !force) {
    renderDigest(cached);
    document.getElementById('ai-digest')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (streaming) return;
  setBusy(true);
  showDigestCard(CURSOR, 'Reading live NOAA / USGS feeds…');

  try {
    const text = await streamSSE(
      { mode: 'digest', question: '', history: [], session_id: `${getSessionId()}-digest` },
      (t) => showDigestCard(renderMarkdown(t) + CURSOR, 'Writing today’s digest…'),
    );
    if (!text) throw new Error('No response received.');
    const digest = { date: todayKey(), text, generated_at: Date.now() };
    writeJson(DIGEST_KEY, digest);
    renderDigest(digest);
  } catch (err) {
    showDigestCard(`<p class="ai-error">⚠️ ${escapeHtml(err.message || 'Request failed.')}</p>`, 'Digest unavailable');
  } finally {
    setBusy(false);
  }
}

// --- saved questions ---
function renderSavedQuestions() {
  const bar = document.getElementById('ai-saved-questions');
  if (!bar) return;
  bar.innerHTML = '';
  bar.hidden = saved.length === 0;
  if (!saved.length) return;

  const label = document.createElement('span');
  label.className = 'ai-saved-label';
  label.textContent = '★ Saved';
  bar.appendChild(label);

  saved.forEach((q, i) => {
    const chip = document.createElement('span');
    chip.className = 'ai-saved-chip';

    const ask = document.createElement('button');
    ask.type = 'button';
    ask.className = 'ai-saved-ask';
    ask.textContent = q;
    ask.title = `Ask: ${q}`;
    ask.setAttribute('data-testid', `ai-saved-ask-${i}`);
    ask.addEventListener('click', () => streamBriefing(q));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ai-saved-remove';
    remove.textContent = '×';
    remove.title = 'Remove saved question';
    remove.setAttribute('aria-label', `Remove saved question: ${q}`);
    remove.setAttribute('data-testid', `ai-saved-remove-${i}`);
    remove.addEventListener('click', () => {
      saved.splice(i, 1);
      writeJson(SAVED_KEY, saved);
      renderSavedQuestions();
    });

    chip.append(ask, remove);
    bar.appendChild(chip);
  });
}

function addSavedQuestion(raw) {
  const q = (raw || '').trim();
  if (!q) {
    showInAppNotification('Nothing to save', 'Type a question first, or star one you already asked.', 'info');
    return;
  }
  if (saved.includes(q)) {
    showInAppNotification('Already saved', 'That question is already in your saved list.', 'info');
    return;
  }
  saved.unshift(q);
  saved = saved.slice(0, MAX_SAVED);
  writeJson(SAVED_KEY, saved);
  renderSavedQuestions();
  showInAppNotification('Question saved', 'It now lives above the composer for one-tap reuse.', 'success');
}

export function initAI() {
  history = readJson(HISTORY_KEY, []);
  saved = readJson(SAVED_KEY, []);
  renderSavedQuestions();

  const cached = loadDigest();
  if (cached) renderDigest(cached);

  document.getElementById('btn-ai-generate')?.addEventListener('click', () => streamBriefing(''));
  document.getElementById('btn-ai-digest')?.addEventListener('click', () => generateDigest(false));
  document.getElementById('btn-ai-digest-refresh')?.addEventListener('click', () => generateDigest(true));
  document.getElementById('btn-ai-digest-hide')?.addEventListener('click', () => {
    const card = document.getElementById('ai-digest');
    if (card) card.hidden = true;
  });

  const composer = document.getElementById('ai-composer');
  composer?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('ai-input');
    const question = (input?.value || '').trim();
    if (question) streamBriefing(question);
  });

  document.getElementById('ai-save-question')?.addEventListener('click', () => {
    const input = document.getElementById('ai-input');
    const typed = (input?.value || '').trim();
    const lastAsked = [...history].reverse().find(h => h.role === 'user')?.content;
    addSavedQuestion(typed || lastAsked);
  });

  document.querySelectorAll('[data-ai-prompt]').forEach(btn => {
    btn.addEventListener('click', () => streamBriefing(btn.getAttribute('data-ai-prompt')));
  });

  document.getElementById('btn-ai-clear')?.addEventListener('click', () => {
    history = [];
    saveHistory();
    const conv = conversationEl();
    if (conv) {
      conv.querySelectorAll('.ai-msg').forEach(el => el.remove());
      const empty = document.getElementById('ai-empty');
      if (empty) empty.style.display = '';
    }
    const bar = document.getElementById('ai-context-chips');
    if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
  });
}
