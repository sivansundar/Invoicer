import { ic, btnOutline, btnPrimary, letterTile } from './lib.mjs';
import { sidebar } from './shell.mjs';

function formCard(step, title, hint, body, right) {
  return `<div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);padding:18px 20px 20px">
        <div style="display:flex;align-items:center;gap:11px">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;border-radius:8px;background:var(--field);font-size:12.5px;font-weight:600;color:var(--ink-2);font-variant-numeric:tabular-nums">${step}</span>
          <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;color:var(--ink)">${title}</span>
          ${hint ? `<span style="font-size:13px;color:var(--ink-3)">${hint}</span>` : ''}
          <span style="flex:1"></span>
          ${right ?? ''}
        </div>
        <div style="margin-top:16px">${body}</div>
      </div>`;
}

function pick(logo, tone, name, sub, active) {
  return `<div style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:12px;${
    active
      ? 'background:var(--surface);border:1.5px solid var(--blue);box-shadow:0 0 0 3px oklch(0.52 0.16 258 / 0.10)'
      : 'background:var(--surface);border:1px solid var(--line)'
  }">
          ${letterTile(logo, tone, 32)}
          <div style="min-width:0;flex:1">
            <div style="font-size:14px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div style="font-size:12px;color:var(--ink-3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>
          </div>
          ${active ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex-shrink:0;border-radius:999px;background:var(--blue)">${ic('check', 11, '#fff', 3)}</span>` : ''}
        </div>`;
}

function chip(text) {
  return `<span style="display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px;border-radius:999px;background:var(--field);font-size:13px;color:var(--ink-2);white-space:nowrap">${text}</span>`;
}

function seg(items, active, { grow = false } = {}) {
  return `<div style="display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:10px;background:var(--field);${grow ? 'width:100%' : ''}">
        ${items.map((t, i) => `<span style="${grow ? 'flex:1;justify-content:center;' : ''}display:inline-flex;align-items:center;height:30px;padding:0 13px;border-radius:8px;font-size:13.5px;font-weight:500;white-space:nowrap;${i === active ? 'background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgb(0 0 0 / 0.06)' : 'color:var(--ink-2)'}">${t}</span>`).join('')}
      </div>`;
}

function inputRow(label, value, { w = null, placeholder = false, mono = false, trailing = null } = {}) {
  return `<div style="${w ? `flex:0 0 ${w}px;` : 'flex:1;'}min-width:0;display:flex;flex-direction:column;gap:7px">
          <label style="font-size:12.5px;font-weight:500;color:var(--ink-3)">${label}</label>
          <div style="display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card);font-size:14px;${mono ? "font-family:var(--font-mono);font-size:13px;" : ''}color:${placeholder ? 'var(--ink-3)' : 'var(--ink)'}">
            <span style="flex:1;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${value}</span>${trailing ?? ''}
          </div>
        </div>`;
}

function itemRow(desc, sub, qty, rate, tax, amount, last) {
  return `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;${last ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <span style="flex-shrink:0;color:var(--ink-3);cursor:grab">${ic('filter', 15, 'var(--ink-3)')}</span>
          <div style="flex:2.4;min-width:0">
            <div style="font-size:14px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${desc}</div>
            <div style="font-size:12px;color:var(--ink-3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>
          </div>
          <div style="flex:0 0 52px"><div style="height:32px;display:flex;align-items:center;justify-content:flex-end;padding:0 9px;border-radius:8px;background:var(--canvas);font-size:13.5px;font-variant-numeric:tabular-nums">${qty}</div></div>
          <div style="flex:0 0 88px"><div style="height:32px;display:flex;align-items:center;justify-content:flex-end;padding:0 9px;border-radius:8px;background:var(--canvas);font-size:13.5px;font-variant-numeric:tabular-nums">${rate}</div></div>
          <div style="flex:0 0 68px"><div style="height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 8px;border-radius:8px;background:var(--canvas);font-size:13px;font-variant-numeric:tabular-nums;color:var(--ink-2)">${tax}${ic('chevDown', 12, 'var(--ink-3)')}</div></div>
          <div style="flex:0 0 92px;text-align:right;font-size:14px;font-weight:500;font-variant-numeric:tabular-nums">${amount}</div>
          <span style="flex-shrink:0;width:26px;display:flex;justify-content:center">${ic('trash', 14, 'var(--ink-3)')}</span>
        </div>`;
}

export function newInvoiceBody() {
  return `${sidebar('invoices')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">

    <div style="display:flex;align-items:center;gap:14px;padding:18px 32px;border-bottom:1px solid var(--line);flex-shrink:0">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">${ic('chevLeft', 17, 'var(--ink-2)')}</span>
      <div>
        <div style="display:flex;align-items:center;gap:10px">
          <h1 style="margin:0;font-size:28px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);color:var(--ink)">New invoice</h1>
          <span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--field);font-family:var(--font-mono);font-size:12.5px;color:var(--ink-2)">SC-2026-043</span>
        </div>
        <div style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-3);margin-top:3px">
          ${ic('check', 13, 'var(--green)', 3)}Saved as draft a moment ago
        </div>
      </div>
      <div style="flex:1"></div>
      ${btnOutline('Preview PDF', 'download')}
      ${btnPrimary('Send invoice', 'send')}
    </div>

    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;gap:20px;align-items:flex-start">

      <!-- FORM -->
      <div style="flex:1.42;min-width:0;display:flex;flex-direction:column;gap:16px">

        ${formCard('1', 'Bill from', null, `
            <div style="display:flex;gap:10px">
              ${pick('SC', 'blue', 'Sundar Consulting', 'GSTIN 29AAAPS9999Q1ZP', true)}
              ${pick('AV', 'amber', 'Avara Labs', 'GSTIN 29AAECA5678R1Z9', false)}
              ${pick('FP', 'green', 'Foldpaper Studio', 'PAN AAFPF4321K', false)}
            </div>
            <div style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12.5px;color:var(--ink-3)">
              ${ic('check', 13, 'var(--green)', 3)}Address, bank details and logo are copied onto this invoice and frozen there.
            </div>`)}

        ${formCard('2', 'Bill to', null, `
            <div style="display:flex;align-items:center;gap:9px;height:44px;padding:0 14px;border-radius:11px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">
              ${ic('search', 17, 'var(--ink-3)')}
              <span style="flex:1;font-size:14.5px;color:var(--ink-3)">Search saved clients, or type a new name…</span>
              <span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:8px;background:var(--field);font-size:12.5px;font-weight:500;color:var(--ink-2)">18 saved</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
              <span style="font-size:12.5px;color:var(--ink-3);margin-right:2px">Recent</span>
              ${chip('<span style="width:6px;height:6px;border-radius:999px;background:var(--red)"></span>Kestrel Labs')}
              ${chip('<span style="width:6px;height:6px;border-radius:999px;background:var(--blue)"></span>Northwind Studio')}
              ${chip('<span style="width:6px;height:6px;border-radius:999px;background:var(--violet)"></span>Meridian Foods')}
              ${chip('<span style="width:6px;height:6px;border-radius:999px;background:var(--amber)"></span>Harbourline Ltd')}
              <span style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:999px;border:1px dashed var(--line);font-size:13px;color:var(--ink-2)">${ic('plus', 13, 'var(--ink-2)')}New client</span>
            </div>`)}

        ${formCard('3', 'Dates', null, `
            <div style="display:flex;gap:12px;align-items:flex-end">
              ${inputRow('Bill date', '18 Aug 2026', { w: 168, trailing: ic('calendar', 15, 'var(--ink-3)') })}
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px">
                <label style="font-size:12.5px;font-weight:500;color:var(--ink-3)">Payment terms</label>
                ${seg(['Net 15', 'Net 30', 'Net 45', 'Custom'], 2, { grow: true })}
              </div>
              ${inputRow('Due date', '02 Oct 2026', { w: 168, trailing: `<span style="font-size:11.5px;color:var(--ink-3);white-space:nowrap">auto</span>` })}
            </div>`)}

        ${formCard('4', 'Items', null, `
            <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface)">
              <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line);background:var(--canvas)">
                <span style="width:15px;flex-shrink:0"></span>
                <div style="flex:2.4;font-size:12px;font-weight:500;color:var(--ink-3)">Description</div>
                <div style="flex:0 0 52px;text-align:right;font-size:12px;font-weight:500;color:var(--ink-3)">Qty</div>
                <div style="flex:0 0 88px;text-align:right;font-size:12px;font-weight:500;color:var(--ink-3)">Rate</div>
                <div style="flex:0 0 68px;text-align:right;font-size:12px;font-weight:500;color:var(--ink-3)">Tax</div>
                <div style="flex:0 0 92px;text-align:right;font-size:12px;font-weight:500;color:var(--ink-3)">Amount</div>
                <span style="width:26px;flex-shrink:0"></span>
              </div>
              ${itemRow('Product design retainer', 'July 2026 · 4 weeks', '1', '40,000', '18%', '₹40,000')}
              ${itemRow('Design system audit', 'Component inventory and token map', '1', '12,000', '18%', '₹12,000')}
              ${itemRow('Additional screens', 'Onboarding and empty states', '6', '450', '18%', '₹2,700', true)}
              <div style="display:flex;align-items:center;gap:9px;padding:11px 14px;border-top:1px dashed var(--line);color:var(--ink-2)">
                ${ic('plus', 15, 'var(--ink-2)')}<span style="font-size:13.5px;font-weight:500">Add item</span>
                <span style="flex:1"></span>
                <span style="font-size:12px;color:var(--ink-3)">or paste a list</span>
              </div>
            </div>

            <div style="display:flex;align-items:flex-start;gap:20px;margin-top:16px">
              <div style="flex:1;min-width:0">
                <label style="font-size:12.5px;font-weight:500;color:var(--ink-3)">Notes on the invoice</label>
                <div style="margin-top:7px;min-height:78px;padding:11px 13px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card);font-size:13.5px;line-height:1.55;color:var(--ink-2)">Payable within 45 days by NEFT or UPI. Please quote the invoice number in the transfer reference.</div>
              </div>
              <div style="flex:0 0 254px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                  <span style="font-size:12.5px;font-weight:500;color:var(--ink-3)">Currency</span>
                  ${seg(['₹ INR', '$ USD', 'S$ SGD'], 0)}
                </div>
                <div style="border-radius:12px;background:var(--canvas);border:1px solid var(--line);padding:13px 15px">
                  <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13.5px"><span style="color:var(--ink-2)">Subtotal</span><span style="font-variant-numeric:tabular-nums;font-weight:500">₹54,700</span></div>
                  <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13.5px"><span style="color:var(--ink-2)">CGST 9%</span><span style="font-variant-numeric:tabular-nums;font-weight:500">₹4,923</span></div>
                  <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13.5px"><span style="color:var(--ink-2)">SGST 9%</span><span style="font-variant-numeric:tabular-nums;font-weight:500">₹4,923</span></div>
                  <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);margin-top:9px;padding-top:11px">
                    <span style="font-size:14.5px;font-weight:600">Total</span>
                    <span style="font-size:21px;font-weight:600;letter-spacing:-0.025em;font-variant-numeric:tabular-nums">₹64,546</span>
                  </div>
                </div>
              </div>
            </div>`)}

        ${formCard('5', 'After you send', null, `
            <div style="display:flex;align-items:center;gap:13px;padding:14px 16px;border-radius:12px;background:var(--canvas);border:1px solid var(--line)">
              <span style="display:inline-flex;align-items:center;width:40px;height:23px;flex-shrink:0;border-radius:999px;background:var(--blue);padding:2px;justify-content:flex-end">
                <span style="width:19px;height:19px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgb(0 0 0 / 0.25)"></span>
              </span>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:500;color:var(--ink)">Chase this invoice automatically</div>
                <div style="font-size:12.5px;color:var(--ink-2);margin-top:2px">3 reminders on the Sundar Consulting · Net 45 schedule — first one 7 days after the due date.</div>
              </div>
              ${btnOutline('Change', null, 32)}
            </div>`)}
      </div>

      <!-- LIVE PREVIEW -->
      <div style="flex:1;min-width:0;max-width:404px;display:flex;flex-direction:column;gap:16px">
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card);overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:15px 18px 14px">
            <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;flex:1">Live preview</span>
            ${seg(['Classic', 'Modern'], 0)}
          </div>
          <div style="background:var(--canvas);border-top:1px solid var(--line);padding:20px;display:flex;justify-content:center">
            <div style="width:100%;max-width:322px;aspect-ratio:1/1.414;background:#fff;border:1px solid var(--line);border-radius:5px;box-shadow:0 6px 20px rgb(0 0 0 / 0.09);padding:24px 22px;display:flex;flex-direction:column">
              <div style="display:flex;align-items:flex-start;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:var(--blue);color:#fff;font-size:11px;font-weight:600">SC</span>
                  <div>
                    <div style="font-size:10.5px;font-weight:600;color:var(--ink)">Sundar Consulting</div>
                    <div style="font-size:8px;color:var(--ink-3);margin-top:1px">Bengaluru, India</div>
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:8px;letter-spacing:0.08em;color:var(--ink-3)">INVOICE</div>
                  <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink);margin-top:2px">SC-2026-043</div>
                </div>
              </div>

              <div style="display:flex;gap:16px;margin-top:20px">
                <div style="flex:1">
                  <div style="font-size:7.5px;letter-spacing:0.06em;color:var(--ink-3)">BILLED TO</div>
                  <div style="font-size:9.5px;font-weight:500;color:var(--ink);margin-top:4px">Kestrel Labs</div>
                  <div style="font-size:8px;line-height:1.5;color:var(--ink-2);margin-top:2px">14 Residency Road<br>Bengaluru 560025</div>
                </div>
                <div style="flex:0 0 92px">
                  <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--ink-2)"><span>Billed</span><span style="color:var(--ink)">18 Aug 26</span></div>
                  <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--ink-2);margin-top:3px"><span>Due</span><span style="color:var(--ink)">02 Oct 26</span></div>
                  <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--ink-2);margin-top:3px"><span>Terms</span><span style="color:var(--ink)">Net 45</span></div>
                </div>
              </div>

              <div style="margin-top:18px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px 0">
                <div style="display:flex;font-size:7.5px;letter-spacing:0.05em;color:var(--ink-3)"><span style="flex:1">ITEM</span><span style="width:22px;text-align:right">QTY</span><span style="width:46px;text-align:right">AMOUNT</span></div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:9px">
                <div style="display:flex;font-size:8.5px;color:var(--ink)"><span style="flex:1">Product design retainer</span><span style="width:22px;text-align:right">1</span><span style="width:46px;text-align:right;font-variant-numeric:tabular-nums">₹40,000</span></div>
                <div style="display:flex;font-size:8.5px;color:var(--ink)"><span style="flex:1">Design system audit</span><span style="width:22px;text-align:right">1</span><span style="width:46px;text-align:right;font-variant-numeric:tabular-nums">₹12,000</span></div>
                <div style="display:flex;font-size:8.5px;color:var(--ink)"><span style="flex:1">Additional screens</span><span style="width:22px;text-align:right">6</span><span style="width:46px;text-align:right;font-variant-numeric:tabular-nums">₹2,700</span></div>
              </div>

              <div style="flex:1"></div>

              <div style="display:flex;justify-content:flex-end">
                <div style="width:132px">
                  <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--ink-2)"><span>Subtotal</span><span style="font-variant-numeric:tabular-nums">₹54,700</span></div>
                  <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--ink-2);margin-top:3px"><span>CGST 9%</span><span style="font-variant-numeric:tabular-nums">₹4,923</span></div>
                  <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--ink-2);margin-top:3px"><span>SGST 9%</span><span style="font-variant-numeric:tabular-nums">₹4,923</span></div>
                  <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--line);margin-top:6px;padding-top:6px">
                    <span style="font-size:9px;font-weight:600;color:var(--ink)">Total</span>
                    <span style="font-size:12px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-0.02em">₹64,546</span>
                  </div>
                </div>
              </div>
              <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:8px;font-size:7.5px;line-height:1.5;color:var(--ink-3)">
                HDFC ****4471 · IFSC HDFC0001234 · UPI sundar@hdfcbank
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-radius:13px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">
          ${ic('sparkle', 17, 'var(--blue)')}
          <div style="font-size:13px;line-height:1.55;color:var(--ink-2)">
            <span style="color:var(--ink);font-weight:500">One button does it all.</span> Send emails the PDF to accounts@kestrel.io, marks the invoice Sent, and starts the reminder schedule. Nothing else to click.
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
