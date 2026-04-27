/* WUIC Crash Admin — minimal triage SPA (skill crash-reporting Commit 10).
 *
 * Vanilla JS, no framework. Mantenuto deliberatamente piccolo (~300 righe)
 * cosi' che il deploy del receiver non porti dietro Node/npm. Se la
 * complessita' cresce (allowlist CRUD, charts), promote a un Angular
 * standalone — la struttura a due viste (list/detail) e il routing
 * via `View.show()` rendono il refactor low-effort.
 *
 * Endpoints consumati:
 *   GET  /api/admin/crash/list?errorCode=&clientId=&resolved=&since=&page=&pageSize=
 *   GET  /api/admin/crash/{id}
 *   POST /api/admin/crash/{id}/resolve   { resolved, resolvedBy, notes }
 *   POST /api/crash/deobfuscate          { release, assembly, stack }
 *
 * Auth:
 *   - In dev: AllowLoopback=true → niente bearer richiesto da localhost.
 *   - In prod: IP whitelist (decisione 12) → niente bearer richiesto.
 *   - Bearer fallback opzionale: stored in localStorage 'wuic-admin-token'.
 */

const TOKEN_KEY = 'wuic-admin-token';
const PAGE_SIZE_DEFAULT = 50;

// ── State ────────────────────────────────────────────────────────────
let state = {
  page: 1,
  pageSize: PAGE_SIZE_DEFAULT,
  total: 0,
  rows: [],
  filters: { errorCode: '', clientId: '', resolved: '', since: '' },
  currentDetail: null
};

// ── DOM helpers ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── Auth ─────────────────────────────────────────────────────────────
function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {} updateAuthBadge(); }
function updateAuthBadge() {
  const t = getToken();
  const badge = $('auth-status');
  const logoutBtn = $('btn-logout');
  if (t) {
    badge.textContent = 'bearer set';
    badge.className = 'auth-status auth-status--ok';
    logoutBtn.style.display = '';
  } else {
    badge.textContent = 'no bearer (loopback/IP)';
    badge.className = 'auth-status auth-status--unset';
    logoutBtn.style.display = 'none';
  }
}

async function api(method, path, body) {
  const headers = { 'Accept': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await resp.json(); } catch { json = null; }
  if (!resp.ok) {
    const err = (json && json.error) || ('HTTP ' + resp.status);
    throw new Error(err);
  }
  return json;
}

// ── List view ────────────────────────────────────────────────────────
async function loadList() {
  $('list-status').textContent = 'caricamento…';
  const qs = new URLSearchParams();
  if (state.filters.errorCode) qs.set('errorCode', state.filters.errorCode);
  if (state.filters.clientId)  qs.set('clientId',  state.filters.clientId);
  if (state.filters.resolved !== '') qs.set('resolved', state.filters.resolved);
  if (state.filters.since)     qs.set('since', state.filters.since);
  qs.set('page', state.page);
  qs.set('pageSize', state.pageSize);
  try {
    const resp = await api('GET', '/api/admin/crash/list?' + qs.toString());
    state.rows = resp.rows || [];
    state.total = resp.total || 0;
    state.page = resp.page || state.page;
    state.pageSize = resp.pageSize || state.pageSize;
    renderList();
    $('list-status').textContent = `${state.total} totali`;
  } catch (e) {
    $('list-status').textContent = 'errore: ' + e.message;
    state.rows = []; renderList();
  }
}

