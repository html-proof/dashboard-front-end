// Staff & hours page. All values come from /api/dashboard/staff (records entered by the business).
import { restoreRange, saveRange, bindDateInputs } from './range-store.js';
const $ = (id) => document.getElementById(id);
let currency = 'AUD';
let last = null;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v) => (isNum(v) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : '—');
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const METHOD_NOTE = {
  fixed_payroll: 'Fixed payroll mode is active. Labour in profit comes from the labour entries on the Costs page; shifts recorded here are for review and do not add another expense. Changing the method recalculates every report period.',
  timesheets: 'Timesheet mode is active. Labour in profit is the cost of the shifts recorded here (hours × rate × (1 + on-costs) + extra costs); labour entries on the Costs page are ignored so payroll is not counted twice.'
};

async function api(path, init = {}) {
  const key = sessionStorage.getItem('dashboardKey');
  const response = await fetch((window.API_BASE || "") + path, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && body.category === 'dashboard_auth') {
    const entered = prompt('Dashboard API key');
    if (entered) { sessionStorage.setItem('dashboardKey', entered); return api(path, init); }
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function table(el, rows, columns, empty) {
  if (!rows?.length) { el.innerHTML = `<p class="empty">${esc(empty)}</p>`; return; }
  el.innerHTML = `<div class="table-wrap"><table class="ss-table"><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(row) : esc(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function render(d) {
  last = d;
  currency = d.currency || currency;
  $('start').value = d.range.startDate; $('end').value = d.range.endDate;
  $('meta-left').textContent = `${d.currency} · ${d.timezone}`;
  $('meta-right').textContent = `${d.days} reported days`;
  $('source-line').textContent = 'ⓘ Staff and shifts are the records you enter here. Shopify does not provide wages or timesheets.';
  $('foot-right').textContent = `Generated ${new Date(d.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const c = d.cards;
  const card = (label, value, hint) => `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="hint">${esc(hint)}</div></div>`;
  $('cards').innerHTML = [
    card('Staff', String(c.staffWithShifts), `${c.staffWithShifts} ${c.staffWithShifts === 1 ? 'person' : 'people'} with shifts in this period`),
    card('Paid hours · average rate', `${c.paidHours ?? 0} h`, `${isNum(c.averageRate) ? money(c.averageRate) : '—'} / hour before on-costs`),
    card('Recorded labour expense', money(c.labourExpense), d.method === 'timesheets' ? 'Wages + on-costs + extra costs; included in profit' : 'Wages + on-costs + extra costs; not added to profit (fixed payroll mode)')
  ].join('');

  $('method').value = d.method;
  $('method-note').textContent = METHOD_NOTE[d.method];

  table($('shift-list'), d.shifts, [
    { label: 'Date / staff', html: (s) => `${esc(day(s.date))}<br><small class="muted">${esc(s.staff)}${s.role ? ` · ${esc(s.role)}` : ''}</small>` },
    { label: 'Paid hours', num: true, value: (s) => `${s.hours} h` },
    { label: 'Rate', num: true, value: (s) => money(s.rate) },
    { label: 'On-costs', num: true, value: (s) => money(s.onCosts) },
    { label: 'Extra', num: true, value: (s) => money(s.extraCosts) },
    { label: 'Total', num: true, value: (s) => money(s.total) },
    { label: 'Status', html: (s) => `<span class="badge ${s.status.startsWith('Included') ? 'good' : ''}">${esc(s.status)}</span>` },
    { label: '', html: (s) => `<button class="del" data-shift="${s.id}">Remove</button>` }
  ], d.staff.length ? 'No shifts recorded in this period. Use “Add shift”.' : 'Add a staff member in Staff records, then record their shifts for this period.');

  table($('staff-list'), d.staff, [
    { label: 'Name', value: (s) => s.name }, { label: 'Role', value: (s) => s.role || '—' },
    { label: 'Hourly rate', num: true, value: (s) => money(s.hourlyRate) }, { label: 'On-costs', num: true, value: (s) => `${s.onCostPct}%` },
    { label: 'Status', html: (s) => `<span class="badge ${s.active ? 'good' : ''}">${s.active ? 'Active' : 'Inactive'}</span>` },
    { label: '', html: (s) => (s.active ? `<button class="del" data-staff="${s.id}">Remove</button>` : '') }
  ], 'No staff records yet. Use “Add staff member”.');

  $('clocking').innerHTML = `<div class="table-wrap"><table class="ss-table"><thead><tr><th>Source</th><th>Status</th><th>Detail</th></tr></thead><tbody>
    <tr><td>Manual timesheets</td><td><span class="badge good">Active</span></td><td>Shifts entered on this page</td></tr>
    <tr><td>Shopify POS staff</td><td><span class="badge">Not connected</span></td><td>Shopify's staff list needs Shopify Plus and holds no wages or timesheets</td></tr>
    <tr><td>Clock-in / payroll system</td><td><span class="badge">Not connected</span></td><td>No clocking or payroll system is connected; shifts must be entered here</td></tr>
  </tbody></table></div>`;

  $('shift-staff').innerHTML = d.staff.filter((s) => s.active).map((s) => `<option value="${s.id}">${esc(s.name)} — ${esc(money(s.hourlyRate))}/h</option>`).join('');
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
  try { render(await api(`/api/dashboard/staff?${query()}`)); }
  catch (error) { $('cards').innerHTML = `<p class="empty">${esc(error.message)}</p>`; }
  finally { document.body.classList.remove('loading'); }
}

function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(data)) if (data[key] === '') delete data[key];
  return data;
}

async function submit(form, url, errorEl, dialog) {
  errorEl.hidden = true;
  try { await api(url, { method: 'POST', body: JSON.stringify(formData(form)) }); dialog.close(); load(); }
  catch (error) { errorEl.textContent = error.message; errorEl.hidden = false; }
}

$('add-shift').addEventListener('click', () => {
  if (!last?.staff.some((s) => s.active)) { showTab('staff'); $('add-staff').click(); return; }
  $('shift-form').reset(); $('shift-error').hidden = true;
  $('shift-form').elements.date.value = new Date().toLocaleDateString('en-CA');
  $('shift-dialog').showModal();
});
$('add-staff').addEventListener('click', () => { $('staff-form').reset(); $('staff-error').hidden = true; $('staff-dialog').showModal(); });
$('shift-form').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/api/shifts', $('shift-error'), $('shift-dialog')); });
$('staff-form').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/api/staff', $('staff-error'), $('staff-dialog')); });
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('save-method').addEventListener('click', async () => {
  if (!confirm('Change how staff costs enter the profit report? All report periods will be recalculated.')) return;
  try { await api('/api/settings/labour-method', { method: 'PUT', body: JSON.stringify({ method: $('method').value }) }); load(); }
  catch (error) { alert(error.message); }
});
document.addEventListener('click', async (event) => {
  const shift = event.target.closest('[data-shift]'); const staff = event.target.closest('[data-staff]');
  if (shift && confirm('Remove this shift?')) { await api(`/api/shifts/${shift.dataset.shift}`, { method: 'DELETE' }).catch((e) => alert(e.message)); load(); }
  if (staff && confirm('Remove this staff member? If they have shifts they are marked inactive so history is kept.')) { await api(`/api/staff/${staff.dataset.staff}`, { method: 'DELETE' }).catch((e) => alert(e.message)); load(); }
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

sidebar();
load();
