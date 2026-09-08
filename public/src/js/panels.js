// ===== PANEL REORDER + COLLAPSE =====
// Adds a small toolbar to every dashboard panel: move up/down, drag handle,
// collapse. Order (per split layout) and collapsed state are persisted locally.

const STORAGE_PREFIX = 'space-earth-layout';
const PANEL_SELECTOR = '.resizable-panel[data-panel-id]';

function load(key) {
  try { return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:${key}`)); } catch { return null; }
}

function save(key, value) {
  try { localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
}

function panelsIn(pane) {
  return [...pane.querySelectorAll(`:scope > ${PANEL_SELECTOR}`)];
}

function paneKey(pane, index) {
  if (pane.classList.contains('split-pane-primary')) return 'primary';
  if (pane.classList.contains('split-pane-secondary')) return 'secondary';
  return `pane${index}`;
}

function persistOrder(layout) {
  const splitId = layout.dataset.splitId;
  if (!splitId) return;
  const order = {};
  layout.querySelectorAll('.split-pane').forEach((pane, i) => {
    order[paneKey(pane, i)] = panelsIn(pane).map(p => p.dataset.panelId);
  });
  save(`order:${splitId}`, order);
}

function restoreOrder(layout) {
  const splitId = layout.dataset.splitId;
  const order = splitId ? load(`order:${splitId}`) : null;
  if (!order) return;
  const byId = new Map([...layout.querySelectorAll(PANEL_SELECTOR)].map(p => [p.dataset.panelId, p]));
  layout.querySelectorAll('.split-pane').forEach((pane, i) => {
    const ids = order[paneKey(pane, i)];
    if (!Array.isArray(ids)) return;
    const marker = document.createComment('panel-order');
    const first = panelsIn(pane)[0];
    if (first) pane.insertBefore(marker, first); else pane.appendChild(marker);
    ids.forEach(id => { const p = byId.get(id); if (p) pane.insertBefore(p, marker); });
    marker.remove();
  });
}

function appendToPane(pane, panel) {
  const last = panelsIn(pane).at(-1);
  if (last) last.after(panel); else pane.prepend(panel);
}

function movePanel(panel, dir, layout, scheduleRefresh) {
  const pane = panel.parentElement;
  const siblings = panelsIn(pane);
  const target = siblings[siblings.indexOf(panel) + dir];
  if (target) {
    if (dir < 0) target.before(panel); else target.after(panel);
  } else {
    const panes = [...layout.querySelectorAll('.split-pane')];
    const nextPane = panes[panes.indexOf(pane) + dir];
    if (!nextPane) return;
    if (dir < 0) appendToPane(nextPane, panel);
    else { const first = panelsIn(nextPane)[0]; first ? first.before(panel) : nextPane.prepend(panel); }
  }
  persistOrder(layout);
  scheduleRefresh(120);
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setCollapsed(panel, collapsed, persist = true) {
  panel.classList.toggle('is-collapsed', collapsed);
  const btn = panel.querySelector('.panel-collapse');
  if (btn) {
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.textContent = collapsed ? '▸' : '▾';
    btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
  }
  if (persist) save(`collapsed:${panel.dataset.panelId}`, collapsed);
}

function makeTool(cls, label, text, testId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `panel-tool ${cls}`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.textContent = text;
  btn.setAttribute('data-testid', testId);
  return btn;
}

function clearDropMarks(layout) {
  layout.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
}

function dropTarget(layout, event) {
  const over = event.target.closest?.(PANEL_SELECTOR);
  if (over && layout.contains(over)) {
    const rect = over.getBoundingClientRect();
    return { over, before: event.clientY < rect.top + rect.height / 2 };
  }
  const pane = event.target.closest?.('.split-pane');
  return pane && layout.contains(pane) ? { pane } : null;
}

function initDragAndDrop(layout, getDragged, scheduleRefresh) {
  layout.addEventListener('dragover', event => {
    const dragged = getDragged();
    if (!dragged || !layout.contains(dragged)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropMarks(layout);
    const t = dropTarget(layout, event);
    if (!t) return;
    if (t.over && t.over !== dragged) t.over.classList.add(t.before ? 'drop-before' : 'drop-after');
    else if (t.pane) t.pane.classList.add('drop-into');
  });

  layout.addEventListener('drop', event => {
    const dragged = getDragged();
    if (!dragged || !layout.contains(dragged)) return;
    event.preventDefault();
    const t = dropTarget(layout, event);
    if (t?.over && t.over !== dragged) { t.before ? t.over.before(dragged) : t.over.after(dragged); }
    else if (t?.pane) appendToPane(t.pane, dragged);
    clearDropMarks(layout);
    persistOrder(layout);
    scheduleRefresh(120);
  });
}

function decoratePanel(panel, layout, scheduleRefresh, setDragged) {
  const heading = panel.querySelector(':scope > h3');
  if (!heading) return;
  const id = panel.dataset.panelId;

  const bar = document.createElement('div');
  bar.className = 'panel-toolbar';
  bar.setAttribute('data-testid', `panel-toolbar-${id}`);

  const up = makeTool('panel-move-up', 'Move panel up', '▲', `panel-move-up-${id}`);
  const down = makeTool('panel-move-down', 'Move panel down', '▼', `panel-move-down-${id}`);
  const drag = makeTool('panel-drag', 'Drag to reorder (arrow keys also move)', '⋮⋮', `panel-drag-${id}`);
  const collapse = makeTool('panel-collapse', 'Collapse panel', '▾', `panel-collapse-${id}`);

  up.addEventListener('click', () => movePanel(panel, -1, layout, scheduleRefresh));
  down.addEventListener('click', () => movePanel(panel, 1, layout, scheduleRefresh));
  collapse.addEventListener('click', () => setCollapsed(panel, !panel.classList.contains('is-collapsed')));

  drag.draggable = true;
  drag.addEventListener('dragstart', event => {
    setDragged(panel);
    panel.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setDragImage(panel, 24, 24);
  });
  drag.addEventListener('dragend', () => {
    panel.classList.remove('is-dragging');
    setDragged(null);
    clearDropMarks(layout);
  });
  drag.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp') { event.preventDefault(); movePanel(panel, -1, layout, scheduleRefresh); drag.focus(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); movePanel(panel, 1, layout, scheduleRefresh); drag.focus(); }
  });

  bar.append(up, down, drag, collapse);
  heading.appendChild(bar);

  if (load(`collapsed:${id}`) === true) setCollapsed(panel, true, false);
}

export function resetPanelLayout() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(`${STORAGE_PREFIX}:`))
    .forEach(k => localStorage.removeItem(k));
  window.location.reload();
}

export function initPanelControls(scheduleRefresh) {
  let dragged = null;
  const getDragged = () => dragged;
  const setDragged = p => { dragged = p; };

  document.querySelectorAll('[data-split-layout]').forEach(layout => {
    restoreOrder(layout);
    layout.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
      decoratePanel(panel, layout, scheduleRefresh, setDragged);
    });
    initDragAndDrop(layout, getDragged, scheduleRefresh);
  });

  document.getElementById('btn-reset-layout')?.addEventListener('click', resetPanelLayout);
}
