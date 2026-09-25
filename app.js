// Dashboard client. Every value comes from this backend; nothing is hard-coded or estimated here.
// Anything the backend reports as unavailable is shown as "No data available".
import { restoreRange, saveRange, bindDateInputs } from './range-store.js';
import { chart as drawChart } from './charts.js';
const $ = (id) => document.getElementById(id);
const NO_DATA = 'No data available';
let currency = 'AUD';
let lastOverview = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const money = (value, digits = 0) => (isNum(value) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value) : NO_DATA);
const compactMoney = (value) => (isNum(value) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value) : '');
const count = (value) => (isNum(value) ? new Intl.NumberFormat('en-AU').format(value) : NO_DATA);
const pct = (value) => (isNum(value) ? `${(value * 100).toFixed(1)}%` : NO_DATA);
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const shortDate = (ymd) => { const d = new Date(`${ymd}T00:00:00`); return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
const status = (value) => (value ? `<span class="badge">${esc(value.replace(/_/g, ' ').toLowerCase())}</span>` : '—');

async function api(path, init = {}) {
  const key = sessionStorage.getItem('dashboardKey');
  const response = await fetch((window.API_BASE || "") + path, { ...init, headers: key ? { authorization: `Bearer ${key}` } : {} });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && body.category === 'dashboard_auth') {
    const entered = prompt('Dashboard API key');
    if (entered) { sessionStorage.setItem('dashboardKey', entered); return api(path, init); }
  }
  if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { body });
  return body;
}

