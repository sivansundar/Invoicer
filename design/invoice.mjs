import { ic, tile, btnDark, btnOutline, btnPrimary, statusPill, letterTile, tickBar, sectionLabel } from './lib.mjs';
import { sidebar, topbar } from './shell.mjs';

function partyCard(label, body, action) {
  return `<div style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:16px 18px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12.5px;font-weight:500;color:var(--ink-3);flex:1">${label}</span>
          ${action ?? ''}
        </div>
        <div style="margin-top:11px">${body}</div>
      </div>`;
}

function lineRow(desc, sub, qty, rate, tax, amount, last) {
  return `<div style="display:flex;align-items:flex-start;gap:16px;padding:14px 20px;${last ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:2.6;min-width:0">
            <div style="font-size:14.5px;font-weight:500;color:var(--ink)">${desc}</div>
            <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">${sub}</div>
          </div>
          <div style="flex:0 0 56px;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;color:var(--ink-2)">${qty}</div>
          <div style="flex:0 0 96px;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;color:var(--ink-2)">${rate}</div>
          <div style="flex:0 0 72px;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;color:var(--ink-3)">${tax}</div>
          <div style="flex:0 0 104px;text-align:right;font-size:14.5px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--ink)">${amount}</div>
        </div>`;
}

function totalRow(label, value, { strong = false, top = false } = {}) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;${top ? 'border-top:1px solid var(--line);margin-top:10px;padding-top:12px;' : 'padding:4px 0;'}">
          <span style="font-size:${strong ? '15' : '13.5'}px;font-weight:${strong ? 600 : 400};color:${strong ? 'var(--ink)' : 'var(--ink-2)'}">${label}</span>
          <span style="font-size:${strong ? '20' : '13.5'}px;font-weight:${strong ? 600 : 500};letter-spacing:${strong ? '-0.02em' : '0'};font-variant-numeric:tabular-nums;color:var(--ink)">${value}</span>
        </div>`;
}

function step(state, label, when, last) {
  const done = state === 'done', now = state === 'now';
  const color = done ? 'var(--green)' : now ? 'var(--red)' : 'var(--line)';
  return `<div style="display:flex;gap:12px">
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:${done || now ? color : 'var(--surface)'};border:${done || now ? '0' : '1.5px solid var(--line)'}">
              ${done ? ic('check', 13, '#fff', 3) : now ? `<span style="width:7px;height:7px;border-radius:999px;background:#fff"></span>` : ''}
            </span>
            ${last ? '' : `<span style="width:1.5px;flex:1;min-height:26px;background:${done ? 'var(--green)' : 'var(--line)'}"></span>`}
          </div>
          <div style="padding-bottom:${last ? '0' : '14px'}">
            <div style="font-size:14px;font-weight:500;color:${done || now ? 'var(--ink)' : 'var(--ink-3)'}">${label}</div>
            <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">${when}</div>
          </div>
        </div>`;
}

function reminderRow(state, label, when, last) {
  const sent = state === 'sent';
  return `<div style="display:flex;align-items:center;gap:11px;padding:9px 0;${last ? '' : 'border-bottom:1px solid var(--line-2)'}">
          ${sent
            ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;background:var(--green-soft)">${ic('check', 12, 'var(--green)', 3)}</span>`
            : `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;border:1.5px dashed var(--line)"></span>`}
          <span style="flex:1;font-size:13.5px;color:${sent ? 'var(--ink)' : 'var(--ink-2)'}">${label}</span>
          <span style="font-size:13px;color:var(--ink-3);font-variant-numeric:tabular-nums">${when}</span>
        </div>`;
}

export function invoiceBody() {
  return `${sidebar('invoices')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">

    <div style="display:flex;align-items:center;gap:14px;padding:18px 32px;border-bottom:1px solid var(--line);flex-shrink:0">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">${ic('chevLeft', 17, 'var(--ink-2)')}</span>
      <div>
        <div style="display:flex;align-items:center;gap:10px">
          <h1 style="margin:0;font-family:'Geist Mono',ui-monospace,monospace;font-size:24px;font-weight:500;letter-spacing:-0.02em;color:var(--ink)">SC-2026-041</h1>
          ${statusPill('Overdue')}
        </div>
        <div style="font-size:13px;color:var(--ink-3);margin-top:3px">Kestrel Labs · billed 14 Jul 2026 · due 28 Aug 2026</div>
      </div>
      <div style="flex:1"></div>
      ${btnOutline('Edit', 'pencil')}
      ${btnOutline('Download PDF', 'download')}
      ${btnPrimary('Mark as paid', 'check')}
    </div>

    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;gap:20px;align-items:flex-start">

      <!-- MAIN -->
      <div style="flex:1.55;min-width:0;display:flex;flex-direction:column;gap:20px">

        <!-- Overdue action card: the one thing to do, with the button on it -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:18px 20px 19px">
          <div style="display:flex;align-items:center;gap:12px">
            ${tile('alert', 'red')}
            <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Overdue by 34 days</span>
            <span style="flex:1"></span>
            ${btnOutline('Copy payment link', 'share')}
            ${btnDark('Send reminder now')}
          </div>
          <div style="display:flex;align-items:center;gap:20px;margin-top:16px">
            <div>
              <div style="font-size:38px;font-weight:600;letter-spacing:-0.035em;line-height:1;font-variant-numeric:tabular-nums;color:var(--red)">₹64,000</div>
              <div style="font-size:13.5px;color:var(--ink-2);margin-top:8px">Reminder 2 of 3 sent · next goes out 10 Sep unless paid</div>
            </div>
            <span style="flex:1"></span>
            <div style="text-align:right">
              ${tickBar(66, 'red', 132)}
              <div style="font-size:12.5px;color:var(--ink-3);margin-top:6px">Follow-up schedule</div>
            </div>
          </div>
        </div>

        <!-- Parties -->
        <div style="display:flex;gap:16px">
          ${partyCard(
            'Billed to',
            `<div style="display:flex;align-items:center;gap:11px">
                ${letterTile('K', 'red', 32)}
                <div style="min-width:0">
                  <div style="font-size:14.5px;font-weight:500;color:var(--ink)">Kestrel Labs</div>
                  <div style="font-size:12.5px;color:var(--ink-3);margin-top:1px">Anita Rao · accounts@kestrel.io</div>
                </div>
              </div>
              <div style="font-size:13px;line-height:1.55;color:var(--ink-2);margin-top:11px">14 Residency Road<br>Bengaluru 560025, India<br>GSTIN 29AABCK1234M1Z5</div>`,
            `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:var(--field)">${ic('pencil', 13, 'var(--ink-2)')}</span>`
          )}
          ${partyCard(
            'From',
            `<div style="display:flex;align-items:center;gap:11px">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:var(--blue);color:#fff;font-size:13px;font-weight:600">SC</span>
                <div style="min-width:0">
                  <div style="font-size:14.5px;font-weight:500;color:var(--ink)">Sundar Consulting</div>
                  <div style="font-size:12.5px;color:var(--ink-3);margin-top:1px">Snapshot frozen at creation</div>
                </div>
              </div>
              <div style="font-size:13px;line-height:1.55;color:var(--ink-2);margin-top:11px">GSTIN 29AAAPS9999Q1ZP · PAN AAAPS9999Q<br>HDFC ****4471 · IFSC HDFC0001234<br>UPI sundar@hdfcbank</div>`
          )}
          ${partyCard(
            'Dates &amp; terms',
            `<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:13.5px">
                <span style="color:var(--ink-3)">Billed</span><span style="font-variant-numeric:tabular-nums;text-align:right">14 Jul 2026</span>
                <span style="color:var(--ink-3)">Due</span><span style="font-variant-numeric:tabular-nums;text-align:right;color:var(--red);font-weight:500">28 Aug 2026</span>
                <span style="color:var(--ink-3)">Terms</span><span style="text-align:right">Net 45</span>
                <span style="color:var(--ink-3)">Currency</span><span style="text-align:right">INR (₹)</span>
              </div>`
          )}
        </div>

        <!-- Line items -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);overflow:hidden">
          <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
            <div style="flex:2.6;font-size:12.5px;font-weight:500;color:var(--ink-3)">Item</div>
            <div style="flex:0 0 56px;text-align:right;font-size:12.5px;font-weight:500;color:var(--ink-3)">Qty</div>
            <div style="flex:0 0 96px;text-align:right;font-size:12.5px;font-weight:500;color:var(--ink-3)">Rate</div>
            <div style="flex:0 0 72px;text-align:right;font-size:12.5px;font-weight:500;color:var(--ink-3)">Tax</div>
            <div style="flex:0 0 104px;text-align:right;font-size:12.5px;font-weight:500;color:var(--ink-3)">Amount</div>
          </div>
          ${lineRow('Product design retainer', 'July 2026 · 4 weeks', '1', '₹40,000', '18%', '₹40,000')}
          ${lineRow('Design system audit', 'Component inventory and token map', '1', '₹12,000', '18%', '₹12,000')}
          ${lineRow('Additional screens', 'Onboarding and empty states', '6', '₹450', '18%', '₹2,700', true)}
          <div style="display:flex;justify-content:flex-end;padding:16px 20px 18px;border-top:1px solid var(--line);background:var(--canvas)">
            <div style="width:288px">
              ${totalRow('Subtotal', '₹54,700')}
              ${totalRow('CGST 9%', '₹4,923')}
              ${totalRow('SGST 9%', '₹4,923')}
              ${totalRow('Total due', '₹64,546', { strong: true, top: true })}
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:16px 18px">
          <div style="font-size:12.5px;font-weight:500;color:var(--ink-3)">Notes on the invoice</div>
          <div style="font-size:13.5px;line-height:1.55;color:var(--ink-2);margin-top:8px">Payable within 45 days by NEFT or UPI. Please quote the invoice number in the transfer reference.</div>
        </div>
      </div>

      <!-- SIDE -->
      <div style="flex:1;min-width:0;max-width:400px;display:flex;flex-direction:column;gap:20px">

        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:18px 20px">
          <div style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Lifecycle</div>
          <div style="margin-top:16px">
            ${step('done', 'Drafted', '12 Jul 2026 · by you')}
            ${step('done', 'Sent to Kestrel Labs', '14 Jul 2026 · PDF attached')}
            ${step('now', 'Payment overdue', 'since 28 Aug 2026')}
            ${step('todo', 'Paid', 'not yet', true)}
          </div>
        </div>

        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:18px 20px 16px">
          <div style="display:flex;align-items:center;gap:10px">
            ${ic('bell', 17, 'var(--ink-2)')}
            <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;flex:1">Follow-ups</span>
            <span style="display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:var(--green-soft);color:var(--green);font-size:12.5px;font-weight:500"><span style="width:6px;height:6px;border-radius:999px;background:var(--green)"></span>Active</span>
          </div>
          <div style="font-size:13px;color:var(--ink-2);margin-top:9px">Using <span style="color:var(--ink);font-weight:500">Sundar Consulting · Net 45</span> schedule</div>
          <div style="margin-top:12px">
            ${reminderRow('sent', 'Reminder 1 — gentle nudge', '04 Sep')}
            ${reminderRow('sent', 'Reminder 2 — follow up', '10 Sep')}
            ${reminderRow('todo', 'Reminder 3 — final notice', '17 Sep', true)}
          </div>
          <div style="display:flex;gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line-2)">
            ${btnOutline('Pause', 'pause', 32)}
            ${btnOutline('Send one now', 'send', 32)}
          </div>
        </div>

        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:16px 20px 14px">
            <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;flex:1">PDF preview</span>
            <a href="#" style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:500">Open ${ic('arrowRight', 13, 'currentColor')}</a>
          </div>
          <div style="background:var(--canvas);border-top:1px solid var(--line);padding:18px 20px 22px;display:flex;justify-content:center">
            <div style="width:236px;aspect-ratio:1/1.414;background:#fff;border:1px solid var(--line);border-radius:4px;box-shadow:0 4px 14px rgb(0 0 0 / 0.08);padding:18px 16px;display:flex;flex-direction:column">
              <div style="display:flex;align-items:flex-start;justify-content:space-between">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--blue);color:#fff;font-size:9px;font-weight:600">SC</span>
                <div style="text-align:right">
                  <div style="font-size:7px;color:var(--ink-3)">INVOICE</div>
                  <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:8px;color:var(--ink)">SC-2026-041</div>
                </div>
              </div>
              <div style="display:flex;gap:12px;margin-top:14px">
                <div style="flex:1"><div style="height:4px;width:70%;border-radius:2px;background:var(--line)"></div><div style="height:3px;width:90%;border-radius:2px;background:var(--line-2);margin-top:4px"></div><div style="height:3px;width:60%;border-radius:2px;background:var(--line-2);margin-top:3px"></div></div>
                <div style="flex:1"><div style="height:4px;width:70%;border-radius:2px;background:var(--line)"></div><div style="height:3px;width:85%;border-radius:2px;background:var(--line-2);margin-top:4px"></div><div style="height:3px;width:55%;border-radius:2px;background:var(--line-2);margin-top:3px"></div></div>
              </div>
              <div style="height:1px;background:var(--line);margin-top:14px"></div>
              <div style="display:flex;flex-direction:column;gap:7px;margin-top:9px">
                <div style="display:flex;gap:8px;align-items:center"><span style="flex:1;height:3px;border-radius:2px;background:var(--line-2)"></span><span style="width:26px;height:3px;border-radius:2px;background:var(--line)"></span></div>
                <div style="display:flex;gap:8px;align-items:center"><span style="flex:1;height:3px;border-radius:2px;background:var(--line-2)"></span><span style="width:26px;height:3px;border-radius:2px;background:var(--line)"></span></div>
                <div style="display:flex;gap:8px;align-items:center"><span style="flex:1;height:3px;border-radius:2px;background:var(--line-2)"></span><span style="width:26px;height:3px;border-radius:2px;background:var(--line)"></span></div>
              </div>
              <div style="flex:1"></div>
              <div style="display:flex;justify-content:flex-end;align-items:baseline;gap:8px;border-top:1px solid var(--line);padding-top:8px">
                <span style="font-size:7px;color:var(--ink-3)">TOTAL</span>
                <span style="font-size:11px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums">₹64,546</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
