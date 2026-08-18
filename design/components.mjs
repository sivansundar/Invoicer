import { ic, tile, tileOutline, delta, btnDark, btnOutline, btnPrimary, btnGhost, statusPill, letterTile, cell2, tickBar, FONT } from './lib.mjs';
import { segmented } from './shell.mjs';

const CARD = 'background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)';

function block(title, note, body) {
  return `<div style="${CARD};padding:22px 24px 24px">
        <div style="display:flex;align-items:baseline;gap:12px">
          <h3 style="margin:0;font-size:16px;font-weight:600;letter-spacing:-0.014em">${title}</h3>
          <span style="font-size:13px;color:var(--ink-3)">${note}</span>
        </div>
        <div style="margin-top:18px">${body}</div>
      </div>`;
}

function swatch(name, value, token, dark) {
  return `<div style="flex:1;min-width:0">
        <div style="height:56px;border-radius:11px;background:${value};border:1px solid ${dark ? 'transparent' : 'var(--line)'}"></div>
        <div style="font-size:13px;font-weight:500;margin-top:9px">${name}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-3);margin-top:3px;word-break:break-all">${token}</div>
      </div>`;
}

function typeRow(label, sample, css) {
  return `<div style="display:flex;align-items:baseline;gap:20px;padding:11px 0;border-bottom:1px solid var(--line-2)">
        <div style="flex:0 0 132px;font-size:12.5px;color:var(--ink-3)">${label}</div>
        <div style="flex:1;min-width:0;${css};color:var(--ink)">${sample}</div>
        <div style="flex:0 0 250px;font-family:var(--font-mono);font-size:11px;color:var(--ink-3);text-align:right">${css.replace(/;\s*$/, '').replace(/;/g, ' · ')}</div>
      </div>`;
}