// ---- generic renderers ---------------------------------------------------------------------
function table(el, rows, columns) {
  if (!rows?.length) { el.innerHTML = `<p class="empty">${NO_DATA}</p>`; return; }
  el.innerHTML = `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(row) : esc(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function bars(el, rows, { label, value, format }) {
  const data = (rows || []).filter((row) => isNum(value(row)));
  if (!data.length) { el.innerHTML = `<p class="empty">${NO_DATA}</p>`; return; }
  const max = Math.max(...data.map(value), 0) || 1;
  el.innerHTML = `<div class="bars">${data.map((row) => `<div class="row"><span class="name" title="${esc(label(row))}">${esc(label(row))}</span>
    <span class="track"><span class="fill" style="width:${Math.max(0, (value(row) / max) * 100)}%;display:block"></span></span><span class="num">${esc(format(value(row)))}</span></div>`).join('')}</div>`;
}

// Smooth line (Catmull-Rom → Bézier) or bar chart; tooltips via <title>.
const chart = (el, points, opts) => drawChart(el, points, { tick: compactMoney, ...opts });

function delta(current, previous) {
  if (!isNum(current) || !isNum(previous) || previous === 0) return '';
  const change = (current - previous) / Math.abs(previous);
  return `<span class="delta ${change >= 0 ? 'up' : 'down'}" title="vs previous period (${esc(money(previous))})">${change >= 0 ? '▲' : '▼'} ${Math.abs(change * 100).toFixed(1)}%</span>`;
}

// ---- landing sections ----------------------------------------------------------------------
function renderKpis(o) {
  const rep = o.shopifyReport?.available ? o.shopifyReport.current : null;
  const prev = o.previousPeriod?.report;
  const prof = o.profitability;
  const card = ({ label, value, empty, hint, help, dark }) => `<div class="kpi ${dark ? 'dark' : ''}">
    <div class="label">${esc(label)}<span class="help" title="${esc(help)}">?</span></div>
    ${empty ? `<div class="value empty">${NO_DATA}</div>` : `<div class="value">${value}</div>`}
    <div class="hint">${hint}</div></div>`;
  const hasProfit = prof?.available && isNum(prof.operatingProfit);
  const missingNote = prof?.missing?.length ? `Excludes ${prof.missing.join(', ')} (not set up)` : 'All cost sources included';
  const platforms = Object.entries(prof?.adSpendByPlatform || {}).map(([k, v]) => `${k} ${money(v)}`).join(' · ');
  $('kpis').innerHTML = [
    card({ label: 'Net revenue', value: `${esc(money(rep?.netSales))}${delta(rep?.netSales, prev?.netSales)}`, empty: !isNum(rep?.netSales),
      hint: 'Excl. tax, after discounts and returns', help: 'Shopify net sales: gross sales − discounts − returns, excluding tax. Source: Shopify Analytics.' }),
    card({ label: 'Operating profit', value: `<span class="${hasProfit && prof.operatingProfit < 0 ? 'neg' : ''}">${esc(money(prof?.operatingProfit))}</span>`, empty: !hasProfit, dark: true,
      hint: esc(hasProfit ? missingNote : prof?.reason || NO_DATA), help: prof?.definitions?.operatingProfit || '' }),
    card({ label: 'Ad spend', value: esc(money(prof?.adSpend)), empty: !prof?.configured?.adSpend,
      hint: esc(prof?.configured?.adSpend ? (platforms || 'No spend in this period') : 'No ad spend recorded yet'),
      help: 'Meta spend from the Marketing API (when connected) plus spend you enter for other platforms.' }),
    card({ label: 'Profit margin', value: `<span class="${prof?.profitMargin < 0 ? 'neg' : ''}">${esc(pct(prof?.profitMargin))}</span>`, empty: !isNum(prof?.profitMargin),
      hint: 'Operating profit ÷ net revenue', help: 'Operating profit divided by Shopify net sales for the period.' })
  ].join('');
}

function renderDaily(o) {
  const rep = o.shopifyReport; const prof = o.profitability;
  chart($('chart-main'), rep?.available ? prof?.trend : null, { value: (p) => p.netSales, second: (p) => p.expenses, secondLabel: 'expenses', format: (v) => money(v, 2) });
  $('expense-note').textContent = prof?.missing?.length ? `(excludes ${prof.missing.join(', ')})` : '';
  $('chart-source').textContent = rep?.available
    ? `Net sales: Shopify Analytics · expenses: product costs, ad spend, fixed & labour · by ${o.range.granularity}${prof?.productCostCoverage != null && prof.productCostCoverage < 1 ? ` · product costs cover ${(prof.productCostCoverage * 100).toFixed(0)}% of sales` : ''}`
    : `Shopify sales report unavailable: ${rep?.reason || ''}`;
}

function renderInsights(o) {
  const items = o.insights || [];
  $('insight-count').textContent = items.length;
  $('insights').innerHTML = items.length
    ? items.map((item, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p>
        <a class="link" href="#${esc({ costs: 'products', sales: 'sales', orders: 'orders', inventory: 'inventory', refunds: 'orders', funnel: 'funnel-section' }[item.target] || 'top')}">${esc(item.action)} →</a></div></li>`).join('')
    : '<li class="empty-state">Nothing in this period needs your attention.</li>';

  const lead = items.find((item) => item.severity === 'warning') || items.find((item) => item.severity === 'positive');
  const dq = o.dataQuality;
  const alert = $('alert');
  if (!dq.complete) {
    alert.hidden = false; alert.className = 'alert';
    $('alert-title').textContent = 'Data still loading'; $('alert-body').textContent = dq.message; $('alert-pill').textContent = 'Partial';
  } else if (lead) {
    alert.hidden = false; alert.className = `alert ${lead.severity === 'positive' ? 'positive' : ''}`;
    $('alert-title').textContent = lead.title; $('alert-body').textContent = lead.body; $('alert-pill').textContent = lead.severity === 'positive' ? 'Good news' : 'Action needed';
  } else alert.hidden = true;
}

