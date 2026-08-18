import { ic, tile, tileOutline, delta, btnDark, btnOutline, btnPrimary, statusPill, letterTile, cell2, tickBar, sectionLabel, dotChart } from './lib.mjs';
import { sidebar, topbar, topbarActions, segmented } from './shell.mjs';

const CARD = 'background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)';

/**
 * Renders a literal `{{token}}` from the app's TEMPLATE_TOKENS. The braces are
 * entity-escaped so the artboard's own template engine does not treat them as
 * a binding and swallow them.
 */
function tok(name) {
  return `<span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:12.5px;color:var(--ink);background:var(--field);border-radius:5px;padding:1px 4px">&#123;&#123;${name}&#125;&#125;</span>`;
}

function th(label, flex, align = 'left') {
  return `<div style="flex:${flex};min-width:0;text-align:${align};font-size:12.5px;font-weight:500;color:var(--ink-3)">${label}</div>`;
}

function actionCard(iconName, tone, title, num, unit, subIcon, sub, button) {
  return `<div style="flex:1;min-width:0;${CARD};padding:18px 20px 19px">
        <div style="display:flex;align-items:center;gap:12px">${tile(iconName, tone)}<span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em">${title}</span></div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:16px">
          <span style="font-size:42px;font-weight:600;letter-spacing:-0.035em;line-height:1;font-variant-numeric:tabular-nums">${num}</span>
          <span style="font-size:14px;color:var(--ink-3);align-self:flex-end;padding-bottom:4px">${unit}</span>
          <span style="flex:1"></span>${button}
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:13px">${ic(subIcon, 15, 'var(--ink-3)')}<span style="font-size:13.5px;color:var(--ink-2)">${sub}</span></div>
      </div>`;
}

/* ────────────────────────── FOLLOW-UPS ────────────────────────── */

function queueRow({ letter, tone, number, brand, client, clientSub, reminder, reminderSub, when, whenSub, isLast }) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:14px 20px;${isLast ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:1.5;min-width:0;display:flex;align-items:center;gap:12px">
            ${letterTile(letter, tone)}
            <div style="min-width:0">${cell2(number, brand, { mono: true })}</div>
          </div>
          <div style="flex:1.6;min-width:0">${cell2(client, clientSub)}</div>
          <div style="flex:1.6;min-width:0">${cell2(reminder, reminderSub)}</div>
          <div style="flex:1.3;min-width:0">${cell2(when, whenSub)}</div>
          <div style="flex:0 0 178px;display:flex;justify-content:flex-end;gap:9px">
            ${btnOutline('Hold', 'pause', 32)}${btnOutline('Send now', 'send', 32)}
          </div>
        </div>`;
}

function scheduleCard({ letter, tone, name, on, terms, steps }) {
  return `<div style="flex:1;min-width:0;${CARD};padding:18px 20px">
        <div style="display:flex;align-items:center;gap:12px">
          ${letterTile(letter, tone, 34)}
          <div style="flex:1;min-width:0">
            <div style="font-size:14.5px;font-weight:600;letter-spacing:-0.012em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div style="font-size:12.5px;color:var(--ink-3);margin-top:1px">${terms}</div>
          </div>
          <span style="display:inline-flex;align-items:center;width:38px;height:22px;flex-shrink:0;border-radius:999px;padding:2px;background:${on ? 'var(--blue)' : 'var(--line)'};justify-content:${on ? 'flex-end' : 'flex-start'}">
            <span style="width:18px;height:18px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgb(0 0 0 / 0.25)"></span>
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
          ${steps.map((s, i) => `<div style="display:flex;align-items:center;gap:10px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border-radius:7px;background:${on ? 'var(--blue-soft)' : 'var(--field)'};font-size:11.5px;font-weight:600;color:${on ? 'var(--blue)' : 'var(--ink-3)'}">${i + 1}</span>
            <span style="flex:1;font-size:13.5px;color:${on ? 'var(--ink)' : 'var(--ink-3)'}">${s.label}</span>
            <span style="font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap">${s.when}</span>
          </div>`).join('')}
        </div>
        <div style="display:flex;gap:9px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line-2)">
          ${btnOutline('Edit schedule', null, 32)}
        </div>
      </div>`;
}

function templateRow(name, subject, used, isLast) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:14px 20px;${isLast ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex-shrink:0;border-radius:9px;background:var(--field)">${ic('mail', 17, 'var(--ink-2)')}</span>
          <div style="flex:1.2;min-width:0">
            <div style="font-size:14.5px;font-weight:500">${name}</div>
            <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">Used by ${used}</div>
          </div>
          <div style="flex:2;min-width:0;font-size:13px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subject}</div>
          <div style="flex:0 0 168px;display:flex;justify-content:flex-end;gap:9px">${btnOutline('Preview', null, 32)}${btnOutline('Edit', 'pencil', 32)}</div>
        </div>`;
}

