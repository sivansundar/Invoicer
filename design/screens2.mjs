import { ic, tile, tileOutline, delta, btnDark, btnOutline, btnPrimary, statusPill, letterTile, cell2, tickBar, sectionLabel, dotChart } from './lib.mjs';
import { sidebar, topbar, topbarActions, segmented } from './shell.mjs';

const CARD = 'background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)';

function th(label, flex, align = 'left') {
  return `<div style="flex:${flex};min-width:0;text-align:${align};font-size:12.5px;font-weight:500;color:var(--ink-3)">${label}</div>`;
}

/* ─────────────────────────── BRANDS ─────────────────────────── */

function brandCard({ letter, tone, name, prefix, address, tax, invoices, collected, outstanding, pct, pctTone, schedule }) {
  return `<div style="${CARD};padding:20px;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;gap:12px">
          ${letterTile(letter, tone, 40)}
          <div style="flex:1;min-width:0">
            <div style="font-size:16px;font-weight:600;letter-spacing:-0.014em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">${tax}</div>
          </div>
          <span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--field);font-family:'Geist Mono',ui-monospace,monospace;font-size:12px;color:var(--ink-2);flex-shrink:0">${prefix}</span>
        </div>

        <div style="font-size:13px;line-height:1.55;color:var(--ink-2);margin-top:14px">${address}</div>

        <div style="display:flex;gap:18px;margin-top:16px;padding-top:15px;border-top:1px solid var(--line-2)">
          <div style="flex:1"><div style="font-size:12px;color:var(--ink-3)">Invoices</div><div style="font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;margin-top:3px">${invoices}</div></div>
          <div style="flex:1.4"><div style="font-size:12px;color:var(--ink-3)">Collected</div><div style="font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;margin-top:3px">${collected}</div></div>
          <div style="flex:1.3"><div style="font-size:12px;color:var(--ink-3)">Outstanding</div><div style="font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;margin-top:3px;color:${outstanding === '—' ? 'var(--ink-3)' : 'var(--ink)'}">${outstanding}</div></div>
        </div>

        <div style="display:flex;align-items:center;gap:11px;margin-top:15px">
          ${tickBar(pct, pctTone, 130)}
          <span style="font-size:12.5px;color:var(--ink-2)">${pct}% collected</span>
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-top:13px;font-size:12.5px;color:var(--ink-2)">
          ${ic('bell', 14, 'var(--ink-3)')}${schedule}
        </div>

        <div style="flex:1;min-height:14px"></div>
        <div style="display:flex;gap:9px;padding-top:15px;border-top:1px solid var(--line-2)">
          ${btnOutline('View invoices', null, 32)}
          ${btnOutline('Edit brand', 'pencil', 32)}
        </div>
      </div>`;
}

