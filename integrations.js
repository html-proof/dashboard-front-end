// Integrations page. Everything is scoped to the signed-in store by the server (session cookie).
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : null);
const LOGOS = { deputy: ['D', '#6d4fc2'], meta: ['∞', '#1877f2'], google_ads: ['G', '#4285f4'], google_analytics: ['G', '#e37400'] };
const STATE = { not_connected: ['Not connected', ''], saved: ['Account saved', 'warn'], connected: ['Connected', 'good'], error: ['Needs attention', 'bad'] };
let items = [];
let editing = null;

async function api(path, init = {}) {
  const key = sessionStorage.getItem('dashboardKey');
  const response = await fetch(path, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) } });
  // Guard against HTML error pages (e.g. a proxy or an old server) so users never see a raw JSON parse error.
  const body = /json/.test(response.headers.get('content-type') || '') ? await response.json().catch(() => ({})) : {};
  if (response.status === 401 && body.category === 'not_signed_in') { location.href = '/connect.html'; return new Promise(() => {}); }
  if (response.status === 401 && body.category === 'dashboard_auth') {
    const entered = prompt('Dashboard API key');
    if (entered) { sessionStorage.setItem('dashboardKey', entered); return api(path, init); }
  }
  if (!response.ok) throw new Error(body.error || `The server could not load this (HTTP ${response.status}). Restart the server and try again.`);
  return body;
}

function renderShopify(s) {
  const sync = s.sync?.resources?.map((r) => r.last_run_at).filter(Boolean).sort().pop();
  $('shopify').innerHTML = `
    <div class="int-shop-head">
      <div><h2><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg> Shopify · ${esc(s.name || s.shop)}</h2><p class="muted">${esc(s.domain)}</p></div>
      <span class="chip ${s.connected ? 'good' : ''}">${s.connected ? `Connected · ${sync ? `last sync ${esc(when(sync))}` : 'first sync running'}` : 'Not connected'}</span>
    </div>
    ${s.connected ? '' : `<div class="int-shop-body"><a class="btn primary" href="/shopify/auth?shop=${encodeURIComponent(s.shop)}">Connect Shopify</a></div>`}`;
}

function card(i) {
  const [letter, color] = LOGOS[i.id] || [i.name[0], 'var(--teal)'];
  const [label, tone] = STATE[i.state];
  const detail = i.state === 'not_connected' ? 'No data imported yet'
    : i.lastError ? i.lastError
    : i.lastSyncAt ? `Last import ${when(i.lastSyncAt)}`
    : i.liveImport ? (i.hasCredentials ? 'Waiting for the first import' : 'Add an access token to start importing')
    : 'Saved · live import not available yet';
  return `<article class="panel int-card">
    <div class="int-card-top"><span class="int-logo" style="color:${color}">${esc(letter)}</span><span class="chip ${tone}">${esc(label)}</span></div>
    <h3>${esc(i.name)}</h3><p class="muted">${esc(i.description)}</p>
    <div class="int-account"><p>${i.accountId ? `${esc(i.accountLabel)}: <strong>${esc(i.accountName || i.accountId)}</strong>` : 'No account selected'}</p><small class="${i.lastError ? 'bad' : 'muted'}">${esc(detail)}</small></div>
    <div class="int-actions">
      <button class="btn int-setup" data-id="${i.id}">${i.state === 'not_connected' ? 'Set up connection' : 'Manage connection'}<span aria-hidden="true">→</span></button>
      ${i.id === 'meta' && i.hasCredentials ? `<button class="btn" data-sync="${i.id}">Import now</button>` : ''}
    </div>
  </article>`;
}

async function load() {
  try {
    const d = await api('/api/integrations');
    items = d.integrations;
    renderShopify(d.shopify);
    $('grid').innerHTML = items.map(card).join('');
    $('side-store').textContent = d.shopify.name || d.shopify.shop;
    $('side-store-meta').textContent = d.shopify.domain;
    $('side-initials').textContent = (d.shopify.name || d.shopify.shop).slice(0, 2).toUpperCase();
    $('side-sync').textContent = d.shopify.connected ? 'Connected' : 'Not connected';
  } catch (error) {
    $('shopify').innerHTML = `<div class="alert"><div><strong>Could not load integrations</strong><p>${esc(error.message)}</p></div></div><button class="btn" id="reload">Reload setup</button>`;
    $('reload').addEventListener('click', load);
  }
}

function openSetup(id) {
  editing = items.find((i) => i.id === id);
  $('setup-title').textContent = `${editing.name} connection`;
  $('account-label').textContent = editing.accountLabel;
  $('account').placeholder = editing.accountHint;
  $('account').value = editing.accountId || '';
  $('token-row').hidden = !editing.tokenLabel;
  $('token-label').textContent = editing.tokenLabel || '';
  $('token').value = '';
  $('token-hint').textContent = editing.hasCredentials ? 'A token is saved. Leave blank to keep it.' : 'Stored encrypted; it is never shown again.';
  $('setup-remove').hidden = editing.state === 'not_connected';
  $('setup-error').textContent = '';
  $('setup').showModal();
}

$('setup-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  try {
    await api(`/api/integrations/${editing.id}`, { method: 'PUT', body: JSON.stringify({ accountId: $('account').value, accessToken: $('token').value }) });
    $('setup').close(); load();
  } catch (error) { $('setup-error').textContent = error.message; }
});
$('setup-remove').addEventListener('click', async () => {
  if (!confirm(`Disconnect ${editing.name}? Saved credentials are deleted; imported data is kept.`)) return;
  try { await api(`/api/integrations/${editing.id}`, { method: 'DELETE' }); $('setup').close(); load(); } catch (error) { $('setup-error').textContent = error.message; }
});
$('grid').addEventListener('click', async (event) => {
  const setup = event.target.closest('[data-id]');
  if (setup) return openSetup(setup.dataset.id);
  const sync = event.target.closest('[data-sync]');
  if (sync) { sync.disabled = true; sync.textContent = 'Importing…'; await api(`/api/integrations/${sync.dataset.sync}/sync`, { method: 'POST' }).catch((e) => alert(e.message)); load(); }
});
$('logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/connect.html'; });
api('/api/me').then((me) => { $('logout').hidden = !me.signedIn; }).catch(() => {});
$('toggle-side').addEventListener('click', () => document.querySelector('.shell').classList.toggle('collapsed'));

load();
