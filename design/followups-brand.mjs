import { ic, tile, tileOutline, delta, btnDark, btnOutline, btnPrimary, letterTile, cell2, tickBar, sectionLabel } from './lib.mjs';
import { sidebar, segmented } from './shell.mjs';

const CARD = 'background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-card)';

function th(label, flex, align = 'left') {
  return `<div style="flex:${flex};min-width:0;text-align:${align};font-size:12.5px;font-weight:500;color:var(--ink-3)">${label}</div>`;
}

function metric(iconName, label, value, sub) {
  return `<div style="flex:1;min-width:0;${CARD};padding:16px 18px">
        <div style="display:flex;align-items:center;gap:11px">${tileOutline(iconName)}<span style="font-size:14px;font-weight:500;color:var(--ink)">${label}</span></div>
        <div style="font-size:30px;font-weight:600;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;margin-top:13px;color:var(--ink)">${value}</div>
        <div style="margin-top:10px">${sub}</div>
      </div>`;
}

/** Outcome of a reminder — what the follow-up actually achieved. */
function outcome(kind, text) {
  const map = {
    paid:   ['var(--green)', 'var(--green-soft)', 'checkCircle'],
    none:   ['var(--ink-3)', 'var(--field)',      'minus'],
    opened: ['var(--blue)',  'var(--blue-soft)',  'mail'],
    late:   ['var(--amber)', 'var(--amber-soft)', 'alert'],
  };
  const [fg, bg, icon] = map[kind];
  return `<span style="display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 11px;border-radius:999px;background:${bg};color:${fg};font-size:12.5px;font-weight:500;white-space:nowrap">${ic(icon, 13, fg, 2.4)}${text}</span>`;
}

function monthHeader(label, count, total) {
  return `<div style="display:flex;align-items:center;gap:12px;padding:9px 20px;background:var(--canvas);border-bottom:1px solid var(--line-2)">
          <span style="font-size:12.5px;font-weight:600;color:var(--ink-2);letter-spacing:0.01em">${label}</span>
          <span style="font-size:12.5px;color:var(--ink-3)">${count} reminders</span>
          <span style="flex:1"></span>
          <span style="font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums">${total} recovered</span>
        </div>`;
}

