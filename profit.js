// Profit report page. All values come from /api/dashboard/profitreport; "—" means unavailable.
import { chart } from './charts.js';
import { restoreRange, saveRange, bindDateInputs } from './range-store.js';
const $ = (id) => document.getElementById(id);
let currency = 'AUD';
let granularity = 'day';
let last = null;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (v, format) => {
  if (!isNum(v)) return '—';
  if (format === 'money') return new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (format === 'percent') return `${(v * 100).toFixed(1)}%`;
  return new Intl.NumberFormat('en-AU').format(v);
};
const periodLabel = (p) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return new Date(`${p}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  if (/^\d{4}-\d{2}$/.test(p)) return new Date(`${p}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  return p;
};

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

function query() {
  const params = new URLSearchParams();
  const preset = $('preset').value;
  if (preset === 'custom') { params.set('start_date', $('start').value); params.set('end_date', $('end').value); } else params.set('preset', preset);
  if (!$('incomplete').checked) params.set('include_incomplete', '0');
  params.set('granularity', granularity);
  return params.toString();
}

function render(d) {
  last = d;
  currency = d.currency || currency;
  $('start').value = d.range.startDate; $('end').value = d.range.endDate;
  $('meta-left').textContent = `${d.currency} · ${d.timezone} · Revenue excludes tax`;
  $('meta-right').textContent = `${d.periods.length} reported ${d.granularity === 'month' ? 'months' : 'days'}`;
  $('source-line').textContent = `ⓘ Live Shopify data${d.dataQuality.complete ? '' : ` — ${d.dataQuality.message}`}`;
  $('foot-right').textContent = `Live Shopify data · generated ${new Date(d.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const head = `<tr><th class="pr-metric">Metric</th><th class="pr-total num">Period total</th>${d.periods.map((p) => `<th class="num">${esc(periodLabel(p))}</th>`).join('')}</tr>`;
  const body = d.sections.map((section) => section.rows.map((row, i) => `<tr class="${i === 0 ? 'pr-first' : ''} ${row.strong ? 'pr-strong' : ''}">
      <td class="pr-metric">${i === 0 ? `<span class="pr-section" title="${esc(section.source)}">${esc(section.title)}</span>` : ''}${esc(row.label)}</td>
      <td class="pr-total num">${esc(fmt(row.total, row.format))}</td>
      ${row.values.map((v) => `<td class="num ${isNum(v) && v < 0 ? 'neg' : ''}">${esc(fmt(v, row.format))}</td>`).join('')}</tr>`).join('')).join('');
  const rowOf = (label) => d.sections.flatMap((sec) => sec.rows).find((r) => r.label.startsWith(label));
  const net = rowOf('Net sales'); const exp = rowOf('Total expenses');
  chart($('profit-chart'), d.periods.map((p, i) => ({ period: p, net: net?.values[i], exp: exp?.values[i] })), {
    value: (p) => p.net, second: (p) => p.exp, secondLabel: 'expenses', label: (p) => periodLabel(p.period),
    format: (v) => fmt(v, 'money'), tick: (v) => new Intl.NumberFormat('en-AU', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  });
  $('report').innerHTML = `<table class="pr-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;

  const notes = [
    'Revenue lines use Shopify’s sales report (tax-exclusive net sales). Product costs use each variant’s current Shopify “Cost per item”. Recurring costs are spread evenly per day. A dash means unavailable, never a confirmed zero. Profit margin uses revenue excluding tax.',
    ...d.warnings
  ];
  $('notes').innerHTML = `<span class="callout-icon">ⓘ</span><div>${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`;
}

async function load() {
  history.replaceState(null, '', `?${query()}`);
  saveRange(query());
  document.body.classList.add('loading');
  try { render(await api(`/api/dashboard/profitreport?${query()}`)); }
  catch (error) { $('report').innerHTML = `<p class="empty">${esc(error.message)}</p>`; }
  finally { document.body.classList.remove('loading'); }
}

function exportCsv() {
  if (!last) return;
  const rows = [['Metric', 'Period total', ...last.periods]];
  for (const section of last.sections) {
    rows.push([section.title.toUpperCase()]);
    for (const row of section.rows) rows.push([row.label, row.total ?? '', ...row.values.map((v) => v ?? '')]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `profit-report-${last.range.startDate}-to-${last.range.endDate}.csv`;
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

// Restore state from the URL.
const initial = restoreRange();
if (initial.get('preset')) $('preset').value = initial.get('preset');
if (initial.get('start_date')) { $('preset').value = 'custom'; $('start').value = initial.get('start_date'); $('end').value = initial.get('end_date') || ''; }
$('incomplete').checked = initial.get('include_incomplete') !== '0';
if (initial.get('granularity') === 'month') granularity = 'month';
document.querySelectorAll('[data-gran]').forEach((b) => b.classList.toggle('on', b.dataset.gran === granularity));

$('preset').addEventListener('change', () => { if ($('preset').value !== 'custom') load(); });
bindDateInputs($('start'), $('end'), () => { $('preset').value = 'custom'; load(); });
$('incomplete').addEventListener('change', load);
$('export').addEventListener('click', exportCsv);
$('toggle-side').addEventListener('click', () => document.querySelector('.shell').classList.toggle('collapsed'));
document.querySelectorAll('[data-gran]').forEach((button) => button.addEventListener('click', () => {
  granularity = button.dataset.gran;
  document.querySelectorAll('[data-gran]').forEach((b) => b.classList.toggle('on', b === button));
  load();
}));

// Live updates, same as the overview: reload when the backend's data version changes.
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
