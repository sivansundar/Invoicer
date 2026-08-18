import { ic, tile, tileOutline, delta, btnDark, btnOutline, statusPill, letterTile, cell2, tickBar, sectionLabel, columnChart, rankedBars } from './lib.mjs';
import { sidebar, topbar, topbarActions, segmented } from './shell.mjs';

/** Action card — the reference's "number, consequence, one button" pattern. */
function actionCard(iconName, tone, title, num, unit, subIcon, sub, button) {
  return `<div style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:18px 20px 19px">
        <div style="display:flex;align-items:center;gap:12px">
          ${tile(iconName, tone)}
          <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;color:var(--ink)">${title}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:16px">
          <span style="font-size:42px;font-weight:600;letter-spacing:-0.035em;line-height:1;font-variant-numeric:tabular-nums;color:var(--ink)">${num}</span>
          <span style="font-size:14px;color:var(--ink-3);align-self:flex-end;padding-bottom:4px">${unit}</span>
          <span style="flex:1"></span>
          ${button}
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:13px">
          ${ic(subIcon, 15, 'var(--ink-3)')}
          <span style="font-size:13.5px;color:var(--ink-2)">${sub}</span>
        </div>
      </div>`;
}

/** Metric card — always carries the baseline it is being compared against. */
function metricCard(iconName, label, value, deltaEl, vs) {
  return `<div style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:16px 18px 17px">
        <div style="display:flex;align-items:center;gap:11px">
          ${tileOutline(iconName)}
          <span style="font-size:14.5px;font-weight:500;color:var(--ink)">${label}</span>
        </div>
        <div style="font-size:34px;font-weight:600;letter-spacing:-0.032em;line-height:1.1;font-variant-numeric:tabular-nums;margin-top:14px;color:var(--ink)">${value}</div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:11px">
          ${deltaEl}
          <span style="flex:1"></span>
          <span style="font-size:13px;color:var(--ink-3);font-variant-numeric:tabular-nums">vs ${vs}</span>
        </div>
      </div>`;
}

function brandRow(color, name, pct, value, dir, tint) {
  const { delta: d } = { delta };
  return `<div style="display:flex;align-items:center;gap:11px;height:44px;padding:0 14px;border-radius:9px;${tint ? 'background:var(--canvas)' : ''}">
          <span style="width:9px;height:9px;border-radius:999px;background:${color};flex-shrink:0"></span>
          <span style="font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
          <span style="display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;background:var(--field);font-size:12px;font-weight:500;color:var(--ink-2);font-variant-numeric:tabular-nums;flex-shrink:0">${pct}</span>
          <span style="flex:1"></span>
          ${delta(dir, value)}
        </div>`;
}

function th(label, opts = {}) {
  const { flex = '1', align = 'left' } = opts;
  return `<div style="flex:${flex};min-width:0;text-align:${align};font-size:12.5px;font-weight:500;color:var(--ink-3);letter-spacing:0.005em">${label}</div>`;
}

