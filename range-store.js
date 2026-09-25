// Keeps the selected date range when moving between dashboard pages.
// The URL wins (so shared links work); otherwise the last range chosen on any page is restored.
// Stored per browser only; wrapped in try/catch because storage can be unavailable (private mode, blocked).
const KEY = 'dashboard.range';
const SHARED = ['preset', 'start_date', 'end_date', 'include_incomplete'];

export function restoreRange() {
  const fromUrl = new URLSearchParams(location.search);
  if (fromUrl.has('preset') || fromUrl.has('start_date')) return fromUrl;
  try {
    const saved = new URLSearchParams(localStorage.getItem(KEY) || '');
    for (const [key, value] of fromUrl) saved.set(key, value); // keep page-specific params (e.g. granularity)
    return saved;
  } catch { return fromUrl; }
}

// Keeps the start/end pickers in order: picking a start after the end (or an end before the start)
// moves the other date to match, and min/max stop the pickers offering an inverted range.
export function bindDateInputs(start, end, onChange) {
  const sync = () => { end.min = start.value; start.max = end.value; };
  start.addEventListener('change', () => { if (start.value && end.value && start.value > end.value) end.value = start.value; sync(); if (start.value && end.value) onChange(); });
  end.addEventListener('change', () => { if (start.value && end.value && end.value < start.value) start.value = end.value; sync(); if (start.value && end.value) onChange(); });
  start.addEventListener('focus', sync); end.addEventListener('focus', sync);
}

export function saveRange(query) {
  const params = new URLSearchParams(query);
  const shared = new URLSearchParams();
  for (const key of SHARED) if (params.has(key)) shared.set(key, params.get(key));
  try { localStorage.setItem(KEY, shared.toString()); } catch { /* storage unavailable: range just won't carry over */ }
}
