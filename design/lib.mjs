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
      --amber:       oklch(0.66 0.15 62);
      --amber-soft:  oklch(0.950 0.045 62);
      --red:         oklch(0.585 0.205 27);
      --red-soft:    oklch(0.950 0.032 27);
      --violet:      oklch(0.575 0.185 295);
      --violet-soft: oklch(0.950 0.032 295);
      --shadow-card: 0 1px 2px rgb(0 0 0 / 0.04);
      --shadow-pill: 0 1px 2px rgb(0 0 0 / 0.06), 0 0 0 1px oklch(0.898 0.004 70);
`;

/**
 * Type directions. Geist read as vanilla, so these three go for a more
 * deliberate voice. Switch the whole system by changing FONT_KEY — every
 * artboard reads --font-sans / --font-display / --font-mono.
 *
 * All three are on Google Fonts, the only font host the artifact CSP admits.
 */
export const FONTS = {
  // Editorial authority: a high-contrast serif for display moments over a sharp
  // grotesque for the dense UI. The register serious fintech has moved to.
  editorial: {
    label: 'Instrument Serif + Instrument Sans',
    href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&amp;family=Instrument+Serif:ital@0;1&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap',
    display: "'Instrument Serif', 'Iowan Old Style', Georgia, serif",
    sans: "'Instrument Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    displayWeight: 400,
    displayTracking: '-0.018em',
  },
  // Engineered: one technical superfamily. Reads like infrastructure, which is
  // the right register for money.
  engineered: {
    label: 'IBM Plex Sans + IBM Plex Mono',
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap',
    display: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    sans: "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    displayWeight: 600,
    displayTracking: '-0.022em',
  },
  // Swiss precision: a contemporary editorial grotesque — tighter and sharper
  // than Geist, and comfortable at table density.
  swiss: {
    label: 'Host Grotesk + JetBrains Mono',
    href: 'https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap',
    display: "'Host Grotesk', ui-sans-serif, system-ui, sans-serif",
    sans: "'Host Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    displayWeight: 600,
    displayTracking: '-0.02em',
  },
};

/** The direction the screens are currently drawn in. */
export const FONT_KEY = 'editorial';
export const FONT = FONTS[FONT_KEY];

export const FONT_LINK = `<link rel="stylesheet" href="${FONT.href}">`;

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
  return `<button style="display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:0;border-radius:10px;background:var(--blue);color:#fff;font-family:inherit;font-size:14px;font-weight:500;letter-spacing:-0.005em;box-shadow:0 1px 2px rgb(0 0 0 / 0.10);white-space:nowrap">${iconName ? ic(iconName, 16, '#fff', 2) : ''}${label}</button>`;
}
export function btnDark(label) {
  return `<button style="display:inline-flex;align-items:center;height:36px;padding:0 16px;border:0;border-radius:10px;background:var(--ink);color:#fff;font-family:inherit;font-size:14px;font-weight:500;box-shadow:0 1px 2px rgb(0 0 0 / 0.12);white-space:nowrap">${label}</button>`;
}
export function btnOutline(label, iconName, h = 36) {
  return `<button style="display:inline-flex;align-items:center;gap:7px;height:${h}px;padding:0 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font-family:inherit;font-size:14px;font-weight:500;box-shadow:var(--shadow-card);white-space:nowrap">${iconName ? ic(iconName, 16, 'var(--ink-2)') : ''}${label}</button>`;
}
export function btnGhost(label, iconName, h = 34) {
  return `<button style="display:inline-flex;align-items:center;gap:7px;height:${h}px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:var(--ink-2);font-family:inherit;font-size:14px;font-weight:500;white-space:nowrap">${iconName ? ic(iconName, 16, 'var(--ink-2)') : ''}${label}</button>`;
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
              <div style="font-size:14px;font-weight:${weight};${mono ? "font-family:var(--font-mono);font-size:13px;" : ''}font-variant-numeric:tabular-nums;color:var(--ink)">${top}</div>
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

/**
 * Column chart — the honest form for discrete monthly totals. Thin marks with
 * 4px rounded tops anchored to the baseline, hairline SOLID gridlines, axis
 * labels inside the SVG so they align to the grid exactly, and a single direct
 * label rather than a number on every column.
 *
 * `hover` renders the tooltip state so a static artboard still specifies the
 * interaction.
 */
export function columnChart({
  w = 640, h = 230, data, color = 'var(--green)', yTicks, avg = null, avgLabel = 'avg',
  hover = null, labelLast = true,
}) {
  const padL = 52, padR = 12, padT = 22, padB = 26;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = yTicks[yTicks.length - 1].v;
  const y = (v) => padT + plotH * (1 - v / max);
  const slot = plotW / data.length;
  const bw = Math.min(26, slot * 0.54);
  const r = 4;

  const grid = yTicks.map(t => `<line x1="${padL}" x2="${w - padR}" y1="${y(t.v).toFixed(1)}" y2="${y(t.v).toFixed(1)}" stroke="var(--line-2)" stroke-width="1"/>`).join('');
  const yLabels = yTicks.map(t => `<text x="${padL - 10}" y="${(y(t.v) + 4).toFixed(1)}" text-anchor="end" font-size="11.5" fill="var(--ink-3)" font-family="var(--font-sans)">${t.label}</text>`).join('');

  const bars = data.map((d, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const top = y(d.v), base = padT + plotH;
    const hgt = Math.max(base - top, r);
    return `<path d="M${x.toFixed(1)},${base} V${(base - hgt + r).toFixed(1)} Q${x.toFixed(1)},${(base - hgt).toFixed(1)} ${(x + r).toFixed(1)},${(base - hgt).toFixed(1)} H${(x + bw - r).toFixed(1)} Q${(x + bw).toFixed(1)},${(base - hgt).toFixed(1)} ${(x + bw).toFixed(1)},${(base - hgt + r).toFixed(1)} V${base} Z" fill="${color}" opacity="1"/>`;
  }).join('');

  const xLabels = data.map((d, i) =>
    `<text x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${h - 7}" text-anchor="middle" font-size="11.5" fill="var(--ink-3)" font-family="var(--font-sans)">${d.label}</text>`).join('');

  const avgLine = avg == null ? '' :
    `<line x1="${padL}" x2="${w - padR}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1"/>
     <rect x="${padL + 4}" y="${(y(avg) - 17).toFixed(1)}" width="${avgLabel.length * 6.2 + 12}" height="15" rx="4" fill="var(--surface)"/>
     <text x="${padL + 10}" y="${(y(avg) - 6).toFixed(1)}" font-size="11" fill="var(--ink-3)" font-family="var(--font-sans)">${avgLabel}</text>`;

  const last = data.length - 1;
  const direct = labelLast && hover === null
    ? `<text x="${(padL + slot * last + slot / 2).toFixed(1)}" y="${(y(data[last].v) - 9).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)" font-family="var(--font-sans)">${data[last].display}</text>`
    : '';

  let tip = '';
  if (hover !== null) {
    const d = data[hover];
    const cx = padL + slot * hover + slot / 2;
    const ty = Math.max(y(d.v) - 54, 4);
    const tw = 116;
    const tx = Math.min(Math.max(cx - tw / 2, 2), w - tw - 2);
    tip = `<g>
      <rect x="${(cx - slot / 2).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${plotH}" fill="var(--ink)" opacity="0.04"/>
      <rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tw}" height="46" rx="9" fill="var(--surface)" stroke="var(--line)"/>
      <text x="${(tx + 12).toFixed(1)}" y="${(ty + 18).toFixed(1)}" font-size="11.5" fill="var(--ink-3)" font-family="var(--font-sans)">${d.full ?? d.label}</text>
      <text x="${(tx + 12).toFixed(1)}" y="${(ty + 35).toFixed(1)}" font-size="14" font-weight="600" fill="var(--ink)" font-family="var(--font-sans)">${d.display}</text>
    </g>`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;overflow:visible">
        ${grid}${yLabels}${bars}${avgLine}${direct}${xLabels}${tip}
      </svg>`;
}

/**
 * Ranked horizontal bars — replaces the stacked bar plus separate list. One row
 * per brand, ordered high→low, so "who earns most" is answered by bar length
 * and the exact figure sits right beside it.
 */
export function rankedBars(rows) {
  const max = Math.max(...rows.map(r => r.v));
  return `<div style="display:flex;flex-direction:column;gap:2px">
      ${rows.map(r => `<div style="padding:9px 6px 10px">
          <div style="display:flex;align-items:baseline;gap:10px">
            <span style="width:9px;height:9px;border-radius:2px;background:${r.color};flex-shrink:0;align-self:center"></span>
            <span style="flex:1;min-width:0;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</span>
            <span style="font-size:14px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums">${r.display}</span>
            <span style="width:38px;text-align:right;font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums">${r.pct}%</span>
          </div>
          <div style="height:7px;border-radius:3px;background:var(--line-2);margin-top:8px;margin-left:19px">
            <div style="width:${((r.v / max) * 100).toFixed(1)}%;height:7px;border-radius:3px;background:${r.color}"></div>
          </div>
        </div>`).join('')}
    </div>`;
}