function renderGoes(o) {
  const p = o.profitability;
  if (!p?.available) { $('goes').innerHTML = `<p class="empty">${NO_DATA}</p>`; $('goes-net').textContent = ''; return; }
  $('goes-net').textContent = `${money(p.netSales)} net`;
  const rows = [
    ['Product costs', p.productCosts, 'var(--bar-1)', p.configured.productCosts, p.productCostCoverage != null && p.productCostCoverage < 1 ? `covers ${(p.productCostCoverage * 100).toFixed(0)}% of sales` : ''],
    ['Payment fees', p.paymentFees, 'var(--bar-5)', true, 'Shopify Payments'],
    ['Advertising', p.adSpend, 'var(--bar-2)', p.configured.adSpend, ''],
    ['Fixed costs', p.fixedCosts, 'var(--bar-3)', p.configured.fixedCosts, ''],
    ['Labour', p.labour, 'var(--bar-4)', p.configured.labour, '']
  ];
  const max = Math.max(p.netSales || 0, ...rows.map((r) => r[1] || 0)) || 1;
  $('goes').innerHTML = `${rows.map(([label, value, color, ok, note]) => `<div class="goes-row"><div class="top"><span>${esc(label)}${note ? ` <small class="muted">${esc(note)}</small>` : ''}</span>
      <span>${ok ? esc(money(value)) : '<span class="muted">Not set up</span>'}</span></div>
      <div class="track"><div class="fill" style="width:${ok && isNum(value) ? Math.min(100, (value / max) * 100) : 0}%;background:${color}"></div></div></div>`).join('')}
    <div class="goes-total profit ${p.operatingProfit < 0 ? 'neg' : 'pos'}"><span>Operating profit</span><span>${esc(money(p.operatingProfit))}</span></div>
    ${p.warnings.map((w) => `<p class="muted note">${esc(w)}</p>`).join('')}`;
}

function renderPerf(o) {
  const rep = o.shopifyReport?.available ? o.shopifyReport.current : null;
  const steps = o.funnel?.steps;
  const sessions = steps?.find((s) => s.key === 'sessions')?.value; const done = steps?.find((s) => s.key === 'completed')?.value;
  const conversion = isNum(sessions) && sessions > 0 && isNum(done) ? done / sessions : null;
  const cell = (label, value) => `<div><div class="label">${esc(label)}</div><div class="value ${value === NO_DATA ? 'empty' : ''}">${esc(value)}</div></div>`;
  $('perf').innerHTML = [
    cell('Orders', count(o.sales.current.orders)),
    cell('Average order value', money(rep ? rep.averageOrderValue : o.sales.current.averageOrderValue)),
    cell('Conversion rate', pct(conversion)),
    cell('New customer orders', count(o.customers.current.newCustomerOrders))
  ].join('');
  $('perf-foot').textContent = 'Orders and customers from the Shopify Admin API; AOV and conversion from Shopify Analytics.';
}

// ---- detail sections -----------------------------------------------------------------------
function renderFunnel(funnel) {
  if (!funnel) { $('funnel').innerHTML = `<p class="empty">${NO_DATA}</p>`; return; }
  const box = (title, source, steps, available, reason) => `<div class="funnel-box"><h3>${esc(title)}</h3><p>${esc(source)}</p>
    ${available && steps?.length ? steps.map((st) => `<div class="step"><span>${esc(st.label)}</span><strong>${esc(count(st.value))}</strong></div>`).join('') : `<p class="empty">${esc(reason || NO_DATA)}</p>`}</div>`;
  const a = funnel.shopifyAnalytics; const t = funnel.customTracking;
  $('funnel').innerHTML = [
    box('Shopify Analytics (sessions)', a.source, a.steps, a.available, a.reason),
    box('Shopify Admin API (orders)', funnel.shopifyOrders.source, [{ label: 'Confirmed purchases', value: funnel.shopifyOrders.purchases }], true),
    box('Custom storefront tracking', t.source, t.steps, t.available, 'No data available. Install the web pixel (pixel/web-pixel.js) to collect product views and payment attempts.')
  ].join('');
}