export function followupsBody() {
  return `${sidebar('followups')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">
    ${topbar('bell', 'Follow-ups', topbarActions('New template'))}
    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;flex-direction:column;gap:24px">

      <div style="display:flex;gap:16px">
        ${actionCard('send', 'amber', 'Going out today', '03', 'reminders', 'wallet', '₹2,84,000 across 3 clients', btnDark('Review queue'))}
        ${actionCard('alert', 'red', 'Not being chased', '02', 'invoices', 'clock', 'Overdue, but reminders are off', btnOutline('Turn on'))}
        ${actionCard('checkCircle', 'green', 'Recovered by reminders', '₹4.1L', 'this year', 'repeat', '11 invoices paid after a nudge', btnOutline('See which'))}
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Going out next', 'View all scheduled')}
        <div style="${CARD};overflow:hidden">
          <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
            ${th('Invoice', '1.5')}${th('Client', '1.6')}${th('Reminder', '1.6')}${th('Scheduled', '1.3')}
            <div style="flex:0 0 178px"></div>
          </div>
          ${queueRow({ letter: 'K', tone: 'red', number: 'SC-2026-041', brand: 'Sundar Consulting', client: 'Kestrel Labs', clientSub: 'accounts@kestrel.io', reminder: 'Final notice', reminderSub: 'reminder 3 of 3', when: 'Today, 09:00', whenSub: 'in 2 hours' })}
          ${queueRow({ letter: 'N', tone: 'blue', number: 'SC-2026-042', brand: 'Sundar Consulting', client: 'Northwind Studio', clientSub: 'ap@northwind.studio', reminder: 'Gentle nudge', reminderSub: 'reminder 2 of 3', when: 'Today, 09:00', whenSub: 'in 2 hours' })}
          ${queueRow({ letter: 'H', tone: 'amber', number: 'AV-2026-018', brand: 'Avara Labs', client: 'Harbourline Ltd', clientSub: 'finance@harbourline.co.uk', reminder: 'Due soon', reminderSub: 'reminder 1 of 2', when: 'Today, 14:00', whenSub: 'in 7 hours' })}
          ${queueRow({ letter: 'C', tone: 'green', number: 'AV-2026-019', brand: 'Avara Labs', client: 'Calder &amp; Co', clientSub: 'lena@calder.sg', reminder: 'Due soon', reminderSub: 'reminder 1 of 2', when: '21 Aug, 09:00', whenSub: 'in 3 days', isLast: true })}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Schedules by brand')}
        <div style="display:flex;gap:16px">
          ${scheduleCard({ letter: 'SC', tone: 'blue', name: 'Sundar Consulting', terms: 'Net 45 · 3 reminders', on: true, steps: [
            { label: 'Due soon', when: '3 days before' },
            { label: 'Gentle nudge', when: '7 days after' },
            { label: 'Final notice', when: '21 days after' },
          ] })}
          ${scheduleCard({ letter: 'AV', tone: 'amber', name: 'Avara Labs', terms: 'Net 30 · 2 reminders', on: true, steps: [
            { label: 'Due soon', when: '5 days before' },
            { label: 'Follow up', when: '10 days after' },
          ] })}
          ${scheduleCard({ letter: 'FP', tone: 'green', name: 'Foldpaper Studio', terms: 'Reminders off', on: false, steps: [
            { label: 'Due soon', when: 'not sending' },
            { label: 'Follow up', when: 'not sending' },
          ] })}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Email templates', 'New template')}
        <div style="${CARD};overflow:hidden">
          ${templateRow('Due soon', `Your invoice ${tok('invoice')} is due on ${tok('due_date')}`, '2 brands')}
          ${templateRow('Gentle nudge', `A quick reminder about invoice ${tok('invoice')} for ${tok('amount')}`, '1 brand')}
          ${templateRow('Final notice', `Invoice ${tok('invoice')} is now ${tok('days_late')} days overdue`, '1 brand', true)}
        </div>
      </div>
    </div>
  </div>`;
}