function historyRow({ date, dateSub, number, client, reminder, reminderSub, result, resultKind, isLast }) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:13px 20px;${isLast ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:1;min-width:0">${cell2(date, dateSub)}</div>
          <div style="flex:1.2;min-width:0">${cell2(number, client, { mono: true })}</div>
          <div style="flex:1.4;min-width:0">${cell2(reminder, reminderSub)}</div>
          <div style="flex:0 0 210px;display:flex;justify-content:flex-end">${outcome(resultKind, result)}</div>
        </div>`;
}

function scheduledRow({ number, client, reminder, reminderSub, when, whenSub, isLast }) {
  return `<div style="display:flex;align-items:center;gap:16px;padding:13px 20px;${isLast ? '' : 'border-bottom:1px solid var(--line-2)'}">
          <div style="flex:1.2;min-width:0">${cell2(number, client, { mono: true })}</div>
          <div style="flex:1.4;min-width:0">${cell2(reminder, reminderSub)}</div>
          <div style="flex:1;min-width:0">${cell2(when, whenSub)}</div>
          <div style="flex:0 0 202px;display:flex;justify-content:flex-end;gap:9px">${btnOutline('Hold', 'pause', 32)}${btnOutline('Send now', 'send', 32)}</div>
        </div>`;
}

/** Recovery rate per reminder step — which nudge actually gets people to pay. */
function stepRecovery(n, label, sent, recovered, pct) {
  return `<div style="padding:11px 0;border-bottom:1px solid var(--line-2)">
          <div style="display:flex;align-items:baseline;gap:10px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;flex-shrink:0;border-radius:6px;background:var(--blue-soft);font-size:11.5px;font-weight:600;color:var(--blue);align-self:center">${n}</span>
            <span style="flex:1;font-size:13.5px;color:var(--ink)">${label}</span>
            <span style="font-size:13.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums">${pct}%</span>
          </div>
          <div style="height:7px;border-radius:3px;background:var(--line-2);margin:8px 0 0 31px">
            <div style="width:${pct}%;height:7px;border-radius:3px;background:var(--green)"></div>
          </div>
          <div style="font-size:12px;color:var(--ink-3);margin:6px 0 0 31px;font-variant-numeric:tabular-nums">${recovered} of ${sent} paid within 7 days</div>
        </div>`;
}

export function followupsBrandBody() {
  return `${sidebar('followups')}
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas)">

    <div style="display:flex;align-items:center;gap:14px;padding:18px 32px;border-bottom:1px solid var(--line);flex-shrink:0">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">${ic('chevLeft', 17, 'var(--ink-2)')}</span>
      ${letterTile('SC', 'blue', 38)}
      <div>
        <div style="display:flex;align-items:center;gap:10px">
          <h1 style="margin:0;font-size:28px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);color:var(--ink)">Sundar Consulting</h1>
          <span style="display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:var(--green-soft);color:var(--green);font-size:12.5px;font-weight:500"><span style="width:6px;height:6px;border-radius:999px;background:var(--green)"></span>Reminders on</span>
        </div>
        <div style="font-size:13px;color:var(--ink-3);margin-top:3px">Every follow-up sent and scheduled for this brand · Net 45 schedule</div>
      </div>
      <div style="flex:1"></div>
      ${btnOutline('Export history', 'download')}
      ${btnOutline('Edit schedule', 'pencil')}
    </div>

    <div style="flex:1;min-height:0;padding:24px 32px 28px;display:flex;flex-direction:column;gap:22px">

      <!-- Lifetime summary for this brand -->
      <div style="display:flex;gap:16px">
        ${metric('send', 'Reminders sent', '38', `<div style="display:flex;align-items:center"><span style="font-size:13px;color:var(--ink-2)">across 14 invoices</span><span style="flex:1"></span>${delta('up', '+6')}</div>`)}
        ${metric('checkCircle', 'Recovered', '₹4,12,000', `<div style="display:flex;align-items:center"><span style="font-size:13px;color:var(--ink-2)">9 invoices paid after a nudge</span></div>`)}
        ${metric('repeat', 'Avg nudges to pay', '1.8', `<div style="display:flex;align-items:center">${delta('goodDown', '−0.4')}<span style="flex:1"></span><span style="font-size:13px;color:var(--ink-3)">vs 2.2</span></div>`)}
        ${metric('clock', 'Pays after a nudge', '64%', `<div style="display:flex;align-items:center"><span style="font-size:13px;color:var(--ink-2)">within 7 days</span><span style="flex:1"></span>${delta('up', '+9 pts')}</div>`)}
        ${metric('alert', 'Still unanswered', '03', `<div style="display:flex;align-items:center"><span style="font-size:13px;color:var(--ink-2)">3 nudges, no reply</span></div>`)}
      </div>

      <div style="display:flex;gap:20px;align-items:flex-start">

        <!-- MAIN -->
        <div style="flex:1.9;min-width:0;display:flex;flex-direction:column;gap:22px">

          <div style="display:flex;flex-direction:column;gap:14px">
            ${sectionLabel('Scheduled next', 'Pause all for this brand')}
            <div style="${CARD};overflow:hidden">
              <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
                ${th('Invoice', '1.2')}${th('Reminder', '1.4')}${th('Sends', '1')}
                <div style="flex:0 0 202px"></div>
              </div>
              ${scheduledRow({ number: 'SC-2026-041', client: 'Kestrel Labs', reminder: 'Final notice', reminderSub: 'reminder 3 of 3', when: 'Today, 09:00', whenSub: 'in 2 hours' })}
              ${scheduledRow({ number: 'SC-2026-042', client: 'Northwind Studio', reminder: 'Gentle nudge', reminderSub: 'reminder 2 of 3', when: 'Today, 09:00', whenSub: 'in 2 hours' })}
              ${scheduledRow({ number: 'SC-2026-044', client: 'Lantern Books', reminder: 'Due soon', reminderSub: 'reminder 1 of 3', when: '24 Aug, 09:00', whenSub: 'in 6 days', isLast: true })}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              ${sectionLabel('Everything sent')}
              <span style="flex:1"></span>
              ${segmented(['All 38', 'Paid after', 'No reply'], 0)}
              ${btnOutline('FY 2026–27', 'calendar', 34)}
            </div>

            <div style="${CARD};overflow:hidden">
              <div style="display:flex;align-items:center;gap:16px;padding:11px 20px;border-bottom:1px solid var(--line)">
                ${th('Sent', '1')}${th('Invoice', '1.2')}${th('Reminder', '1.4')}${th('What happened', '0 0 210px', 'right')}
              </div>

              ${monthHeader('AUGUST 2026', 9, '₹1,84,000')}
              ${historyRow({ date: '10 Aug', dateSub: '09:00', number: 'SC-2026-041', client: 'Kestrel Labs', reminder: 'Follow up', reminderSub: 'reminder 2 of 3', result: 'No reply yet', resultKind: 'none' })}
              ${historyRow({ date: '04 Aug', dateSub: '09:00', number: 'SC-2026-041', client: 'Kestrel Labs', reminder: 'Gentle nudge', reminderSub: 'reminder 1 of 3', result: 'Opened, not paid', resultKind: 'opened' })}
              ${historyRow({ date: '02 Aug', dateSub: '09:00', number: 'SC-2026-039', client: 'Meridian Foods', reminder: 'Gentle nudge', reminderSub: 'reminder 1 of 3', result: 'Paid 2 days later', resultKind: 'paid' })}
              ${historyRow({ date: '01 Aug', dateSub: '14:00', number: 'SC-2026-037', client: 'Lantern Books', reminder: 'Due soon', reminderSub: 'reminder 1 of 3', result: 'Paid same day', resultKind: 'paid' })}

              ${monthHeader('JULY 2026', 11, '₹2,28,000')}
              ${historyRow({ date: '28 Jul', dateSub: '09:00', number: 'SC-2026-036', client: 'Northwind Studio', reminder: 'Final notice', reminderSub: 'reminder 3 of 3', result: 'Paid 1 day later', resultKind: 'paid' })}
              ${historyRow({ date: '21 Jul', dateSub: '09:00', number: 'SC-2026-036', client: 'Northwind Studio', reminder: 'Follow up', reminderSub: 'reminder 2 of 3', result: 'No reply', resultKind: 'none' })}
              ${historyRow({ date: '14 Jul', dateSub: '09:00', number: 'SC-2026-036', client: 'Northwind Studio', reminder: 'Gentle nudge', reminderSub: 'reminder 1 of 3', result: 'Opened, not paid', resultKind: 'opened' })}
              ${historyRow({ date: '09 Jul', dateSub: '14:00', number: 'SC-2026-034', client: 'Calder &amp; Co', reminder: 'Due soon', reminderSub: 'reminder 1 of 3', result: 'Paid 4 days later', resultKind: 'paid' })}
              ${historyRow({ date: '03 Jul', dateSub: '09:00', number: 'SC-2026-032', client: 'Harbourline Ltd', reminder: 'Follow up', reminderSub: 'reminder 2 of 3', result: 'Escalated to final', resultKind: 'late', isLast: true })}

              <div style="display:flex;align-items:center;gap:16px;padding:13px 20px;border-top:1px solid var(--line)">
                <span style="font-size:13px;color:var(--ink-3);flex:1">Showing <span style="font-variant-numeric:tabular-nums;color:var(--ink-2)">9 of 38</span> reminders sent for this brand</span>
                ${btnOutline('Load older', null, 32)}
              </div>
            </div>
          </div>
        </div>

        <!-- SIDE -->
        <div style="flex:1;min-width:0;max-width:376px;display:flex;flex-direction:column;gap:20px">

          <div style="${CARD};padding:18px 20px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;flex:1">Which nudge works</span>
            </div>
            <p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--ink-2)">Share of reminders at each step that were followed by payment within a week.</p>
            <div style="margin-top:12px">
              ${stepRecovery(1, 'Due soon', 14, 6, 43)}
              ${stepRecovery(2, 'Gentle nudge', 13, 9, 69)}
              ${stepRecovery(3, 'Final notice', 11, 8, 73)}
            </div>
            <div style="display:flex;align-items:flex-start;gap:9px;margin-top:14px;padding:12px 13px;border-radius:11px;background:var(--canvas);border:1px solid var(--line)">
              ${ic('sparkle', 16, 'var(--blue)')}
              <span style="font-size:12.5px;line-height:1.5;color:var(--ink-2)">Most invoices settle after the second nudge. Moving it earlier than day 7 is worth testing.</span>
            </div>
          </div>

          <div style="${CARD};padding:18px 20px">
            <div style="display:flex;align-items:center;gap:10px">
              ${ic('bell', 17, 'var(--ink-2)')}
              <span style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em;flex:1">This brand's schedule</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:9px;margin-top:14px">
              ${[
                ['Due soon', '3 days before due', '14 sent'],
                ['Gentle nudge', '7 days after due', '13 sent'],
                ['Final notice', '21 days after due', '11 sent'],
              ].map(([label, when, sent], i) => `<div style="display:flex;align-items:center;gap:11px">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border-radius:7px;background:var(--blue-soft);font-size:11.5px;font-weight:600;color:var(--blue)">${i + 1}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13.5px;color:var(--ink)">${label}</div>
                  <div style="font-size:12px;color:var(--ink-3);margin-top:1px">${when}</div>
                </div>
                <span style="font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap">${sent}</span>
              </div>`).join('')}
            </div>
            <div style="display:flex;gap:9px;margin-top:15px;padding-top:14px;border-top:1px solid var(--line-2)">
              ${btnOutline('Edit schedule', null, 32)}
              ${btnOutline('Templates', null, 32)}
            </div>
          </div>

          <div style="${CARD};padding:18px 20px">
            <div style="font-size:15.5px;font-weight:600;letter-spacing:-0.012em">Other brands</div>
            <div style="display:flex;flex-direction:column;gap:2px;margin-top:12px">
              ${[
                ['AV', 'amber', 'Avara Labs', '19 sent · ₹1,86,000 recovered'],
                ['FP', 'green', 'Foldpaper Studio', 'Reminders off'],
              ].map(([l, t, name, sub]) => `<div style="display:flex;align-items:center;gap:11px;padding:9px 8px;border-radius:10px">
                ${letterTile(l, t, 30)}
                <div style="flex:1;min-width:0">
                  <div style="font-size:13.5px;font-weight:500;color:var(--ink)">${name}</div>
                  <div style="font-size:12px;color:var(--ink-3);margin-top:1px">${sub}</div>
                </div>
                ${ic('chevRight', 15, 'var(--ink-3)')}
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