function renderList() {
  const tbody = $('t-list-body');
  tbody.innerHTML = '';
  for (const r of state.rows) {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    const sourceTag = r.source === '.net' ? 'tag-source-net' : 'tag-source-js';
    const stateTag = r.resolved ? 'tag-resolved' : 'tag-open';
    const stateLabel = r.resolved ? 'risolto' : 'aperto';
    const typedTag = r.isTyped ? '<span class="tag tag-typed">typed</span>' : '';
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${formatDate(r.lastSeen)}</td>
      <td>${r.occurrences}</td>
      <td><span class="tag ${sourceTag}">${escapeHtml(r.source)}</span></td>
      <td>${escapeHtml(r.clientId)}</td>
      <td>${escapeHtml(r.releaseTag)}</td>
      <td>${escapeHtml(r.type)}</td>
      <td class="cell-error-code">${escapeHtml(r.errorCode || '')} ${typedTag}</td>
      <td class="cell-message" title="${escapeHtml(r.message)}">${escapeHtml(r.message)}</td>
      <td><span class="tag ${stateTag}">${stateLabel}</span></td>
    `;
    tr.addEventListener('click', () => showDetail(r.id));
    tbody.appendChild(tr);
  }
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  $('page-info').textContent = `pagina ${state.page} / ${totalPages}`;
  $('btn-prev').disabled = state.page <= 1;
  $('btn-next').disabled = state.page >= totalPages;
}

function formatDate(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  } catch { return s; }
}

// ── Detail view ──────────────────────────────────────────────────────
async function showDetail(id) {
  showView('detail');
  $('detail-body').innerHTML = '<p>caricamento…</p>';
  try {
    const d = await api('GET', `/api/admin/crash/${id}`);
    state.currentDetail = d;
    renderDetail(d);
  } catch (e) {
    $('detail-body').innerHTML = `<p>errore: ${escapeHtml(e.message)}</p>`;
  }
}

function renderDetail(d) {
  const sourceTag = d.source === '.net' ? 'tag-source-net' : 'tag-source-js';
  const stateTag = d.resolved ? 'tag-resolved' : 'tag-open';
  const stateLabel = d.resolved ? 'risolto' : 'aperto';
  const typedTag = d.isTyped ? '<span class="tag tag-typed">typed</span>' : '';

  let argsBlock = '';
  if (d.argsJson) {
    try {
      const parsed = JSON.parse(d.argsJson);
      argsBlock = `<pre class="stack">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
    } catch { argsBlock = `<pre class="stack">${escapeHtml(d.argsJson)}</pre>`; }
  }

  let breadcrumbsBlock = '';
  if (d.breadcrumbs) {
    try {
      const parsed = JSON.parse(d.breadcrumbs);
      breadcrumbsBlock = `<pre class="stack">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
    } catch { breadcrumbsBlock = `<pre class="stack">${escapeHtml(d.breadcrumbs)}</pre>`; }
  }

  const html = `
    <h2 style="margin-top:0">${escapeHtml(d.type)} <span class="cell-error-code">${escapeHtml(d.errorCode || '')}</span> ${typedTag}</h2>
    <p style="font-size:0.95rem; white-space:pre-wrap; color:var(--fg);">${escapeHtml(d.message)}</p>

    <div class="detail-actions">
      <button id="btn-deobfuscate" class="btn-primary">Deobfuscate stack</button>
      <button id="btn-toggle-resolved" class="btn-secondary">${d.resolved ? 'Riapri' : 'Marca risolto'}</button>
      <button id="btn-copy" class="btn-secondary">Copia tutto</button>
    </div>

    <div class="detail-section">
      <h3>Metadati</h3>
      <div class="detail-grid">
        <div class="label">id</div>                 <div class="value">${d.id}</div>
        <div class="label">stato</div>              <div class="value"><span class="tag ${stateTag}">${stateLabel}</span></div>
        <div class="label">source</div>             <div class="value"><span class="tag ${sourceTag}">${escapeHtml(d.source)}</span></div>
        <div class="label">client</div>             <div class="value">${escapeHtml(d.clientId)} (${escapeHtml(d.clientTier)})</div>
        <div class="label">release</div>            <div class="value">${escapeHtml(d.releaseTag)}</div>
        <div class="label">first_seen</div>         <div class="value">${formatDate(d.firstSeen)}</div>
        <div class="label">last_seen</div>          <div class="value">${formatDate(d.lastSeen)}</div>
        <div class="label">occurrences</div>        <div class="value">${d.occurrences}</div>
        <div class="label">stack_hash</div>         <div class="value">${escapeHtml(d.stackHash)}</div>
        <div class="label">machineFingerprint</div> <div class="value">${escapeHtml(d.machineFingerprint || '—')}</div>
        <div class="label">url</div>                <div class="value">${escapeHtml(d.url || '—')}</div>
        <div class="label">userId</div>             <div class="value">${escapeHtml(d.userId || '—')}</div>
        <div class="label">userAgent</div>          <div class="value">${escapeHtml(d.userAgent || '—')}</div>
        ${d.licenseExpiredAtIngest ? '<div class="label">⚠ license</div><div class="value">expired al momento dell\'ingest</div>' : ''}
        ${d.resolvedAt ? `<div class="label">resolved_at</div><div class="value">${formatDate(d.resolvedAt)}</div>` : ''}
        ${d.resolvedBy ? `<div class="label">resolved_by</div><div class="value">${escapeHtml(d.resolvedBy)}</div>` : ''}
        ${d.notes ? `<div class="label">notes</div><div class="value" style="white-space:pre-wrap">${escapeHtml(d.notes)}</div>` : ''}
      </div>
    </div>

    ${argsBlock ? `<div class="detail-section"><h3>Args (typed)</h3>${argsBlock}</div>` : ''}

    <div class="detail-section">
      <h3>Stack raw</h3>
      <pre class="stack" id="detail-stack">${escapeHtml(d.stackRaw)}</pre>
    </div>

    ${breadcrumbsBlock ? `<div class="detail-section"><h3>Breadcrumbs</h3>${breadcrumbsBlock}</div>` : ''}
  `;
  $('detail-body').innerHTML = html;

  $('btn-deobfuscate').addEventListener('click', () => onDeobfuscate(d));
  $('btn-toggle-resolved').addEventListener('click', () => onToggleResolved(d));
  $('btn-copy').addEventListener('click', () => onCopyDetail(d));
}

async function onDeobfuscate(d) {
  // Heuristic: per il .NET il MappingsRoot e' indicizzato come WuicCore.
  // Qui assumiamo l'assembly principale e' WuicCore — Commit 5 supporta
  // gia' il body { release, assembly, stack }.
  const release = d.releaseTag.replace(/^wuic@/, '');
  const assembly = 'WuicCore';
  const btn = $('btn-deobfuscate');
  btn.disabled = true;
  btn.textContent = 'deobfuscating…';
  try {
    const resp = await api('POST', '/api/crash/deobfuscate', {
      release, assembly, stack: d.stackRaw
    });
    if (resp.ok && resp.deobfuscated) {
      $('detail-stack').textContent = resp.deobfuscated;
      btn.textContent = `Done (${resp.stats?.parsedMethods || 0} methods)`;
    } else {
      btn.textContent = 'mapping not found';
      setTimeout(() => { btn.textContent = 'Deobfuscate stack'; btn.disabled = false; }, 2000);
      return;
    }
  } catch (e) {
    btn.textContent = 'errore: ' + e.message;
  }
  setTimeout(() => { btn.textContent = 'Deobfuscate stack'; btn.disabled = false; }, 3000);
}

async function onToggleResolved(d) {
  const next = !d.resolved;
  let notes = null;
  if (next) {
    notes = window.prompt('Note di chiusura (opzionale):', '');
  }
  try {
    await api('POST', `/api/admin/crash/${d.id}/resolve`, {
      resolved: next, resolvedBy: 'admin-ui', notes
    });
    d.resolved = next;
    if (next) {
      d.resolvedAt = new Date().toISOString();
      d.resolvedBy = 'admin-ui';
      if (notes) d.notes = notes;
    } else {
      d.resolvedAt = null; d.resolvedBy = null;
    }
    renderDetail(d);
  } catch (e) {
    alert('errore: ' + e.message);
  }
}

function onCopyDetail(d) {
  const sections = [
    `# ${d.type} ${d.errorCode || ''}`,
    d.message,
    '-- Metadata --',
    `id: ${d.id}\nclient: ${d.clientId} (${d.clientTier})\nrelease: ${d.releaseTag}\nfirst_seen: ${d.firstSeen}\nlast_seen: ${d.lastSeen}\noccurrences: ${d.occurrences}\nstack_hash: ${d.stackHash}`,
    d.argsJson ? '-- Args --\n' + d.argsJson : '',
    '-- Stack --',
    document.getElementById('detail-stack').textContent,
    d.breadcrumbs ? '-- Breadcrumbs --\n' + d.breadcrumbs : '',
  ].filter(Boolean).join('\n\n');
  try { navigator.clipboard.writeText(sections); } catch {}
}