function invoiceRow({ letter, tone, client, meta, metaColor, number, brand, due, dueSub, dueColor, amount, currency, sent, sentPct, sentTone, action, last }) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:14px 20px;${last ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:2.1;min-width:0;display:flex;align-items:center;gap:12px">
            ${letterTile(letter, tone)}
            <div style="min-width:0">
              <div style="font-size:14.5px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${client}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                <span style="width:6px;height:6px;border-radius:999px;background:${metaColor};flex-shrink:0"></span>
                <span style="font-size:12.5px;color:var(--ink-3);white-space:nowrap">${meta}</span>
              </div>
            </div>
          </div>
          <div style="flex:1.3;min-width:0">${cell2(number, brand, { mono: true })}</div>
          <div style="flex:1.2;min-width:0">
            <div style="font-size:14px;font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums">${due}</div>
            <div style="font-size:12.5px;color:${dueColor};margin-top:2px">${dueSub}</div>
          </div>
          <div style="flex:1.1;min-width:0">${cell2(amount, currency, { align: 'left' })}</div>
          <div style="flex:1.3;min-width:0">
            ${tickBar(sentPct, sentTone, 88)}
            <div style="font-size:12.5px;color:var(--ink-3);margin-top:5px">${sent}</div>
          </div>
          <div style="flex:0 0 96px;display:flex;justify-content:flex-end">${action}</div>
        </div>`;
}

export function dashboardBody() {
  const money = (v) => `<span style="font-variant-numeric:tabular-nums">${v}</span>`;

  return `${sidebar('dashboard')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">
    ${topbar('dashboard', 'Overview', topbarActions('New invoice'))}

    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;flex-direction:column;gap:24px">

      <!-- Scope row -->
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:9px;height:38px;padding:0 14px;border-radius:11px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card);font-size:14px;font-weight:500;color:var(--ink)">
          ${ic('calendar', 17, 'var(--ink-2)')}FY 2026–27
        </span>
        ${segmented(['All brands', 'Sundar Consulting', 'Avara Labs'], 0)}
        <span style="flex:1"></span>
        <span style="display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:11px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card);font-size:14px;font-weight:500;color:var(--ink)">
          Needs action <span style="width:7px;height:7px;border-radius:999px;background:var(--red)"></span>
        </span>
      </div>

      <!-- Needs you: three actions, one button each -->
      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Needs you')}
        <div style="display:flex;gap:16px">
          ${actionCard('alert', 'red', 'Overdue', '02', 'invoices', 'clock', 'Oldest is 34 days late · ₹64,000', btnDark('Chase both'))}
          ${actionCard('send', 'amber', 'Ready to send', '01', 'draft', 'clock', 'SC-2026-043 · drafted 6 days ago', btnOutline('Review &amp; send'))}
          ${actionCard('clock', 'blue', 'Awaiting payment', '07', 'invoices', 'wallet', '₹1,96,000 across 5 clients', btnOutline('View sent'))}
        </div>
      </div>

      <!-- Performance -->
      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Performance', 'View full report')}
        <div style="display:flex;gap:16px">
          ${metricCard('wallet', 'Revenue collected', '₹8,42,500', delta('up', '+24.1%'), '₹6,78,900')}
          ${metricCard('checkCircle', 'Collection rate', '81%', delta('down', '−4 pts'), '85%')}
          ${metricCard('clock', 'Avg days to pay', '18 days', delta('goodDown', '−3 days'), '21 days')}
          ${metricCard('file', 'Invoices issued', '42', delta('up', '+9'), '33')}
        </div>
      </div>

      <!-- Split: brand mix + revenue over time -->
      <div style="display:flex;gap:16px;align-items:stretch">

        <div style="flex:0 0 396px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:20px 18px 14px;display:flex;flex-direction:column">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:0 6px">
            <h3 style="margin:0;font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Revenue by brand</h3>
            <a href="#" style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:500">Breakdown ${ic('arrowRight', 13, 'currentColor')}</a>
          </div>
          <div style="font-size:32px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin:12px 6px 0">₹8,42,500</div>
          <div style="margin:14px 0 0">
            ${rankedBars([
              { name: 'Sundar Consulting', v: 438100, display: '₹4,38,100', pct: 52, color: 'var(--blue)' },
              { name: 'Avara Labs',        v: 235900, display: '₹2,35,900', pct: 28, color: 'var(--amber)' },
              { name: 'Foldpaper Studio',  v: 109500, display: '₹1,09,500', pct: 13, color: 'var(--violet)' },
              { name: 'Retainers',         v: 59000,  display: '₹59,000',   pct: 7,  color: 'var(--green)' },
            ])}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:13px;border-top:1px solid var(--line-2);font-size:12.5px;color:var(--ink-3)">
            Paid invoices only · FY 2026–27
          </div>
        </div>

        <div style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:20px 22px 16px;display:flex;flex-direction:column">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
            <div>
              <h3 style="margin:0;font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Revenue over time</h3>
              <div style="display:flex;align-items:baseline;gap:9px;margin-top:7px">
                <span style="font-size:32px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums">₹8,42,500</span>
                <span style="font-size:13.5px;color:var(--ink-3);font-variant-numeric:tabular-nums">₹70,208 avg/month</span>
              </div>
            </div>
            <span style="display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-size:13px;font-weight:500;color:var(--ink-2);white-space:nowrap">
              <span style="width:7px;height:7px;border-radius:999px;background:var(--green)"></span>Paid invoices only
            </span>
          </div>
          <div style="margin-top:14px;flex:1">
            ${columnChart({
              w: 648, h: 236, color: 'var(--green)',
              yTicks: [{ v: 0, label: '₹0' }, { v: 30000, label: '₹30k' }, { v: 60000, label: '₹60k' }, { v: 90000, label: '₹90k' }, { v: 120000, label: '₹1.2L' }],
              avg: 70208, avgLabel: 'avg ₹70,208',
              hover: 11,
              data: [
                { label: 'Sep', full: 'Sep 2025', v: 38000,  display: '₹38,000' },
                { label: 'Oct', full: 'Oct 2025', v: 52000,  display: '₹52,000' },
                { label: 'Nov', full: 'Nov 2025', v: 44500,  display: '₹44,500' },
                { label: 'Dec', full: 'Dec 2025', v: 71000,  display: '₹71,000' },
                { label: 'Jan', full: 'Jan 2026', v: 63500,  display: '₹63,500' },
                { label: 'Feb', full: 'Feb 2026', v: 86000,  display: '₹86,000' },
                { label: 'Mar', full: 'Mar 2026', v: 74000,  display: '₹74,000' },
                { label: 'Apr', full: 'Apr 2026', v: 96000,  display: '₹96,000' },
                { label: 'May', full: 'May 2026', v: 82500,  display: '₹82,500' },
                { label: 'Jun', full: 'Jun 2026', v: 108000, display: '₹1,08,000' },
                { label: 'Jul', full: 'Jul 2026', v: 94000,  display: '₹94,000' },
                { label: 'Aug', full: 'Aug 2026', v: 116000, display: '₹1,16,000' },
              ],
            })}
          </div>
        </div>
      </div>

      <!-- Invoices that need you -->
      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Invoices that need you', 'View all 42 invoices')}
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);overflow:hidden">
          <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
            ${th('Client', { flex: '2.1' })}
            ${th('Invoice', { flex: '1.3' })}
            ${th('Due', { flex: '1.2' })}
            ${th('Amount', { flex: '1.1' })}
            ${th('Follow-ups', { flex: '1.3' })}
            <div style="flex:0 0 96px"></div>
          </div>
          ${invoiceRow({
            letter: 'K', tone: 'red', client: 'Kestrel Labs', meta: 'Overdue · 34 days late', metaColor: 'var(--red)',
            number: 'SC-2026-041', brand: 'Sundar Consulting', due: '28 Aug', dueSub: '34 days late', dueColor: 'var(--red)',
            amount: '₹64,000', currency: 'INR · incl. 18% GST', sent: '2 of 3 reminders sent', sentPct: 66, sentTone: 'red',
            action: btnDark('Chase'),
          })}
          ${invoiceRow({
            letter: 'N', tone: 'blue', client: 'Northwind Studio', meta: 'Sent · 12 days ago', metaColor: 'var(--blue)',
            number: 'SC-2026-042', brand: 'Sundar Consulting', due: '12 Sep', dueSub: 'in 6 days', dueColor: 'var(--ink-3)',
            amount: '₹1,20,000', currency: 'INR · incl. 18% GST', sent: '1 of 3 reminders sent', sentPct: 33, sentTone: 'blue',
            action: btnOutline('Open', null, 32),
          })}
          ${invoiceRow({
            letter: 'H', tone: 'amber', client: 'Harbourline Ltd', meta: 'Sent · 4 days ago', metaColor: 'var(--blue)',
            number: 'AV-2026-018', brand: 'Avara Labs', due: '02 Sep', dueSub: 'in 14 days', dueColor: 'var(--ink-3)',
            amount: '$4,200', currency: 'USD · no tax', sent: 'No reminders yet', sentPct: 0, sentTone: 'blue',
            action: btnOutline('Open', null, 32),
          })}
          ${invoiceRow({
            letter: 'M', tone: 'violet', client: 'Meridian Foods', meta: 'Draft · not sent', metaColor: 'var(--ink-3)',
            number: 'SC-2026-043', brand: 'Sundar Consulting', due: '—', dueSub: 'no due date yet', dueColor: 'var(--ink-3)',
            amount: '₹38,500', currency: 'INR · incl. 18% GST', sent: 'Starts when sent', sentPct: 0, sentTone: 'blue',
            action: btnOutline('Finish', null, 32), last: true,
          })}
        </div>
      </div>

    </div>
  </div>`;
}
