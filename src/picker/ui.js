import { buildMiniPreview } from './mini-preview.js';
import { showConfirm, showPrompt } from '../utils/dialog.js';

let selection = new Set();

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const d  = Math.floor(hr / 24);
  if (d  < 30)  return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function nodeCount(graphData) {
  return Object.keys(graphData?.nodes || {}).length;
}

function makeEditable(el, onCommit) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    el.contentEditable = 'true';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); el.contentEditable = 'false'; }
  });
  el.addEventListener('blur', () => {
    el.contentEditable = 'false';
    const val = el.textContent.trim();
    if (val) onCommit(val);
    else el.textContent = el.dataset.original;
  });
}

// ── Selection toolbar ───────────────────────────────────────────────────────
function buildToolbar(root, folders, callbacks) {
  const bar      = root.querySelector('#pk-toolbar');
  const countEl  = root.querySelector('#pk-sel-count');
  const moveBtn  = root.querySelector('#pk-move-btn');
  const moveDrop = root.querySelector('#pk-move-dropdown');

  function refresh() {
    const n = selection.size;
    // Bug 1 fix: use style.display — the hidden attribute is overridden by the
    // inline style="display:none" set in the HTML template.
    bar.style.display = n === 0 ? 'none' : 'flex';
    if (n === 0) return;
    countEl.textContent = `${n} graph${n > 1 ? 's' : ''} selected`;

    moveDrop.innerHTML = '';
    folders.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'pk-drop-item';
      btn.textContent = f.name;
      btn.addEventListener('click', () => {
        callbacks.onMoveToFolder([...selection], f.id);
        moveDrop.classList.remove('open');
      });
      moveDrop.appendChild(btn);
    });
    if (folders.length) {
      const sep = document.createElement('div');
      sep.className = 'pk-drop-sep';
      moveDrop.appendChild(sep);
      const rem = document.createElement('button');
      rem.className = 'pk-drop-item';
      rem.textContent = 'Remove from folder';
      rem.addEventListener('click', () => {
        callbacks.onMoveToFolder([...selection], null);
        moveDrop.classList.remove('open');
      });
      moveDrop.appendChild(rem);
    }
  }

  moveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!folders.length) return;
    moveDrop.classList.toggle('open');
  });
  document.addEventListener('click', () => moveDrop.classList.remove('open'));

  root.querySelector('#pk-delete-sel').addEventListener('click', () => {
    callbacks.onDelete([...selection]);
    selection = new Set();
    refresh();
    updateAllCardSelection(root);
  });

  // Bug 2 fix: button now says "Clear selection" and has a title
  root.querySelector('#pk-clear-sel').addEventListener('click', () => {
    selection = new Set();
    refresh();
    updateAllCardSelection(root);
  });

  return refresh;
}

function updateAllCardSelection(root) {
  root.querySelectorAll('.graph-card').forEach(card => {
    card.classList.toggle('selected', selection.has(card.dataset.id));
  });
}

// ── Graph card ──────────────────────────────────────────────────────────────
function buildCard(graph, folders, callbacks, refreshToolbar) {
  const card  = document.createElement('div');
  card.className = 'graph-card';
  card.dataset.id = graph.id;
  if (selection.has(graph.id)) card.classList.add('selected');

  const count = nodeCount(graph.data);
  const meta  = `${count} node${count !== 1 ? 's' : ''} · ${relativeTime(graph.updated_at)}`;

  card.innerHTML = `
    <div class="card-check-wrap" title="Select">
      <div class="card-check"></div>
    </div>
    <div class="card-preview"></div>
    <div class="card-body">
      <span class="card-title" data-original="${graph.title}">${graph.title}</span>
      <span class="card-meta">${meta}</span>
    </div>
    <button class="card-menu-btn" title="More options">⋯</button>
    <div class="card-menu-drop">
      <button data-action="open">Open</button>
      <button data-action="rename">Rename</button>
      ${folders.length ? `
        <div class="pk-drop-sep"></div>
        <div class="pk-drop-label">Move to</div>
        ${folders.map(f => `<button data-action="move" data-folder="${f.id}">${f.name}</button>`).join('')}
        <button data-action="move" data-folder="">Remove from folder</button>
      ` : ''}
      <div class="pk-drop-sep"></div>
      <button data-action="delete" class="pk-drop-danger">Delete</button>
    </div>
  `;

  card.querySelector('.card-preview').appendChild(buildMiniPreview(graph.data));

  const titleEl = card.querySelector('.card-title');
  makeEditable(titleEl, (val) => callbacks.onRename(graph.id, val));

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-check-wrap') ||
        e.target.closest('.card-menu-btn')   ||
        e.target.closest('.card-menu-drop')  ||
        (e.target.closest('.card-title') && e.target.closest('.card-title').contentEditable === 'true')) return;

    if (e.ctrlKey || e.metaKey || selection.size > 0) {
      toggleSelect(graph.id, card, refreshToolbar);
      return;
    }
    callbacks.onOpen(graph.id);
  });

  card.querySelector('.card-check-wrap').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelect(graph.id, card, refreshToolbar);
  });

  const menuBtn  = card.querySelector('.card-menu-btn');
  const menuDrop = card.querySelector('.card-menu-drop');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.card-menu-drop.open').forEach(d => { if (d !== menuDrop) d.classList.remove('open'); });
    menuDrop.classList.toggle('open');
  });
  menuDrop.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    menuDrop.classList.remove('open');
    const action = btn.dataset.action;
    if (action === 'open')   callbacks.onOpen(graph.id);
    if (action === 'rename') titleEl.click();
    if (action === 'move')   callbacks.onMoveToFolder([graph.id], btn.dataset.folder || null);
    if (action === 'delete') callbacks.onDelete([graph.id]);
  });
  document.addEventListener('click', () => menuDrop.classList.remove('open'));

  return card;
}