function renderReport(o) {
  const rep = o.shopifyReport; const s = o.sales.current;
  const rows = [
    ['Gross sales', rep?.current?.grossSales, s.grossSales], ['Discounts', rep?.current?.discounts, s.discounts],
    ['Returns / refunds', rep?.current?.returns, s.refunds], ['Net sales', rep?.current?.netSales, s.netSales],
    ['Taxes', rep?.current?.taxes, s.taxes], ['Shipping', rep?.current?.shipping, s.shipping], ['Total sales', rep?.current?.totalSales, s.totalSales]
  ];
  table($('table-report'), rows, [
    { label: 'Metric', value: (row) => row[0] },
    { label: 'Shopify report', num: true, value: (row) => (rep?.available ? money(row[1], 2) : NO_DATA) },
    { label: 'Order-based', num: true, value: (row) => money(row[2], 2) }
  ]);
  $('report-note').textContent = rep?.available ? `${rep.definitions} Order-based: prices as charged (incl. tax); refunds include shipping/tax; total before refunds.` : `Shopify report unavailable: ${rep?.reason || ''}`;
}

function renderDetails(o) {
  chart($('chart-orders'), o.trend, { value: (p) => p.orders, format: count, type: 'bar', tick: (v) => Math.round(v) });
  chart($('chart-refunds'), o.trend, { value: (p) => p.refunds, format: (v) => money(v, 2), type: 'bar' });
  chart($('chart-customers'), o.trend, { value: (p) => p.customers, format: count, tick: (v) => Math.round(v) });
  bars($('bars-products'), o.topProducts, { label: (r) => r.title, value: (r) => r.revenue, format: (v) => money(v) });
  bars($('bars-channel'), o.salesByChannel, { label: (r) => r.label, value: (r) => r.totalSales, format: (v) => money(v) });
  bars($('bars-location'), o.salesByLocation, { label: (r) => r.label, value: (r) => r.totalSales, format: (v) => money(v) });
  renderReport(o);
  const orderCols = [
    { label: 'Order', value: (x) => x.name }, { label: 'Date', value: (x) => dateTime(x.processedAt) }, { label: 'Customer', value: (x) => x.customer || '—' },
    { label: 'Items', num: true, value: (x) => x.units }, { label: 'Total', num: true, value: (x) => money(x.total, 2) },
    { label: 'Payment', html: (x) => status(x.paymentStatus) }, { label: 'Fulfillment', html: (x) => status(x.fulfillmentStatus) }, { label: 'Channel', value: (x) => x.channel || '—' }
  ];
  table($('table-orders'), o.latestOrders, orderCols);
  table($('table-products'), o.topProducts, [{ label: 'Product', value: (p) => p.title }, { label: 'Units', num: true, value: (p) => count(p.units) }, { label: 'Revenue', num: true, value: (p) => money(p.revenue, 2) }]);
  table($('table-customers'), o.topCustomers, [{ label: 'Customer', value: (c) => c.name || '—' }, { label: 'Orders', num: true, value: (c) => c.orders }, { label: 'Spend', num: true, value: (c) => money(c.spend, 2) }, { label: 'Lifetime', num: true, value: (c) => money(c.lifetimeSpend, 2) }]);
  table($('table-inventory'), o.lowInventory, [{ label: 'Product', value: (i) => i.product }, { label: 'Variant', value: (i) => i.variant }, { label: 'SKU', value: (i) => i.sku || '—' }, { label: 'Location', value: (i) => i.location || '—' }, { label: 'Available', num: true, value: (i) => i.available }]);
  table($('table-refunded'), o.refundedOrders, [{ label: 'Order', value: (x) => x.name }, { label: 'Date', value: (x) => dateTime(x.processedAt) }, { label: 'Refunded', num: true, value: (x) => money(x.refunded, 2) }, { label: 'Status', html: (x) => status(x.paymentStatus) }]);
  table($('table-cancelled'), o.cancelledOrders, [{ label: 'Order', value: (x) => x.name }, { label: 'Date', value: (x) => dateTime(x.processedAt) }, { label: 'Total', num: true, value: (x) => money(x.total, 2) }, { label: 'Reason', value: (x) => (x.cancelReason || '—').toLowerCase() }]);
  table($('table-missing-costs'), o.profitability?.missingCostProducts, [{ label: 'Product', value: (x) => x.title }, { label: 'Variant', value: (x) => x.variant || '—' }, { label: 'SKU', value: (x) => x.sku || '—' }, { label: 'Units', num: true, value: (x) => x.units }, { label: 'Revenue', num: true, value: (x) => money(x.revenue, 2) }]);
  if (!o.profitability?.missingCostProducts?.length) $('table-missing-costs').innerHTML = '<p class="empty">Every product sold in this period has a cost price.</p>';
  const iq = o.inventoryQuality;
  $('inventory-note').hidden = !iq || iq.complete; $('inventory-note').textContent = iq?.message || '';
}

