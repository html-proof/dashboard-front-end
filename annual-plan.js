// Annual plan page. Defaults and actuals come from /api/plan (Shopify history); edits are saved with PUT /api/plan.
const $ = (id) => document.getElementById(id);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let currency = 'AUD';
let plan = null;
let dirty = false;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v, d = 2) => (isNum(v) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '—');
const count = (v) => (isNum(v) ? new Intl.NumberFormat('en-AU').format(v) : '—');
const val = (v) => (v == null ? '' : String(v));

async function api(path, init = {}) {
  const key = sessionStorage.getItem('dashboardKey');
  const response = await fetch(path, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && body.category === 'dashboard_auth') {
    const entered = prompt('Dashboard API key');
    if (entered) { sessionStorage.setItem('dashboardKey', entered); return api(path, init); }
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function render(p) {
  plan = p; dirty = false;
  currency = p.currency || currency;
  $('year-note').textContent = p.saved ? `Saved plan · last updated ${new Date(p.updatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not saved yet — showing Shopify-based defaults';
  $('growth').value = val(p.settings.growthPct);
  $('costpct').value = val(p.settings.costPct);
  $('landed').value = val(p.settings.landedCost);
  const m = p.measured;
  $('costpct-note').textContent = m.costPct != null ? `Measured last 12 months: ${m.costPct}%${m.coverage != null && m.coverage < 1 ? ` (costs cover ${(m.coverage * 100).toFixed(0)}% of sales)` : ''}` : 'No product cost history';
  $('landed-note').textContent = m.landedCost != null ? `Average cost of units sold, last 12 months: ${money(m.landedCost)}` : 'No unit cost history';

  const t = p.totals;
  const card = (label, value, hint) => `<div class="kpi"><div class="label">${esc(label)}</div>${value == null ? '<div class="value empty">No data available</div>' : `<div class="value">${esc(value)}</div>`}<div class="hint">${esc(hint)}</div></div>`;
  $('cards').innerHTML = [
    card('Annual revenue target', t.revenueTarget == null ? null : money(t.revenueTarget, 0), `Forecasts + your monthly overrides (excl. tax)${isNum(t.actual) ? ` · actual so far ${money(t.actual, 0)}` : ''}`),
    card('Stock budget', t.stockBudget == null ? null : money(t.stockBudget, 0), 'Planned purchasing budget; excludes stock on hand'),
    card('Required units', t.requiredUnits == null ? null : count(t.requiredUnits), `${count(t.orderedUnits ?? 0)} units ordered`)
  ].join('');

  const input = (month, field, value, auto, format, extra = '') => `<input class="cell" data-month="${month}" data-field="${field}" type="number" min="0" step="${field.includes('nits') ? 1 : 0.01}" value="${esc(val(value))}" placeholder="Auto" ${extra}>
    ${auto !== undefined ? `<small class="muted">Auto: ${esc(format(auto))}</small>` : ''}`;
  const rows = p.months.map((r) => `<tr>
    <td class="pr-metric"><strong>${MONTHS[r.month - 1]}</strong></td>
    <td><input class="cell" data-month="${r.month}" data-field="baseline" type="number" min="0" step="0.01" value="${esc(val(r.baselineSource === 'override' ? r.baseline : ''))}" placeholder="${r.shopifyBaseline != null ? esc(r.shopifyBaseline.toFixed(2)) : 'Enter'}">
      <small class="muted">${r.shopifyBaseline != null ? `Shopify ${plan.year - 1}: ${esc(money(r.shopifyBaseline))}` : `No Shopify sales in ${plan.year - 1}`}</small></td>
    <td><input class="cell theme" data-month="${r.month}" data-field="theme" type="text" maxlength="120" value="${esc(r.theme)}"></td>
    <td>${input(r.month, 'forecast', r.forecastOverride, r.autoForecast, (v) => money(v))}</td>
    <td class="num">${esc(money(r.dailyTarget))}</td>
    <td class="num">${esc(money(r.actual))}<br><small class="muted">${r.completedDays} completed day${r.completedDays === 1 ? '' : 's'}${isNum(r.actual) && isNum(r.forecast) && r.forecast > 0 ? ` · ${((r.actual / r.forecast) * 100).toFixed(0)}% of forecast` : ''}</small></td>
    <td>${input(r.month, 'stockBudget', r.stockOverride, r.autoStock, (v) => money(v))}</td>
    <td>${input(r.month, 'requiredUnits', r.unitsOverride, r.autoUnits, (v) => count(v))}</td>
    <td>${input(r.month, 'orderedUnits', r.orderedUnits, undefined)}</td>
  </tr>`).join('');
  $('plan').innerHTML = `<table class="pr-table plan-table"><thead><tr><th class="pr-metric">Month</th><th>Baseline excl. tax</th><th>Sales theme</th><th>Revenue forecast</th><th class="num">Daily target</th><th class="num">Actual revenue</th><th>Stock budget</th><th>Required units</th><th>Ordered units</th></tr></thead><tbody>${rows}</tbody></table>`;
  $('save-status').textContent = '';
}

function collect() {
  const months = new Map(plan.months.map((m) => [m.month, { month: m.month }]));
  document.querySelectorAll('.cell').forEach((el) => { months.get(Number(el.dataset.month))[el.dataset.field] = el.value === '' ? null : el.dataset.field === 'theme' ? el.value : Number(el.value); });
  return {
    year: plan.year,
    growthPct: $('growth').value === '' ? null : Number($('growth').value),
    costPct: $('costpct').value === '' || Number($('costpct').value) === plan.measured.costPct ? (plan.settings.costPctSource === 'override' && $('costpct').value !== '' ? Number($('costpct').value) : null) : Number($('costpct').value),
    landedCost: $('landed').value === '' || Number($('landed').value) === plan.measured.landedCost ? (plan.settings.landedCostSource === 'override' && $('landed').value !== '' ? Number($('landed').value) : null) : Number($('landed').value),
    months: [...months.values()]
  };
}

async function save() {
  $('save-status').textContent = 'Saving…';
  try {
    await api('/api/plan', { method: 'PUT', body: JSON.stringify(collect()) });
    await load();
    $('save-status').textContent = 'Saved.';
  } catch (error) { $('save-status').textContent = error.message; }
}

async function load() {
  const year = Number($('year').value);
  history.replaceState(null, '', `?year=${year}`);
  document.body.classList.add('loading');
  try { render(await api(`/api/plan?year=${year}`)); }
  catch (error) { $('plan').innerHTML = `<p class="empty">${esc(error.message)}</p>`; }
  finally { document.body.classList.remove('loading'); }
}

async function sidebar() {
  try {
    const s = await api('/api/status');
    $('side-store').textContent = s.store?.name || '—';
    $('side-store-meta').textContent = s.store ? `${s.store.primary_domain || s.shop} · ${s.store.currency}` : '';
    $('side-initials').textContent = (s.store?.name || '··').slice(0, 2).toUpperCase();
  } catch { /* shown by main load */ }
}

const thisYear = new Date().getFullYear();
$('year').innerHTML = [thisYear - 1, thisYear, thisYear + 1].map((y) => `<option value="${y}">${y}</option>`).join('');
$('year').value = new URLSearchParams(location.search).get('year') || thisYear;
$('year').addEventListener('change', () => { if (dirty && !confirm('You have unsaved changes. Switch year anyway?')) { $('year').value = plan.year; return; } load(); });
$('save-top').addEventListener('click', save);
$('save-bottom').addEventListener('click', save);
document.addEventListener('input', (e) => { if (e.target.closest('.plan-settings, #plan')) { dirty = true; $('save-status').textContent = 'Unsaved changes'; } });
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
$('toggle-side').addEventListener('click', () => document.querySelector('.shell').classList.toggle('collapsed'));

sidebar();
load();
