// Shared vocabulary for the Invoicer redesign artboards.
// Tokens are the reference's warm-grey canvas + white surfaces, expressed in
// oklch so they drop straight into src/app/globals.css.

export const TOKENS = `
      --canvas:      oklch(0.955 0.004 70);
      --surface:     oklch(1 0 0);
      --ink:         oklch(0.19 0.004 70);
      --ink-2:       oklch(0.52 0.008 70);
      --ink-3:       oklch(0.66 0.008 70);
      --line:        oklch(0.898 0.004 70);
      --line-2:      oklch(0.932 0.004 70);
      --field:       oklch(0.928 0.004 70);
      --blue-soft:   oklch(0.945 0.028 258);
      --green:       oklch(0.60 0.145 152);
      --green-soft:  oklch(0.945 0.038 152);
      --amber:       oklch(0.715 0.148 62);
      --amber-soft:  oklch(0.950 0.045 62);
      --red:         oklch(0.585 0.205 27);
      --red-soft:    oklch(0.950 0.032 27);
      --violet:      oklch(0.575 0.185 295);
      --violet-soft: oklch(0.950 0.032 295);
      --shadow-card: 0 1px 2px rgb(0 0 0 / 0.04);
      --shadow-pill: 0 1px 2px rgb(0 0 0 / 0.06), 0 0 0 1px oklch(0.898 0.004 70);
`;

export const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap">';

const P = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  chart: '<path d="M12 16v5"/><path d="M16 14v7"/><path d="M20 10v11"/><path d="M8 12v9"/><path d="M4 16v5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevUp: '<path d="m18 15-6-6-6 6"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  chevLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="m19 12-7 7-7-7"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  google: '<path d="M12 11v2.8h6.5a5.6 5.6 0 0 1-2.4 3.7l3.9 3a9.9 9.9 0 0 0 3-7.4c0-.7-.1-1.4-.2-2z" fill="#4285F4" stroke="none"/><path d="M12 22c3.2 0 5.9-1 7.9-2.8l-3.9-3A6.2 6.2 0 0 1 12 17.2a6.1 6.1 0 0 1-5.8-4.2l-4 3.1A10 10 0 0 0 12 22" fill="#34A853" stroke="none"/><path d="M6.2 13a6 6 0 0 1 0-3.8l-4-3.1a10 10 0 0 0 0 9z" fill="#FBBC05" stroke="none"/><path d="M12 6.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A10 10 0 0 0 2.2 6.1l4 3.1A6.1 6.1 0 0 1 12 6.8" fill="#EA4335" stroke="none"/>',
  sparkle: '<path d="M9.9 2.6a.5.5 0 0 1 .95 0l1.2 3.6a3 3 0 0 0 1.9 1.9l3.6 1.2a.5.5 0 0 1 0 .95l-3.6 1.2a3 3 0 0 0-1.9 1.9l-1.2 3.6a.5.5 0 0 1-.95 0l-1.2-3.6a3 3 0 0 0-1.9-1.9l-3.6-1.2a.5.5 0 0 1 0-.95l3.6-1.2a3 3 0 0 0 1.9-1.9z"/><path d="M18 15.5 18.6 17.3a1.5 1.5 0 0 0 1 1l1.8.6-1.8.6a1.5 1.5 0 0 0-1 1L18 22.2l-.6-1.8a1.5 1.5 0 0 0-1-1L14.6 19l1.8-.6a1.5 1.5 0 0 0 1-1z"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  filter: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
};

/** Stroke icon. All icons are stroke-based on a 24px grid, per the reference. */
export function ic(name, size = 16, color = 'currentColor', sw = 1.75) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${P[name]}</svg>`;
}
/** Multi-colour brand mark (Google), drawn with fills rather than strokes. */
export function icRaw(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="none" style="flex-shrink:0">${P[name]}</svg>`;
}