function render(o, funnel) {
  lastOverview = o;
  currency = o.currency || currency;
  const store = o.store;
  $('side-store').textContent = store?.name || '—';
  $('side-store-meta').textContent = store ? `${store.primary_domain || store.shop} · ${store.currency}` : '';
  $('side-initials').textContent = (store?.name || '··').slice(0, 2).toUpperCase();
  const r = o.range;
  $('start').value = r.startDate; $('end').value = r.endDate;
  $('meta-left').textContent = `${o.currency} · ${o.timezone} · Revenue excludes tax`;
  $('meta-right').textContent = `${r.startDate === r.endDate ? 1 : Math.round((new Date(r.endDate) - new Date(r.startDate)) / 86400000) + 1} reported days`;
  $('days-chip').textContent = $('meta-right').textContent.replace(' reported', '');
  $('source-line').textContent = `ⓘ Live Shopify data for ${store?.name || 'your store'}. Last updated ${dateTime(o.dataQuality.lastSync?.orders)}.`;
  $('foot-right').textContent = `Live Shopify data · generated ${dateTime(o.generatedAt)}`;

  renderKpis(o); renderDaily(o); renderInsights(o); renderGoes(o); renderPerf(o);
  renderDetails(o); renderFunnel(funnel);
}

// ---- data loading --------------------------------------------------------------------------
function query() {
  const params = new URLSearchParams();
  const preset = $('preset').value;
  if (preset === 'custom') { params.set('start_date', $('start').value); params.set('end_date', $('end').value); } else params.set('preset', preset);
  if (!$('incomplete').checked) params.set('include_incomplete', '0');
  return params.toString();
}

async function load() {
  const q = query();
  history.replaceState(null, '', `?${q}${location.hash}`);
  saveRange(q);
  document.body.classList.add('loading');
  try {
    const [overview, funnel] = await Promise.all([api(`/api/dashboard/overview?${q}`), api(`/api/dashboard/funnel?${q}`).catch(() => null)]);
    render(overview, funnel);
  } catch (error) {
    $('alert').hidden = false; $('alert').className = 'alert';
    $('alert-title').textContent = 'Could not load live data'; $('alert-body').textContent = error.message; $('alert-pill').textContent = 'Error';
  } finally { document.body.classList.remove('loading'); }
}