export function componentsBody() {
  return `<div style="width:100%;display:flex;flex-direction:column;gap:18px;padding:36px 40px 44px">

    <div>
      <h1 style="margin:0;font-size:36px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking)">Invoicer design system</h1>
      <p style="margin:9px 0 0;font-size:15px;line-height:1.55;color:var(--ink-2);max-width:680px">
        Every value below is what the redesigned screens actually use. The palette is expressed in oklch so it drops
        straight into <span style="font-family:var(--font-mono);font-size:13.5px">src/app/globals.css</span>,
        replacing today's fully-desaturated neutral ramp.
      </p>
    </div>

    ${block('Surfaces', 'a warm grey page with white cards floating on it — the single biggest change from today', `
      <div style="display:flex;gap:14px">
        ${swatch('Canvas', 'oklch(0.955 0.004 70)', '--canvas')}
        ${swatch('Surface', 'oklch(1 0 0)', '--surface')}
        ${swatch('Field', 'oklch(0.928 0.004 70)', '--field')}
        ${swatch('Line', 'oklch(0.898 0.004 70)', '--line')}
        ${swatch('Line soft', 'oklch(0.932 0.004 70)', '--line-2')}
        ${swatch('Ink', 'oklch(0.19 0.004 70)', '--ink', true)}
        ${swatch('Ink 2', 'oklch(0.52 0.008 70)', '--ink-2', true)}
        ${swatch('Ink 3', 'oklch(0.66 0.008 70)', '--ink-3', true)}
      </div>`)}

    ${block('Accents', 'validated for colour-vision deficiency and 3:1 contrast — the categorical order is blue → amber → violet → green', `
      <div style="display:flex;gap:14px">
        ${swatch('Blue — primary, sent', 'var(--blue)', '--blue', true)}
        ${swatch('Green — paid, collected', 'var(--green)', 'oklch(0.60 0.145 152)', true)}
        ${swatch('Amber — drafts, series 2', 'var(--amber)', 'oklch(0.66 0.15 62)', true)}
        ${swatch('Red — overdue, worsening', 'var(--red)', 'oklch(0.585 0.205 27)', true)}
        ${swatch('Violet — series 3', 'var(--violet)', 'oklch(0.575 0.185 295)', true)}
      </div>
      <div style="display:flex;gap:14px;margin-top:16px">
        ${swatch('Blue soft', 'var(--blue-soft)', '--blue-soft')}
        ${swatch('Green soft', 'var(--green-soft)', '--green-soft')}
        ${swatch('Amber soft', 'var(--amber-soft)', '--amber-soft')}
        ${swatch('Red soft', 'var(--red-soft)', '--red-soft')}
        ${swatch('Violet soft', 'var(--violet-soft)', '--violet-soft')}
      </div>`)}

    ${block('Type', `${FONT.label} — both on Google Fonts, so no licence to buy`, `
      ${typeRow('Page title (display)', 'Overview', 'font-size:30px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking)')}
      ${typeRow('Big number', '₹8,42,500', 'font-size:34px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums')}
      ${typeRow('Section label', 'Invoices that need you', 'font-size:17px;font-weight:600;letter-spacing:-0.015em')}
      ${typeRow('Card title', 'Revenue by brand', 'font-size:15.5px;font-weight:600;letter-spacing:-0.012em')}
      ${typeRow('Body', 'Reminder 2 of 3 sent — next goes out 10 Sep unless paid.', 'font-size:14px')}
      ${typeRow('Secondary', 'Sent and awaiting payment', 'font-size:13px;color:var(--ink-2)')}
      ${typeRow('Micro', 'vs ₹6,78,900', 'font-size:12.5px;color:var(--ink-3)')}
      ${typeRow('Mono', 'SC-2026-041', 'font-family:var(--font-mono);font-size:13px')}`)}

    <div style="display:flex;gap:18px;align-items:stretch">
      <div style="flex:1;min-width:0">
        ${block('Buttons', '36px tall, 10px radius', `
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
            ${btnPrimary('New invoice', 'plus')}
            ${btnDark('Chase now')}
            ${btnOutline('Export', 'share')}
            ${btnGhost('Cancel')}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:14px">
            ${btnOutline('Open', null, 32)}
            ${btnOutline('Send now', 'send', 32)}
            <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">${ic('bell', 17, 'var(--ink-2)')}</span>
          </div>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2)">
            Dark is reserved for the single most urgent action on a screen — chasing an overdue invoice. Blue is the ordinary primary.
          </p>`)}
      </div>
      <div style="flex:1;min-width:0">
        ${block('Status and counts', 'soft fill plus a dot, replacing today\'s grey outline badges', `
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            ${statusPill('Paid')}${statusPill('Sent')}${statusPill('Overdue')}${statusPill('Draft')}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:16px">
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:var(--blue);color:#fff;font-size:12px;font-weight:600">3</span>
            <span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--field);font-family:var(--font-mono);font-size:12px;color:var(--ink-2)">SC-2026-###</span>
            <span style="display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-size:13px;font-weight:500;color:var(--ink-2)"><span style="width:7px;height:7px;border-radius:999px;background:var(--green)"></span>Paid invoices only</span>
          </div>
          <div style="margin-top:16px">${segmented(['All brands', 'Sundar Consulting', 'Avara Labs'], 0)}</div>`)}
      </div>
    </div>

    <div style="display:flex;gap:18px;align-items:stretch">
      <div style="flex:1;min-width:0">
        ${block('Icon tiles', 'filled for actions, outlined for measures', `
          <div style="display:flex;gap:12px;align-items:center">
            ${tile('alert', 'red')}${tile('send', 'amber')}${tile('clock', 'blue')}${tile('checkCircle', 'green')}${tile('repeat', 'violet')}
          </div>
          <div style="display:flex;gap:12px;align-items:center;margin-top:14px">
            ${tileOutline('wallet')}${tileOutline('file')}${tileOutline('users')}${tileOutline('clock')}
          </div>
          <div style="display:flex;gap:12px;align-items:center;margin-top:14px">
            ${letterTile('SC', 'blue')}${letterTile('AV', 'amber')}${letterTile('K', 'red')}${letterTile('M', 'violet')}
          </div>`)}
      </div>
      <div style="flex:1.35;min-width:0">
        ${block('Change and progress', 'a number never appears without what it is being compared against', `
          <div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
            ${delta('up', '+24.1%')}${delta('down', '−4 pts')}${delta('goodDown', '−3 days')}${delta('badUp', '+2 late')}${delta('flat', 'No change')}
          </div>
          <div style="display:flex;gap:24px;align-items:center;margin-top:20px;flex-wrap:wrap">
            <span style="display:inline-flex;align-items:center;gap:11px">${tickBar(96, 'red', 106)}<span style="font-size:12.5px;color:var(--ink-2)">96% used</span></span>
            <span style="display:inline-flex;align-items:center;gap:11px">${tickBar(66, 'amber', 106)}<span style="font-size:12.5px;color:var(--ink-2)">2 of 3 sent</span></span>
            <span style="display:inline-flex;align-items:center;gap:11px">${tickBar(31, 'green', 106)}<span style="font-size:12.5px;color:var(--ink-2)">31% used</span></span>
          </div>
          <div style="display:flex;gap:36px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line-2)">
            ${cell2('SC-2026-041', 'Sundar Consulting', { mono: true })}
            ${cell2('28 Aug', '34 days late')}
            ${cell2('₹64,000', 'INR · incl. 18% GST')}
            ${cell2('49', '12 this week')}
          </div>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2)">
            Two-line cells are the workhorse: the value on top, the thing you would otherwise have to open the invoice to learn underneath.
          </p>`)}
      </div>
    </div>

    ${block('Geometry', 'the numbers to put in globals.css', `
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${[
          ['Card', '14px', '--radius-card'],
          ['Button, field', '10px', '--radius-md'],
          ['Icon tile', '11px', '--radius-tile'],
          ['Chip, small tile', '8–9px', '--radius-sm'],
          ['Pill', '999px', 'full'],
          ['Control height', '36px', 'default'],
          ['Small control', '32px', 'sm'],
          ['Field height', '40–44px', 'form'],
          ['Card padding', '18–20px', 'inline'],
          ['Grid gap', '16–18px', 'layout'],
          ['Page padding', '24px 32px', 'shell'],
        ].map(([label, value, token]) => `<div style="flex:0 0 auto;min-width:132px;padding:13px 15px;border-radius:11px;background:var(--canvas);border:1px solid var(--line)">
            <div style="font-size:19px;font-weight:600;letter-spacing:-0.02em;font-variant-numeric:tabular-nums">${value}</div>
            <div style="font-size:12.5px;color:var(--ink-2);margin-top:3px">${label}</div>
            <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--ink-3);margin-top:2px">${token}</div>
          </div>`).join('')}
      </div>`)}
  </div>`;
}
