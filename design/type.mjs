import { FONTS, ic, delta, tileOutline, statusPill, letterTile } from './lib.mjs';

/**
 * Three type directions applied to the same real UI fragments, so the choice is
 * made by looking rather than by reading font names. Each column sets its own
 * --font-* tokens; everything else on the artboard is identical.
 */
function column(key, note, recommended) {
  const f = FONTS[key];
  return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;
      --font-sans:${f.sans};--font-display:${f.display};--font-mono:${f.mono};
      --display-weight:${f.displayWeight};--display-tracking:${f.displayTracking};
      font-family:var(--font-sans)">

    <div style="display:flex;align-items:center;gap:9px;padding-bottom:12px;border-bottom:1px solid var(--line)">
      <span style="font-size:15px;font-weight:600;color:var(--ink);font-family:var(--font-sans)">${f.label}</span>
      ${recommended ? `<span style="display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:var(--blue);color:#fff;font-size:11.5px;font-weight:600;white-space:nowrap">Recommended</span>` : ''}
    </div>
    <p style="margin:11px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2);font-family:var(--font-sans);min-height:60px">${note}</p>

    <!-- page title -->
    <div style="margin-top:20px;padding:18px 20px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)">
      <div style="display:flex;align-items:center;gap:11px">
        ${ic('dashboard', 22, 'var(--ink)', 1.9)}
        <span style="font-size:30px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);color:var(--ink)">Overview</span>
      </div>
      <div style="font-size:17px;font-weight:600;letter-spacing:-0.015em;color:var(--ink);margin-top:18px">Invoices that need you</div>
      <div style="font-size:14px;color:var(--ink-2);margin-top:8px;line-height:1.55">Reminder 2 of 3 sent — the next one goes out on 10 Sep unless this is paid.</div>
    </div>

    <!-- the number that matters -->
    <div style="margin-top:14px;padding:16px 18px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)">
      <div style="display:flex;align-items:center;gap:11px">${tileOutline('wallet')}<span style="font-size:14px;font-weight:500">Revenue collected</span></div>
      <div style="font-size:34px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin-top:13px;color:var(--ink)">₹8,42,500</div>
      <div style="display:flex;align-items:center;margin-top:11px">${delta('up', '+24.1%')}<span style="flex:1"></span><span style="font-size:13px;color:var(--ink-3);font-variant-numeric:tabular-nums">vs ₹6,78,900</span></div>
    </div>

    <!-- table density, where a UI face earns its keep -->
    <div style="margin-top:14px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:500;color:var(--ink-3)">
        <span style="flex:1.6">Client</span><span style="flex:1.4">Invoice</span><span style="flex:0 0 84px;text-align:right">Amount</span>
      </div>
      ${[
        ['K', 'red', 'Kestrel Labs', 'Overdue · 34 days late', 'var(--red)', 'SC-2026-041', '₹64,000'],
        ['N', 'blue', 'Northwind Studio', 'Sent · 12 days ago', 'var(--blue)', 'SC-2026-042', '₹1,20,000'],
        ['H', 'amber', 'Harbourline Ltd', 'Sent · 4 days ago', 'var(--blue)', 'AV-2026-018', '$4,200'],
      ].map(([l, t, name, meta, dot, num, amt], i) => `<div style="display:flex;align-items:center;gap:12px;padding:11px 16px;${i < 2 ? 'border-bottom:1px solid var(--line-2)' : ''}">
        <div style="flex:1.6;min-width:0;display:flex;align-items:center;gap:10px">
          ${letterTile(l, t, 30)}
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px"><span style="width:5px;height:5px;border-radius:999px;background:${dot}"></span><span style="font-size:12px;color:var(--ink-3);white-space:nowrap">${meta}</span></div>
          </div>
        </div>
        <div style="flex:1.4;min-width:0;font-family:var(--font-mono);font-size:12.5px;color:var(--ink-2)">${num}</div>
        <div style="flex:0 0 84px;text-align:right;font-size:14px;font-weight:500;font-variant-numeric:tabular-nums">${amt}</div>
      </div>`).join('')}
    </div>

    <!-- figure alignment: these must stack in a straight column -->
    <div style="margin-top:14px;padding:15px 18px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)">
      <div style="font-size:12.5px;font-weight:500;color:var(--ink-3)">Tabular figures</div>
      <div style="font-variant-numeric:tabular-nums;font-size:15px;color:var(--ink);margin-top:9px;line-height:1.6;text-align:right;width:132px">
        <div>1,111.00</div><div>8,42,500</div><div>0,000.00</div>
      </div>
      <div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">${statusPill('Paid')}${statusPill('Overdue')}${statusPill('Draft')}</div>
    </div>
  </div>`;
}

export function typeBody() {
  return `<div style="width:100%;display:flex;flex-direction:column;gap:24px;padding:36px 40px 44px">
    <div>
      <h1 style="margin:0;font-size:36px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking)">Three type directions</h1>
      <p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:var(--ink-2);max-width:760px">
        The same fragments in each pairing — page title, section heading, the headline number, a dense table row,
        and a stack of figures that has to align. All three are on Google Fonts, so any of them ships without a
        licence. Pick one and the whole system follows; nothing else changes.
      </p>
    </div>
    <div style="display:flex;gap:22px;align-items:flex-start">
      ${column('editorial', 'A high-contrast serif carries the display moments; a sharp grotesque runs the dense UI. The most differentiated of the three — reads considered and premium rather than generated.', true)}
      ${column('engineered', 'One technical superfamily for text, numbers and code. Reads like infrastructure, which suits money; the mono is genuinely excellent for invoice numbers.', false)}
      ${column('swiss', 'A contemporary grotesque — tighter and sharper than Geist, still uncommon enough not to read as a template, and comfortable at table density.', false)}
    </div>
  </div>`;
}
