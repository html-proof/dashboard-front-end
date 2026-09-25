// Sales sources page. All values come from /api/dashboard/salessources; "—" means unavailable.
import { chart } from './charts.js';
import { restoreRange, saveRange, bindDateInputs } from './range-store.js';
const $ = (id) => document.getElementById(id);
let currency = 'AUD';
let last = null;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v) => (isNum(v) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : '—');
const count = (v) => (isNum(v) ? new Intl.NumberFormat('en-AU').format(v) : '—');
const pct = (v) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : '—');
const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

async function api(path) {
  const key = sessionStorage.getItem('dashboardKey');
  const response = await fetch((window.API_BASE || "") + path, { headers: key ? { authorization: `Bearer ${key}` } : {} });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && body.category === 'dashboard_auth') {
    const entered = prompt('Dashboard API key');
    if (entered) { sessionStorage.setItem('dashboardKey', entered); return api(path); }
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function table(el, rows, columns, footer) {
  if (!rows?.length) { el.innerHTML = '<p class="empty">No data available</p>'; return; }
  el.innerHTML = `<div class="table-wrap"><table class="ss-table"><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls ? c.cls(row) : ''}">${c.html ? c.html(row) : esc(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody>
    ${footer ? `<tfoot><tr>${footer.map((cell, i) => `<td class="${columns[i]?.num ? 'num' : ''}">${esc(cell)}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}

function render(d) {
  last = d;
  currency = d.currency || currency;
  $('start').value = d.range.startDate; $('end').value = d.range.endDate;
  const days = Math.round((new Date(d.range.endDate) - new Date(d.range.startDate)) / 86400000) + 1;
  $('meta-left').textContent = `${d.currency} · ${d.timezone} · Revenue excludes tax`;
  $('meta-right').textContent = `${days} reported days`;
  $('source-line').textContent = d.reportAvailable ? 'ⓘ Live Shopify data, split by sales channel.' : `ⓘ Shopify sales report unavailable: ${d.reason}`;
  $('foot-right').textContent = `Live Shopify data · generated ${new Date(d.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;
  $('ss-total').textContent = money(d.totals.netRevenue);

  chart($('ss-chart'), d.sources, { value: (s) => s.netRevenue, label: (s) => s.source, format: money, type: 'bar', tick: (v) => new Intl.NumberFormat('en-AU', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v) });
  const t = d.totals;
  table($('ss-performance'), d.sources, [
    { label: 'Source', value: (s) => s.source },
    { label: 'Net revenue', num: true, value: (s) => money(s.netRevenue) },
    { label: 'Mix', num: true, html: (s) => `<span class="mix"><span style="width:${(s.mix || 0) * 100}%"></span></span>${esc(pct(s.mix))}` },
    { label: 'Orders', num: true, value: (s) => count(s.orders) },
    { label: 'Refunds', num: true, value: (s) => (s.refundCount ? `${money(s.refunds)} (${s.refundCount})` : money(s.refunds)) },
    { label: 'Direct costs', num: true, html: (s) => `${esc(money(s.directCosts))}${isNum(s.costCoverage) && s.costCoverage < 1 ? `<br><small class="muted">covers ${(s.costCoverage * 100).toFixed(0)}% of sales</small>` : ''}` },
    { label: 'Contribution', num: true, cls: (s) => (s.contribution < 0 ? 'neg' : ''), value: (s) => money(s.contribution) }
  ], ['Total', money(t.netRevenue), d.sources.length ? '100%' : '—', count(t.orders), money(t.refunds), money(t.directCosts), money(t.contribution)]);

  const check = t.difference;
  $('ss-note').textContent = `Channel totals ${isNum(check) && Math.abs(check) < 0.01 ? 'match' : 'differ from'} Shopify's store-wide net sales (${money(t.storeNetRevenue)})${isNum(check) && Math.abs(check) >= 0.01 ? ` by ${money(check)}` : ''}. Refunds are dated when issued, incl. refunded shipping/tax. Direct costs = units sold × Shopify "Cost per item"; contribution = net revenue − direct costs.`;

  // Daily reconciliation.
  const names = d.channelNames;
  const recon = d.reconciliation;
  const mismatches = recon.filter((r) => isNum(r.difference) && Math.abs(r.difference) >= 0.01).length;
  const orderGaps = recon.filter((r) => isNum(r.shopifyOrders) && r.shopifyOrders !== r.syncedOrders).length;
  $('ss-recon-status').textContent = recon.length ? `${mismatches ? `${mismatches} day(s) with channel ≠ store total` : 'Every day reconciles'} · ${orderGaps ? `${orderGaps} day(s) where order counts differ` : 'order counts match'}` : '';
  table($('ss-reconciliation'), recon.slice().reverse(), [
    { label: 'Date', value: (r) => day(r.date) },
    ...names.map((n) => ({ label: n, num: true, value: (r) => money(r.channels[n] ?? 0) })),
    { label: 'Channels total', num: true, value: (r) => money(r.channelSum) },
    { label: 'Shopify total', num: true, value: (r) => money(r.storeNet) },
    { label: 'Difference', num: true, cls: (r) => (isNum(r.difference) && Math.abs(r.difference) >= 0.01 ? 'neg' : 'ok'), value: (r) => (isNum(r.difference) && Math.abs(r.difference) < 0.01 ? '✓' : money(r.difference)) },
    { label: 'Orders (Shopify / synced)', num: true, cls: (r) => (r.shopifyOrders !== r.syncedOrders ? 'neg' : ''), value: (r) => `${count(r.shopifyOrders)} / ${count(r.syncedOrders)}` }
  ]);

  table($('ss-settings'), d.settings, [
    { label: 'Source', value: (s) => s.source },
    { label: 'Shopify source names', value: (s) => s.sourceNames || '—' },
    { label: 'Status', html: (s) => `<span class="badge">${esc(s.status)}</span>` },
    { label: 'First order', value: (s) => day(s.firstOrder) },
    { label: 'Latest order', value: (s) => day(s.lastOrder) },
    { label: 'Lifetime orders', num: true, value: (s) => count(s.lifetimeOrders) },
    { label: 'Lifetime order value', num: true, value: (s) => money(s.lifetimeTotal) },
    { label: 'Reporting', value: (s) => s.reporting }
  ]);

  table($('ss-integrations'), d.integrations, [
    { label: 'Integration', value: (i) => i.name }, { label: 'Provides', value: (i) => i.purpose },
    { label: 'Status', html: (i) => `<span class="badge ${/^(Connected|Registered)$/.test(i.status) ? 'good' : ''}">${esc(i.status)}</span>` },
    { label: 'Detail', value: (i) => i.detail }
  ]);
}

function query() {
  const params = new URLSearchParams();
  const preset = $('preset').value;
  if (preset === 'custom') { params.set('start_date', $('start').value); params.set('end_date', $('end').value); } else params.set('preset', preset);
  if (!$('incomplete').checked) params.set('include_incomplete', '0');
  return params.toString();
}

async function load() {
  history.replaceState(null, '', `?${query()}${location.hash}`);
  saveRange(query());
  document.body.classList.add('loading');
  try { render(await api(`/api/dashboard/salessources?${query()}`)); }
  catch (error) { $('ss-performance').innerHTML = `<p class="empty">${esc(error.message)}</p>`; }
  finally { document.body.classList.remove('loading'); }
}

function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
}

function exportCsv() {
  if (!last) return;
  const rows = [['Source', 'Net revenue', 'Mix', 'Orders', 'Refunds', 'Direct costs', 'Contribution'],
    ...last.sources.map((s) => [s.source, s.netRevenue, s.mix, s.orders, s.refunds, s.directCosts ?? '', s.contribution ?? '']),
    ['Total', last.totals.netRevenue, '', last.totals.orders, last.totals.refunds, last.totals.directCosts, last.totals.contribution]];
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `sales-sources-${last.range.startDate}-to-${last.range.endDate}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

async function sidebar() {
  try {
    const s = await api('/api/status');
    $('side-store').textContent = s.store?.name || '—';
    $('side-store-meta').textContent = s.store ? `${s.store.primary_domain || s.shop} · ${s.store.currency}` : '';
    $('side-initials').textContent = (s.store?.name || '··').slice(0, 2).toUpperCase();
  } catch { /* shown by main load */ }
}

const initial = restoreRange();
if (initial.get('preset')) $('preset').value = initial.get('preset');
if (initial.get('start_date')) { $('preset').value = 'custom'; $('start').value = initial.get('start_date'); $('end').value = initial.get('end_date') || ''; }
$('incomplete').checked = initial.get('include_incomplete') !== '0';

$('preset').addEventListener('change', () => { if ($('preset').value !== 'custom') load(); });
bindDateInputs($('start'), $('end'), () => { $('preset').value = 'custom'; load(); });
$('incomplete').addEventListener('change', load);
$('export').addEventListener('click', exportCsv);
$('toggle-side').addEventListener('click', () => document.querySelector('.shell').classList.toggle('collapsed'));
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { showTab(b.dataset.tab); history.replaceState(null, '', `#${b.dataset.tab}`); }));
if (location.hash) showTab(location.hash.slice(1));

let version = null;
setInterval(async () => {
  if (document.hidden) return;
  try {
    const v = await api('/api/version');
    $('side-sync').textContent = `Synced ${new Date(v.lastRunAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    if (version !== null && v.version !== version) load();
    version = v.version;
  } catch { /* retry next tick */ }
}, 10_000);

sidebar();
load();