export function brandsBody() {
  return `${sidebar('brands')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">
    ${topbar('building', 'Brands', topbarActions('New brand'))}
    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;flex-direction:column;gap:22px">

      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <p style="margin:0;font-size:14.5px;color:var(--ink-2);max-width:560px">The businesses you invoice from. Each keeps its own numbering, tax identity, bank details and reminder schedule.</p>
        <span style="flex:1"></span>
        ${segmented(['All brands', 'Active', 'Archived'], 0)}
      </div>

      <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:18px">
        ${brandCard({
          letter: 'SC', tone: 'blue', name: 'Sundar Consulting', prefix: 'SC-2026-###',
          address: '221 Indiranagar, 12th Main<br>Bengaluru 560038, India',
          tax: 'GSTIN 29AAAPS9999Q1ZP', invoices: '24', collected: '₹4,38,100', outstanding: '₹1,84,000',
          pct: 70, pctTone: 'green', schedule: '3 reminders · Net 45 schedule',
        })}
        ${brandCard({
          letter: 'AV', tone: 'amber', name: 'Avara Labs', prefix: 'AV-2026-###',
          address: '8 Clementi Loop, #04-11<br>Singapore 129788',
          tax: 'UEN 202312345K', invoices: '13', collected: '₹2,35,900', outstanding: '₹12,000',
          pct: 95, pctTone: 'green', schedule: '2 reminders · Net 30 schedule',
        })}
        ${brandCard({
          letter: 'FP', tone: 'green', name: 'Foldpaper Studio', prefix: 'FP-2026-###',
          address: '3 Mount Road, Flat 2B<br>Chennai 600002, India',
          tax: 'PAN AAFPF4321K', invoices: '5', collected: '₹1,09,500', outstanding: '—',
          pct: 100, pctTone: 'green', schedule: 'Reminders off',
        })}
      </div>

      <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:18px">
        <div style="border:1.5px dashed var(--line);border-radius:14px;min-height:158px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:24px;text-align:center">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:var(--field)">${ic('plus', 19, 'var(--ink-2)')}</span>
          <div style="font-size:14.5px;font-weight:500;color:var(--ink)">Add another brand</div>
          <div style="font-size:12.5px;color:var(--ink-3);max-width:220px">Bill under a second name without a second account.</div>
        </div>
        <div style="${CARD};padding:20px;display:flex;gap:14px;align-items:flex-start">
          ${tile('repeat', 'violet', 36)}
          <div>
            <div style="font-size:14.5px;font-weight:600;letter-spacing:-0.012em">Copy settings across brands</div>
            <div style="font-size:13px;line-height:1.55;color:var(--ink-2);margin-top:5px">Reuse a reminder schedule, notes block or payment terms instead of retyping it per brand.</div>
            <div style="margin-top:12px">${btnOutline('Copy from…', null, 32)}</div>
          </div>
        </div>
        <div style="${CARD};padding:20px;display:flex;gap:14px;align-items:flex-start">
          ${tile('wallet', 'blue', 36)}
          <div>
            <div style="font-size:14.5px;font-weight:600;letter-spacing:-0.012em">Bank details missing on 1 brand</div>
            <div style="font-size:13px;line-height:1.55;color:var(--ink-2);margin-top:5px">Foldpaper Studio's PDFs go out without account or UPI details, so clients have nowhere to pay.</div>
            <div style="margin-top:12px">${btnDark('Add bank details')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ─────────────────────────── CLIENTS ─────────────────────────── */

function clientRow({ letter, tone, name, contact, invoices, invoicesSub, billed, billedSub, days, daysSub, last: lastInv, lastSub, status, action, isLast }) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:14px 20px;${isLast ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:2.2;min-width:0;display:flex;align-items:center;gap:12px">
            ${letterTile(letter, tone)}
            <div style="min-width:0">
              <div style="font-size:14.5px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
              <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${contact}</div>
            </div>
          </div>
          <div style="flex:1;min-width:0">${cell2(invoices, invoicesSub)}</div>
          <div style="flex:1.3;min-width:0">${cell2(billed, billedSub)}</div>
          <div style="flex:1.1;min-width:0">${cell2(days, daysSub)}</div>
          <div style="flex:1.2;min-width:0">${cell2(lastInv, lastSub, { mono: true })}</div>
          <div style="flex:0 0 104px">${status}</div>
          <div style="flex:0 0 92px;display:flex;justify-content:flex-end">${action}</div>
        </div>`;
}