/** The reference's colored rounded-square icon tile. */
export function tile(name, tone, size = 40) {
  const bg = { blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', violet: 'var(--violet)', ink: 'var(--ink)' }[tone];
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;border-radius:11px;background:${bg}">${ic(name, Math.round(size * 0.5), '#fff', 2)}</span>`;
}
/** The outlined white tile used on the metric strip. */
export function tileOutline(name, size = 34) {
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;border-radius:9px;background:var(--surface);border:1px solid var(--line)">${ic(name, 17, 'var(--ink-2)')}</span>`;
}

/** Delta chip: circular arrow + signed value, in the semantic colour. */
export function delta(dir, text) {
  const map = {
    up:   ['var(--green)', 'var(--green-soft)', 'arrowUp'],
    down: ['var(--red)',   'var(--red-soft)',   'arrowDown'],
    flat: ['var(--ink-3)', 'var(--field)',      'minus'],
    // A metric can improve by falling (days-to-pay) or worsen by rising
    // (overdue). Colour follows the *meaning*, the arrow follows the number.
    goodDown: ['var(--green)', 'var(--green-soft)', 'arrowDown'],
    badUp:    ['var(--red)',   'var(--red-soft)',   'arrowUp'],
  };
  const [fg, bg, icon] = map[dir];
  return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:${fg};font-variant-numeric:tabular-nums">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:999px;background:${bg}">${ic(icon, 11, fg, 2.5)}</span>${text}</span>`;
}

export function btnPrimary(label, iconName) {
  return `<button style="display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:0;border-radius:10px;background:var(--blue);color:#fff;font-family:inherit;font-size:14px;font-weight:500;letter-spacing:-0.005em;box-shadow:0 1px 2px rgb(0 0 0 / 0.10)">${iconName ? ic(iconName, 16, '#fff', 2) : ''}${label}</button>`;
}
export function btnDark(label) {
  return `<button style="display:inline-flex;align-items:center;height:36px;padding:0 16px;border:0;border-radius:10px;background:var(--ink);color:#fff;font-family:inherit;font-size:14px;font-weight:500;box-shadow:0 1px 2px rgb(0 0 0 / 0.12)">${label}</button>`;
}
export function btnOutline(label, iconName, h = 36) {
  return `<button style="display:inline-flex;align-items:center;gap:7px;height:${h}px;padding:0 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font-family:inherit;font-size:14px;font-weight:500;box-shadow:var(--shadow-card)">${iconName ? ic(iconName, 16, 'var(--ink-2)') : ''}${label}</button>`;
}
export function btnGhost(label, iconName, h = 34) {
  return `<button style="display:inline-flex;align-items:center;gap:7px;height:${h}px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:var(--ink-2);font-family:inherit;font-size:14px;font-weight:500">${iconName ? ic(iconName, 16, 'var(--ink-2)') : ''}${label}</button>`;
}

/** Status pill — soft fill + dot, replacing the current mono-grey badges. */
export function statusPill(status) {
  const map = {
    Paid:    ['var(--green)', 'var(--green-soft)'],
    Sent:    ['var(--blue)',  'var(--blue-soft)'],
    Overdue: ['var(--red)',   'var(--red-soft)'],
    Draft:   ['var(--ink-2)', 'var(--field)'],
  };
  const [fg, bg] = map[status];
  return `<span style="display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:${bg};color:${fg};font-size:12.5px;font-weight:500;white-space:nowrap"><span style="width:6px;height:6px;border-radius:999px;background:${fg}"></span>${status}</span>`;
}

/** Avatar/logo tile with a letter, as the reference uses in table rows. */
export function letterTile(letter, tone, size = 34) {
  const bg = { blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', violet: 'var(--violet)', ink: 'var(--ink)' }[tone];
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;border-radius:9px;background:${bg};color:#fff;font-size:${Math.round(size * 0.41)}px;font-weight:600">${letter}</span>`;
}

/** Two-line table cell — the reference's signature: value, then grey context. */
export function cell2(top, sub, opts = {}) {
  const { mono = false, align = 'left', weight = 500 } = opts;
  return `<div style="text-align:${align}">
              <div style="font-size:14px;font-weight:${weight};${mono ? "font-family:'Geist Mono',ui-monospace,monospace;font-size:13px;" : ''}font-variant-numeric:tabular-nums;color:var(--ink)">${top}</div>
              <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">${sub}</div>
            </div>`;
}

/** Segmented tick bar — the reference's "96% used" meter. */
export function tickBar(pct, tone, width = 96) {
  const color = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', blue: 'var(--blue)' }[tone];
  return `<span style="display:inline-block;width:${width}px;height:9px;border-radius:2px;background:
      repeating-linear-gradient(to right, var(--line) 0 3px, transparent 3px 5px)">
      <span style="display:block;width:${pct}%;height:9px;border-radius:2px;background:repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 5px)"></span></span>`;
}

/** Card shell. */
export function card(inner, extra = '') {
  return `<div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);${extra}">${inner}</div>`;
}

/** Section label sitting directly on the canvas, with an optional right link. */
export function sectionLabel(text, right) {
  return `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px">
        <h2 style="margin:0;font-size:17px;font-weight:600;letter-spacing:-0.015em;color:var(--ink)">${text}</h2>
        ${right ? `<a href="#" style="display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:500;text-decoration:none">${right} ${ic('arrowRight', 14, 'currentColor')}</a>` : ''}
      </div>`;
}

/** Dotted-pixel area chart, the reference's most distinctive chart form. */
export function dotChart({ w = 700, h = 230, cols = 58, rows = 22, series, color = 'var(--amber)' }) {
  const dx = w / cols, dy = h / rows, r = 2.1;
  let on = '', off = '';
  for (let c = 0; c < cols; c++) {
    const t = c / (cols - 1);
    const i = t * (series.length - 1);
    const lo = Math.floor(i), hi = Math.min(series.length - 1, lo + 1);
    const v = series[lo] + (series[hi] - series[lo]) * (i - lo);
    const filled = Math.round(v * rows);
    for (let rr = 0; rr < rows; rr++) {
      const cx = (c + 0.5) * dx, cy = h - (rr + 0.5) * dy;
      const d = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"/>`;
      if (rr < filled) on += d; else off += d;
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="display:block">
        <g fill="var(--line-2)">${off}</g><g fill="${color}">${on}</g></svg>`;
}
