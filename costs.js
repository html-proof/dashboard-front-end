// Costs page. All values come from /api/dashboard/costs; "—" means not reported / not set up.
import { restoreRange, saveRange, bindDateInputs } from './range-store.js';
const $ = (id) => document.getElementById(id);
let currency = 'AUD';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v, digits = 2) => (isNum(v) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v) : '—');
const pct = (v) => (isNum(v) ? `${(v * 100).toFixed(2)}%` : '—');
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const FREQ = { daily: 'per day', weekly: 'per week', monthly: 'per month', yearly: 'per year', one_off: 'one-off' };

function headers(json) {
  const key = sessionStorage.getItem('dashboardKey');
  return { ...(json ? { 'content-type': 'application/json' } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

async function api(path, init = {}) {
  const response = await fetch((window.API_BASE || "") + path, { ...init, headers: headers(Boolean(init.body)) });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && body.category === 'dashboard_auth') {
    const entered = prompt('Dashboard API key');
    if (entered) { sessionStorage.setItem('dashboardKey', entered); return api(path, init); }
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function table(el, rows, columns, empty = 'No data available') {
  if (!rows?.length) { el.innerHTML = `<p class="empty">${esc(empty)}</p>`; return; }
  el.innerHTML = `<div class="table-wrap"><table class="ss-table"><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(row) : esc(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function render(d) {
  currency = d.currency || currency;
  $('start').value = d.range.startDate; $('end').value = d.range.endDate;
  $('meta-left').textContent = `${d.currency} · ${d.timezone} · Revenue excludes tax`;
  $('meta-right').textContent = `${d.days} reported days`;
  $('source-line').textContent = 'ⓘ Variable costs come from Shopify; fixed costs and labour are the amounts you add here.';
  $('foot-right').textContent = `Live Shopify data · generated ${new Date(d.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const card = (label, value, hint) => `<div class="kpi"><div class="label">${esc(label)}</div>
    ${isNum(value) ? `<div class="value">${esc(money(value, 0))}</div>` : '<div class="value empty">No data available</div>'}<div class="hint">${esc(hint)}</div></div>`;
  $('cards').innerHTML = [
    card('Fixed costs', d.fixed.total, d.fixed.total == null ? 'No fixed costs added yet' : 'Allocated overheads for these days'),
    card('Variable costs', d.variable.total, 'Product costs + payment fees, from Shopify'),
    card('Timesheet labour', d.labour.total, d.labour.total == null ? 'No labour added yet' : 'Allocated labour for these days')
  ].join('');
  $('cost-note').textContent = `Totals cover the ${d.days} reported days selected above. Advertising spend is shown separately in the profit report. Costs that are not reported or not set up show “—”, never an assumed zero.`;

  $('fixed-total').textContent = money(d.fixed.total, 0);
  table($('fixed-by-cat'), d.fixed.byCategory, [{ label: 'Category', value: (r) => title(r.category) }, { label: 'Period total', num: true, value: (r) => money(r.total) }]);
  $('variable-total').textContent = money(d.variable.total, 0);
  table($('variable-by-cat'), d.variable.byCategory, [
    { label: 'Category', html: (r) => `${esc(title(r.category))}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}` },
    { label: 'Period total', num: true, value: (r) => money(r.total) }
  ]);

  table($('fixed-list'), [...d.fixed.entries, ...d.labour.entries], [
    { label: 'Name', value: (c) => c.name },
    { label: 'Type', value: (c) => (c.category === 'labour' ? 'Timesheet labour' : `Fixed · ${title(c.subcategory)}`) },
    { label: 'Amount', num: true, value: (c) => `${money(c.amount)} ${FREQ[c.frequency]}` },
    { label: 'Active', value: (c) => `${c.startDate} → ${c.endDate || 'ongoing'}` },
    { label: 'This period', num: true, value: (c) => money(c.periodTotal) },
    { label: '', html: (c) => `<button class="del" data-cost="${c.id}">Remove</button>` }
  ], 'No fixed costs or labour added yet. Use “Add fixed cost”.');

  table($('variable-list'), d.variable.byCategory, [
    { label: 'Category', value: (r) => title(r.category) }, { label: 'Source', value: (r) => r.source },
    { label: 'Notes', value: (r) => r.note || '—' }, { label: 'Period total', num: true, value: (r) => money(r.total) }
  ]);
  table($('gateway-list'), d.variable.gateways, [
    { label: 'Gateway', value: (g) => g.gateway.replace(/_/g, ' ') }, { label: 'Orders', num: true, value: (g) => g.orders },
    { label: 'Sales', num: true, value: (g) => money(g.sales) },
    { label: 'Fees reported', num: true, value: (g) => (g.feesReported ? money(g.fees) : 'Not reported by Shopify') },
    { label: 'Effective rate', num: true, value: (g) => pct(g.effectiveRate) }
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
  try { render(await api(`/api/dashboard/costs?${query()}`)); }
  catch (error) { $('cards').innerHTML = `<p class="empty">${esc(error.message)}</p>`; }
  finally { document.body.classList.remove('loading'); }
}

function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
}

// Add-cost dialog.
const dialog = $('cost-dialog');
$('add-cost').addEventListener('click', () => {
  $('cost-form').reset(); $('cost-error').hidden = true;
  $('cost-form').elements.startDate.value = new Date().toLocaleDateString('en-CA');
  $('f-sub-wrap').hidden = false;
  dialog.showModal();
});
$('cancel').addEventListener('click', () => dialog.close());
$('f-category').addEventListener('change', () => { $('f-sub-wrap').hidden = $('f-category').value === 'labour'; });
$('cost-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  for (const key of Object.keys(data)) if (data[key] === '') delete data[key];
  data.amount = Number(data.amount);
  try {
    await api('/api/costs', { method: 'POST', body: JSON.stringify(data) });
    dialog.close(); load();
  } catch (error) { $('cost-error').textContent = error.message; $('cost-error').hidden = false; }
});
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cost]');
  if (button && confirm('Remove this cost? It will no longer be included in profit.')) {
    await api(`/api/costs/${button.dataset.cost}`, { method: 'DELETE' }).catch((e) => alert(e.message));
    load();
  }
});

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