// ── Routing ──────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
  $('view-' + name).classList.add('view-active');
}

// ── Wire up ──────────────────────────────────────────────────────────
function init() {
  updateAuthBadge();

  // Filters
  $('btn-refresh').addEventListener('click', () => {
    state.filters.errorCode = $('f-error-code').value.trim();
    state.filters.clientId  = $('f-client-id').value.trim();
    state.filters.resolved  = $('f-resolved').value;
    state.filters.since     = $('f-since').value;
    state.page = 1;
    loadList();
  });

  $('btn-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; loadList(); } });
  $('btn-next').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page < totalPages) { state.page++; loadList(); }
  });

  $('btn-back').addEventListener('click', () => showView('list'));

  // Token dialog
  $('btn-set-token').addEventListener('click', () => {
    $('dialog-token-input').value = getToken() || '';
    $('dialog-token').style.display = 'flex';
  });
  $('dialog-token-cancel').addEventListener('click', () => { $('dialog-token').style.display = 'none'; });
  $('dialog-token-save').addEventListener('click', () => {
    setToken($('dialog-token-input').value.trim() || null);
    $('dialog-token').style.display = 'none';
    loadList();
  });
  $('btn-logout').addEventListener('click', () => { setToken(null); loadList(); });

  // Initial load.
  loadList();
}

document.addEventListener('DOMContentLoaded', init);
