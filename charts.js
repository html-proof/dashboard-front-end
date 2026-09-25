// Shared SVG chart with a Line / Bar / Area switch (choice remembered per chart id in this browser).
// Used by every dashboard page: chart(element, points, { value, format, second?, secondLabel?, label?, type?, tick? }).
const NO_DATA = 'No data available';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const shortDate = (ymd) => { const d = new Date(`${ymd}T00:00:00`); return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };

function smoothPath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// Chart type switch (Line / Bar / Area) shown above each chart; the choice is remembered per chart in this browser.
const CHART_TYPES = [['line', 'Line'], ['bar', 'Bar'], ['area', 'Area']];
const chartArgs = new Map();
function savedChartType(id) { try { return localStorage.getItem(`chartType.${id}`); } catch { return null; } }
function chartSwitch(el, current) {
  let bar = el.previousElementSibling;
  if (!bar?.classList.contains('chart-switch')) {
    bar = document.createElement('div');
    bar.className = 'segmented chart-switch';
    bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Chart type');
    bar.innerHTML = CHART_TYPES.map(([t, name]) => `<button type="button" data-type="${t}">${name}</button>`).join('');
    bar.addEventListener('click', (event) => {
      const t = event.target.closest('button')?.dataset.type; if (!t) return;
      try { localStorage.setItem(`chartType.${el.id}`, t); } catch { /* storage unavailable: choice lasts this render only */ }
      const [points, opts] = chartArgs.get(el); chart(el, points, { ...opts, type: t, forced: true });
    });
    el.before(bar);
  }
  for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.type === current);
}

export function chart(el, points, opts) {
  let { value, format, label = (p) => p.period, type = 'line', tick = (v) => new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 }).format(v), second = null, secondLabel = '', forced = false } = opts;
  const { forced: _f, ...base } = opts;
  if (!forced) { chartArgs.set(el, [points, base]); type = savedChartType(el.id) || type; }
  if (el.id) chartSwitch(el, type);
  const data = (points || []).filter((p) => isNum(value(p)));
  if (!data.length) { el.innerHTML = `<p class="empty">${NO_DATA}</p>`; return; }
  const W = 820; const H = el.classList.contains('small') ? 180 : 280; const pad = { l: 56, r: 16, t: 14, b: 30 };
  const values = data.map(value);
  const seconds = second ? data.map(second) : [];
  const hasSecond = seconds.some(isNum);
  const all = [...values, ...seconds.filter(isNum)];
  // Round the axis out to a 'nice' step so the 4 gridlines land on round numbers (0, 30, 60, 90, 120).
  const nice = (v) => { if (v <= 0) return 0; const step = v / 4; const mag = 10 ** Math.floor(Math.log10(step)); return 4 * ([1, 2, 2.5, 5, 10].find((m) => m * mag >= step) * mag); };
  const max = nice(Math.max(...all, 0)) || 1; const min = -nice(-Math.min(...all, 0));
  const plotW = W - pad.l - pad.r;
  // Bars sit centred in equal slots so the first and last never overflow the plot or cover the y-axis labels.
  const x = type === 'bar' ? (i) => pad.l + (plotW / data.length) * (i + 0.5) : (i) => pad.l + (data.length === 1 ? plotW / 2 : (i * plotW) / (data.length - 1));
  const y = (v) => H - pad.b - ((v - min) / (max - min || 1)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
  const every = Math.ceil(data.length / 9);
  let marks;
  if (type === 'bar') {
    const w = Math.max(3, Math.min(90, (plotW / data.length) * 0.6));
    const rect = (v, bx, bw, cls, p, name) => `<rect class="bar ${cls}" rx="2" x="${bx}" y="${Math.min(y(v), y(Math.max(min, 0)))}" width="${bw}" height="${Math.max(isNum(v) && v !== 0 ? 1 : 0, Math.abs(y(Math.max(min, 0)) - y(v)))}"><title>${esc(label(p))}${name ? ` · ${esc(name)}` : ''}: ${esc(format(v))}</title></rect>`;
    marks = hasSecond
      ? data.map((p, i) => rect(values[i], x(i) - w / 2, w / 2 - 1, '', p, '') + (isNum(seconds[i]) ? rect(seconds[i], x(i) + 1, w / 2 - 1, 'expenses', p, secondLabel) : '')).join('')
      : data.map((p, i) => rect(values[i], x(i) - w / 2, w, '', p, '')).join('');
  } else if (data.length === 1 && hasSecond) {
    // One day has no line to draw: show the day as side-by-side bars (net sales vs expenses) with value labels.
    const w = 90; const gap = 14; const cx = x(0);
    const bar = (v, bx, cls, name) => `<rect class="bar ${cls}" rx="3" x="${bx}" y="${Math.min(y(v), y(0))}" width="${w}" height="${Math.max(1, Math.abs(y(0) - y(v)))}"><title>${esc(name)}: ${esc(format(v))}</title></rect><text class="axis bar-value" x="${bx + w / 2}" y="${Math.min(y(v), y(0)) - 6}" text-anchor="middle">${esc(format(v))}</text>`;
    marks = hasSecond && isNum(seconds[0])
      ? bar(values[0], cx - w - gap / 2, '', 'Net sales') + bar(seconds[0], cx + gap / 2, 'expenses', secondLabel || 'Expenses')
      : bar(values[0], cx - w / 2, '', 'Value');
  } else {
    const pts = values.map((v, i) => [x(i), y(v)]);
    const showPoints = data.length <= 45;
    const secPts = hasSecond ? seconds.map((v, i) => [x(i), y(isNum(v) ? v : 0)]) : [];
    const base0 = y(Math.max(min, 0));
    const fill = (ps, cls) => (type === 'area' && ps.length > 1 ? `<path class="area ${cls}" d="${smoothPath(ps)} L ${ps[ps.length - 1][0]} ${base0} L ${ps[0][0]} ${base0} Z"/>` : '');
    const expenses = hasSecond ? `${fill(secPts, 'expenses')}<path class="line expenses" d="${smoothPath(secPts)}"/>` : '';
    marks = `${fill(pts, '')}${expenses}<path class="line" d="${smoothPath(pts)}"/>${data.map((p, i) => `<circle class="point" cx="${pts[i][0]}" cy="${pts[i][1]}" r="${showPoints ? 4 : 8}" ${showPoints ? '' : 'fill="transparent" stroke="none"'}><title>${esc(label(p))}: ${esc(format(values[i]))}${hasSecond ? ` · ${esc(secondLabel)} ${esc(format(seconds[i]))}` : ''}</title></circle>`).join('')}`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="chart">
    ${ticks.map((t) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(tick(t))}</text>`).join('')}
    ${data.map((p, i) => (i % every === 0 || i === data.length - 1 ? `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(/^\d{4}-\d{2}-\d{2}$/.test(label(p)) ? shortDate(label(p)) : label(p))}</text>` : '')).join('')}
    ${marks}</svg>`;
}