export function clientsBody() {
  return `${sidebar('clients')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">
    ${topbar('users', 'Clients', topbarActions('New client'))}
    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;flex-direction:column;gap:22px">

      <div style="display:flex;gap:16px">
        <div style="${CARD};flex:1;padding:16px 18px">
          <div style="display:flex;align-items:center;gap:11px">${tileOutline('users')}<span style="font-size:14.5px;font-weight:500">Clients billed this year</span></div>
          <div style="font-size:34px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin-top:14px">14</div>
          <div style="display:flex;align-items:center;margin-top:11px">${delta('up', '+3')}<span style="flex:1"></span><span style="font-size:13px;color:var(--ink-3)">of 18 saved</span></div>
        </div>
        <div style="${CARD};flex:1;padding:16px 18px">
          <div style="display:flex;align-items:center;gap:11px">${tileOutline('wallet')}<span style="font-size:14.5px;font-weight:500">Largest client</span></div>
          <div style="font-size:34px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin-top:14px">₹2,84,000</div>
          <div style="display:flex;align-items:center;margin-top:11px"><span style="font-size:13px;color:var(--ink-2)">Northwind Studio</span><span style="flex:1"></span><span style="font-size:13px;color:var(--ink-3)">34% of revenue</span></div>
        </div>
        <div style="${CARD};flex:1;padding:16px 18px">
          <div style="display:flex;align-items:center;gap:11px">${tileOutline('clock')}<span style="font-size:14.5px;font-weight:500">Slowest to pay</span></div>
          <div style="font-size:34px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin-top:14px">47 days</div>
          <div style="display:flex;align-items:center;margin-top:11px"><span style="font-size:13px;color:var(--ink-2)">Kestrel Labs</span><span style="flex:1"></span><span style="font-size:13px;color:var(--ink-3)">avg over 6 invoices</span></div>
        </div>
        <div style="${CARD};flex:1;padding:16px 18px">
          <div style="display:flex;align-items:center;gap:11px">${tileOutline('checkCircle')}<span style="font-size:14.5px;font-weight:500">Never late</span></div>
          <div style="font-size:34px;font-weight:600;letter-spacing:-0.032em;font-variant-numeric:tabular-nums;margin-top:14px">9</div>
          <div style="display:flex;align-items:center;margin-top:11px">${delta('up', '+2')}<span style="flex:1"></span><span style="font-size:13px;color:var(--ink-3)">clients</span></div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${sectionLabel('All clients')}
        <span style="flex:1"></span>
        <span style="display:inline-flex;align-items:center;gap:9px;height:36px;width:250px;padding:0 13px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card);font-size:14px;color:var(--ink-3)">
          ${ic('search', 16, 'var(--ink-3)')}Search clients
        </span>
        ${btnOutline('Filter', 'filter')}
        ${btnOutline('Import', 'upload')}
      </div>

      <div style="${CARD};overflow:hidden">
        <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
          ${th('Client', '2.2')}${th('Invoices', '1')}${th('Billed', '1.3')}${th('Avg days to pay', '1.1')}${th('Last invoice', '1.2')}${th('Status', '0 0 104px')}
          <div style="flex:0 0 92px"></div>
        </div>
        ${clientRow({ letter: 'N', tone: 'blue', name: 'Northwind Studio', contact: 'Priya Menon · ap@northwind.studio', invoices: '11', invoicesSub: '1 open', billed: '₹2,84,000', billedSub: 'INR', days: '12 days', daysSub: 'faster than average', last: 'SC-2026-042', lastSub: '12 days ago', status: statusPill('Sent'), action: btnOutline('Invoice', null, 32) })}
        ${clientRow({ letter: 'K', tone: 'red', name: 'Kestrel Labs', contact: 'Anita Rao · accounts@kestrel.io', invoices: '6', invoicesSub: '1 overdue', billed: '₹1,96,400', billedSub: 'INR', days: '47 days', daysSub: 'slowest of your clients', last: 'SC-2026-041', lastSub: '34 days late', status: statusPill('Overdue'), action: btnDark('Chase') })}
        ${clientRow({ letter: 'H', tone: 'amber', name: 'Harbourline Ltd', contact: 'Tom Barrow · finance@harbourline.co.uk', invoices: '7', invoicesSub: '1 open', billed: '$18,400', billedSub: 'USD', days: '21 days', daysSub: 'on terms', last: 'AV-2026-018', lastSub: '4 days ago', status: statusPill('Sent'), action: btnOutline('Invoice', null, 32) })}
        ${clientRow({ letter: 'M', tone: 'violet', name: 'Meridian Foods', contact: 'Rahul Iyer · rahul@meridianfoods.in', invoices: '9', invoicesSub: 'all settled', billed: '₹1,42,300', billedSub: 'INR', days: '9 days', daysSub: 'fastest of your clients', last: 'SC-2026-038', lastSub: '2 months ago', status: statusPill('Paid'), action: btnOutline('Invoice', null, 32) })}
        ${clientRow({ letter: 'C', tone: 'green', name: 'Calder &amp; Co', contact: 'Lena Fox · lena@calder.sg', invoices: '4', invoicesSub: 'all settled', billed: 'S$9,850', billedSub: 'SGD', days: '16 days', daysSub: 'on terms', last: 'AV-2026-017', lastSub: '3 weeks ago', status: statusPill('Paid'), action: btnOutline('Invoice', null, 32), isLast: true })}
      </div>
    </div>
  </div>`;
}