/* ─────────────────────────── REPORTS ─────────────────────────── */

function currencyCard(sym, code, issued, collected, outstanding, pct, tone) {
  return `<div style="flex:1;min-width:0;${CARD};padding:18px 20px">
        <div style="display:flex;align-items:center;gap:11px">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:var(--field);font-size:15px;font-weight:600;color:var(--ink)">${sym}</span>
          <span style="font-size:14.5px;font-weight:600;letter-spacing:-0.012em">${code}</span>
          <span style="flex:1"></span>
          <span style="font-size:12.5px;color:var(--ink-3)">FY 2026–27</span>
        </div>
        <div style="font-size:32px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin-top:14px">${collected}</div>
        <div style="font-size:13px;color:var(--ink-2);margin-top:5px">collected of ${issued} issued</div>
        <div style="display:flex;align-items:center;gap:11px;margin-top:14px">${tickBar(pct, tone, 120)}<span style="font-size:12.5px;color:var(--ink-2)">${pct}%</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:13px;border-top:1px solid var(--line-2)">
          <span style="font-size:13px;color:var(--ink-2)">Outstanding</span>
          <span style="font-size:14.5px;font-weight:500;font-variant-numeric:tabular-nums">${outstanding}</span>
        </div>
      </div>`;
}

function monthRow(month, issued, collected, outstanding, pct, tone, isLast) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:12px 20px;${isLast ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:1.1;font-size:14px;font-weight:500">${month}</div>
          <div style="flex:1;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;color:var(--ink-2)">${issued}</div>
          <div style="flex:1;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;font-weight:500">${collected}</div>
          <div style="flex:1;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;color:${outstanding === '—' ? 'var(--ink-3)' : 'var(--ink)'}">${outstanding}</div>
          <div style="flex:0 0 168px;display:flex;align-items:center;justify-content:flex-end;gap:11px">${tickBar(pct, tone, 106)}<span style="font-size:12.5px;color:var(--ink-2);width:32px;text-align:right;font-variant-numeric:tabular-nums">${pct}%</span></div>
        </div>`;
}

export function reportsBody() {
  return `${sidebar('reports')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">
    ${topbar('chart', 'Reports', `${btnOutline('Export PDF', 'download')}${btnPrimary('Share report', 'share')}`)}
    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;flex-direction:column;gap:24px">

      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${segmented(['FY 2026–27', 'FY 2025–26', 'FY 2024–25'], 0)}
        <span style="flex:1"></span>
        ${segmented(['All brands', 'Sundar Consulting', 'Avara Labs'], 0)}
      </div>

      <div style="display:flex;gap:16px">
        ${currencyCard('₹', 'Indian rupee', '₹10,38,500', '₹8,42,500', '₹1,96,000', 81, 'green')}
        ${currencyCard('$', 'US dollar', '$22,600', '$18,400', '$4,200', 81, 'green')}
        ${currencyCard('S$', 'Singapore dollar', 'S$9,850', 'S$9,850', '—', 100, 'green')}
      </div>

      <div style="display:flex;gap:16px;align-items:stretch">
        <div style="flex:1;min-width:0;${CARD};padding:20px 22px 16px;display:flex;flex-direction:column">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
            <div>
              <h3 style="margin:0;font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Collected by month</h3>
              <div style="display:flex;align-items:baseline;gap:9px;margin-top:7px">
                <span style="font-size:30px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums">₹8,42,500</span>
                <span style="font-size:13.5px;color:var(--ink-3)">INR only</span>
              </div>
            </div>
            ${segmented(['Collected', 'Issued'], 0)}
          </div>
          <div style="display:flex;gap:12px;margin-top:18px;flex:1">
            <div style="display:flex;flex-direction:column;justify-content:space-between;font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums;padding-bottom:20px;text-align:right;flex-shrink:0">
              <span>₹1.2L</span><span>₹90k</span><span>₹60k</span><span>₹30k</span><span>₹0</span>
            </div>
            <div style="flex:1;min-width:0;display:flex;flex-direction:column">
              ${dotChart({ w: 560, h: 172, cols: 46, rows: 17, series: [0.3, 0.42, 0.36, 0.5, 0.47, 0.6, 0.55, 0.7, 0.65, 0.8, 0.75, 0.9], color: 'var(--amber)' })}
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-3);margin-top:8px">
                <span>Apr</span><span>Jun</span><span>Aug</span><span>Oct</span><span>Dec</span><span>Feb</span><span>Mar</span>
              </div>
            </div>
          </div>
        </div>

        <div style="flex:0 0 372px;${CARD};padding:20px;display:flex;flex-direction:column">
          <h3 style="margin:0;font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Import and export</h3>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2)">Take everything with you, or bring it in from a spreadsheet. Nothing is locked in this account.</p>
          <div style="display:flex;flex-direction:column;gap:11px;margin-top:18px">
            <div style="display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:12px;background:var(--canvas);border:1px solid var(--line)">
              ${tile('download', 'blue', 34)}
              <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500">Export everything</div><div style="font-size:12.5px;color:var(--ink-3);margin-top:1px">JSON · invoices, brands, clients</div></div>
              ${ic('chevRight', 16, 'var(--ink-3)')}
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:12px;background:var(--canvas);border:1px solid var(--line)">
              ${tile('upload', 'green', 34)}
              <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500">Import a backup</div><div style="font-size:12.5px;color:var(--ink-3);margin-top:1px">Preview before anything is written</div></div>
              ${ic('chevRight', 16, 'var(--ink-3)')}
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:12px;background:var(--canvas);border:1px solid var(--line)">
              ${tile('file', 'violet', 34)}
              <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500">FY summary PDF</div><div style="font-size:12.5px;color:var(--ink-3);margin-top:1px">For your accountant</div></div>
              ${ic('chevRight', 16, 'var(--ink-3)')}
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        ${sectionLabel('Month by month', 'Download CSV')}
        <div style="${CARD};overflow:hidden">
          <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
            ${th('Month', '1.1')}${th('Issued', '1', 'right')}${th('Collected', '1', 'right')}${th('Outstanding', '1', 'right')}${th('Collection rate', '0 0 168px', 'right')}
          </div>
          ${monthRow('April 2026', '₹1,24,000', '₹1,24,000', '—', 100, 'green')}
          ${monthRow('May 2026', '₹96,500', '₹96,500', '—', 100, 'green')}
          ${monthRow('June 2026', '₹1,48,000', '₹1,12,000', '₹36,000', 76, 'amber')}
          ${monthRow('July 2026', '₹2,10,000', '₹1,46,000', '₹64,000', 70, 'amber')}
          ${monthRow('August 2026', '₹2,64,000', '₹1,68,000', '₹96,000', 64, 'red', true)}
        </div>
      </div>
    </div>
  </div>`;
}