function toggleSelect(id, card, refreshToolbar) {
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  card.classList.toggle('selected', selection.has(id));
  refreshToolbar();
}

function buildGrid(graphs, folders, callbacks, refreshToolbar) {
  const grid = document.createElement('div');
  grid.className = 'picker-grid';
  graphs.forEach(g => grid.appendChild(buildCard(g, folders, callbacks, refreshToolbar)));
  return grid;
}

// ── Folder section ──────────────────────────────────────────────────────────
function buildFolder(folder, graphs, allFolders, collapsed, callbacks, refreshToolbar) {
  const section = document.createElement('section');
  section.className = 'picker-folder';
  section.dataset.id = folder.id;

  const isCollapsed = collapsed.has(folder.id);
  const count = graphs.length;

  section.innerHTML = `
    <div class="folder-header">
      <button class="folder-toggle ${isCollapsed ? 'collapsed' : ''}" title="Collapse/expand">▾</button>
      <span class="folder-name" data-original="${folder.name}">${folder.name}</span>
      <span class="folder-count">${count} graph${count !== 1 ? 's' : ''}</span>
      <div class="folder-actions">
        <button class="folder-btn" data-action="add" title="New graph in folder">+ Graph</button>
        <button class="folder-btn folder-btn--danger" data-action="delete" title="Delete folder">✕</button>
      </div>
    </div>
    <div class="folder-content ${isCollapsed ? 'collapsed' : ''}"></div>
  `;

  const toggle  = section.querySelector('.folder-toggle');
  const content = section.querySelector('.folder-content');
  const nameEl  = section.querySelector('.folder-name');

  makeEditable(nameEl, (val) => callbacks.onRenameFolder(folder.id, val));

  toggle.addEventListener('click', () => {
    const nowCollapsed = !content.classList.contains('collapsed');
    content.classList.toggle('collapsed', nowCollapsed);
    toggle.classList.toggle('collapsed', nowCollapsed);
    if (nowCollapsed) collapsed.add(folder.id);
    else collapsed.delete(folder.id);
  });

  section.querySelector('.folder-header').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add')    callbacks.onCreateInFolder(folder.id);
    if (btn.dataset.action === 'delete') callbacks.onDeleteFolder(folder.id);
  });

  if (graphs.length > 0) {
    content.appendChild(buildGrid(graphs, allFolders, callbacks, refreshToolbar));
  } else {
    const empty = document.createElement('p');
    empty.className = 'folder-empty';
    empty.textContent = 'No graphs here yet.';
    content.appendChild(empty);
  }

  return section;
}