async function renderSync() {
  try {
    const s = await api('/api/status');
    const running = s.sync.inProgress.map((p) => `${p.resource} (${p.fetched.toLocaleString()})`).join(', ');
    const ok = s.connected && !s.token.revoked;
    $('side-conn').textContent = ok ? 'Shopify connected' : 'Shopify disconnected';
    $('side-sync').textContent = running ? `Syncing ${running}` : `Synced ${new Date(s.sync.resources.map((r) => r.last_run_at).sort().pop()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    $('live-badge').textContent = ok ? 'LIVE · SHOPIFY' : 'RECONNECT SHOPIFY';
    $('live-badge').classList.toggle('off', !ok);
    return s.sync.running;
  } catch (error) { $('side-sync').textContent = error.message; return false; }
}

function exportCsv() {
  const o = lastOverview; if (!o) return;
  const rep = o.shopifyReport?.available ? o.shopifyReport : null;
  const lines = [['Store', o.store?.name], ['Range', `${o.range.startDate} to ${o.range.endDate}`], ['Currency', o.currency], ['Source', 'Shopify Admin API + Shopify Analytics'], []];
  lines.push(['Metric', 'Value']);
  const cur = rep?.current || {};
  for (const [k, v] of [['Gross sales', cur.grossSales], ['Discounts', cur.discounts], ['Returns', cur.returns], ['Net sales', cur.netSales], ['Taxes', cur.taxes], ['Shipping', cur.shipping], ['Total sales', cur.totalSales], ['Average order value', cur.averageOrderValue], ['Orders', o.sales.current.orders], ['Units sold', o.sales.current.units], ['New customer orders', o.customers.current.newCustomerOrders]]) lines.push([k, isNum(v) ? v : NO_DATA]);
  const p = o.profitability || {};
  for (const [k, v] of [['Product costs', p.productCosts], ['Ad spend', p.adSpend], ['Fixed costs', p.fixedCosts], ['Labour', p.labour], ['Operating profit', p.operatingProfit], ['Profit margin', p.profitMargin]]) lines.push([k, isNum(v) ? v : NO_DATA]);
  for (const w of p.warnings || []) lines.push(['Note', w]);
  lines.push([]);
  if (rep?.trend?.length) { lines.push(['Period', 'Net sales', 'Orders', 'Total sales']); for (const p of rep.trend) lines.push([p.period, p.netSales, p.orders, p.totalSales]); }
  const csv = lines.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `report-${o.range.startDate}-to-${o.range.endDate}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ---- wiring --------------------------------------------------------------------------------
const initial = restoreRange();
if (initial.get('preset')) $('preset').value = initial.get('preset');
if (initial.get('start_date')) { $('preset').value = 'custom'; $('start').value = initial.get('start_date'); $('end').value = initial.get('end_date') || ''; }
$('incomplete').checked = initial.get('include_incomplete') !== '0';

$('preset').addEventListener('change', () => { if ($('preset').value !== 'custom') load(); });
bindDateInputs($('start'), $('end'), () => { $('preset').value = 'custom'; load(); });
$('incomplete').addEventListener('change', load);
$('export').addEventListener('click', exportCsv);
$('refresh').addEventListener('click', async () => { await api('/api/sync', { method: 'POST' }).catch(() => {}); renderSync(); });
$('toggle-side').addEventListener('click', () => document.querySelector('.shell').classList.toggle('collapsed'));
// Sidebar sections live on this page: highlight the one in the URL (#sales, #orders…) so a refresh keeps it.
function highlightSection() {
  const hash = location.hash || '#top';
  document.querySelectorAll('[data-nav]').forEach((l) => l.classList.toggle('active', l.getAttribute('href') === hash));
}
window.addEventListener('hashchange', highlightSection);
highlightSection();

// Live updates: the backend syncs Shopify every ~10s. Poll its data version every 10s and reload
// only when something changed. Polling pauses while the tab is hidden.
const POLL_MS = 10_000;
let knownVersion = null;
let reloading = false;
async function poll() {
  if (document.hidden || reloading) return;
  try {
    const v = await api('/api/version');
    $('side-sync').textContent = v.syncing.length ? `Syncing ${v.syncing.join(', ')}…` : `Synced ${new Date(v.lastRunAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    if (knownVersion !== null && v.version !== knownVersion) { reloading = true; await load(); reloading = false; }
    knownVersion = v.version;
  } catch { /* transient; next poll retries */ }
}

// After a refresh the browser tries to jump to #section before the data has rendered, so the section
// isn't at its final position yet. Scroll again once the first load has finished.
load().then(() => {
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView();
});

renderSync();
poll();
setInterval(poll, POLL_MS);
setInterval(renderSync, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