// ── Main builder ────────────────────────────────────────────────────────────
export function buildPickerUI(root, { user, graphs, folders, collapsedFolders, callbacks }) {
  selection = new Set();
  let activeFilter = null; // null = all | folderId string | 'ungrouped'

  root.innerHTML = `
    <div class="picker">
      <header class="picker-header">
        <div class="picker-header-left">
          <button class="pk-sidebar-toggle" id="pk-sidebar-toggle" title="Toggle sidebar">☰</button>
          <div class="picker-brand">node<span>·</span>book</div>
        </div>
        <div class="picker-header-actions">
          <button class="pk-btn pk-btn--primary" id="pk-new">+ New graph</button>
          <button class="pk-btn pk-btn--ghost" id="pk-signout">${user.email?.split('@')[0] || 'Account'}</button>
        </div>
      </header>

      <div class="picker-layout">
        <aside class="picker-sidebar" id="picker-sidebar">
          <nav class="sidebar-nav" id="sidebar-nav"></nav>
          <div class="sidebar-footer">
            <button class="sidebar-item sidebar-item--action" id="pk-new-folder">+ New folder</button>
          </div>
        </aside>
        <main class="picker-main">
          <div class="picker-body" id="picker-body"></div>
        </main>
      </div>

      <div class="picker-toolbar" id="pk-toolbar" style="display:none">
        <span id="pk-sel-count"></span>
        <div class="picker-toolbar-right">
          <div class="pk-move-wrap">
            <button class="pk-btn pk-btn--ghost" id="pk-move-btn" title="Move selected graphs to a folder">Move to ▾</button>
            <div class="pk-move-drop" id="pk-move-dropdown"></div>
          </div>
          <button class="pk-btn pk-btn--danger" id="pk-delete-sel" title="Delete selected graphs">Delete selected</button>
          <button class="pk-btn pk-btn--ghost" id="pk-clear-sel" title="Deselect all graphs">Clear selection</button>
        </div>
      </div>
    </div>
  `;

  const refreshToolbar = buildToolbar(root, folders, callbacks);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  function buildSidebarNav() {
    const nav = root.querySelector('#sidebar-nav');
    const ungrouped = graphs.filter(g => !g.folder_id);

    const items = [
      { label: 'All graphs', count: graphs.length, filter: null },
      ...folders.map(f => ({
        label: f.name,
        count: graphs.filter(g => g.folder_id === f.id).length,
        filter: f.id,
        isFolder: true,
      })),
      ...(ungrouped.length > 0 && folders.length > 0
        ? [{ label: 'Ungrouped', count: ungrouped.length, filter: 'ungrouped' }]
        : []),
    ];

    nav.innerHTML = items.map((item, i) => `
      <button class="sidebar-item ${activeFilter === item.filter ? 'active' : ''}" data-filter="${item.filter ?? '__all__'}">
        ${item.isFolder ? '<span class="sidebar-folder-icon">▸</span>' : ''}
        <span class="sidebar-label">${item.label}</span>
        <span class="sidebar-count">${item.count}</span>
      </button>
    `).join('');

    nav.querySelectorAll('.sidebar-item').forEach(btn => {
      btn.addEventListener('click', () => {
        nav.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const raw = btn.dataset.filter;
        activeFilter = raw === '__all__' ? null : raw;
        selection = new Set();
        refreshToolbar();
        renderBody();
      });
    });
  }

  // ── Body renderer ─────────────────────────────────────────────────────────
  function renderBody() {
    const body = root.querySelector('#picker-body');
    body.innerHTML = '';

    const showAll      = activeFilter === null;
    const showUngrouped = activeFilter === 'ungrouped';

    const visibleFolders = showAll     ? folders :
                           showUngrouped ? [] :
                           folders.filter(f => f.id === activeFilter);

    const visibleUngrouped = (showAll || showUngrouped)
      ? graphs.filter(g => !g.folder_id)
      : [];

    if (graphs.length === 0 && folders.length === 0) {
      body.innerHTML = `
        <div class="picker-empty">
          <div class="picker-empty-icon">⬡</div>
          <p class="picker-empty-title">No graphs yet</p>
          <p class="picker-empty-sub">Create your first graph to get started.</p>
          <button class="pk-btn pk-btn--primary pk-btn--lg" id="pk-empty-create">Create a graph</button>
        </div>
      `;
      body.querySelector('#pk-empty-create').addEventListener('click', () => callbacks.onCreate());
      return;
    }

    visibleFolders.forEach(folder => {
      const folderGraphs = graphs.filter(g => g.folder_id === folder.id);
      body.appendChild(buildFolder(folder, folderGraphs, folders, collapsedFolders, callbacks, refreshToolbar));
    });

    if (visibleUngrouped.length > 0) {
      const section = document.createElement('section');
      section.className = 'picker-section';
      const hdr = document.createElement('div');
      hdr.className = 'picker-section-header';
      hdr.textContent = (showAll && folders.length > 0) ? 'Ungrouped' : 'All graphs';
      section.appendChild(hdr);
      section.appendChild(buildGrid(visibleUngrouped, folders, callbacks, refreshToolbar));
      body.appendChild(section);
    }
  }

  buildSidebarNav();
  renderBody();

  // ── Header / sidebar buttons ──────────────────────────────────────────────
  root.querySelector('#pk-new').addEventListener('click', () => callbacks.onCreate());

  // Bug 3 fix: themed prompt dialog instead of browser prompt()
  root.querySelector('#pk-new-folder').addEventListener('click', async () => {
    const name = await showPrompt({
      message:     'Name your folder',
      placeholder: 'e.g. Work, Personal…',
      confirmText: 'Create folder',
    });
    if (name) callbacks.onCreateFolder(name);
  });

  // Bug 5 fix: confirm before signing out
  root.querySelector('#pk-signout').addEventListener('click', async () => {
    const ok = await showConfirm({ message: 'Sign out of your account?', confirmText: 'Sign out' });
    if (ok) callbacks.onSignOut();
  });

  // Bug 4: sidebar toggle
  root.querySelector('#pk-sidebar-toggle').addEventListener('click', () => {
    root.querySelector('#picker-sidebar').classList.toggle('collapsed');
  });
}
