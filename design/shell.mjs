import { ic, btnPrimary, btnOutline } from './lib.mjs';

const W = 268; // sidebar width

function navItem(icon, label, { active = false, badge = null, count = null } = {}) {
  return `<div style="display:flex;align-items:center;gap:11px;height:38px;padding:0 11px;border-radius:10px;font-size:14.5px;letter-spacing:-0.005em;${
    active
      ? 'background:var(--surface);border:1px solid var(--line);box-shadow:0 1px 2px rgb(0 0 0 / 0.05);font-weight:500;color:var(--ink)'
      : 'color:var(--ink-2)'
  }">
          ${ic(icon, 18, active ? 'var(--ink)' : 'var(--ink-2)')}
          <span style="flex:1">${label}</span>
          ${badge ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:var(--blue);color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">${badge}</span>` : ''}
          ${count ? `<span style="font-size:13px;color:var(--ink-3);font-variant-numeric:tabular-nums">${count}</span>` : ''}
        </div>`;
}

function group(label, items, { collapsible = true } = {}) {
  return `<div style="display:flex;flex-direction:column;gap:2px;padding:14px 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;height:26px;padding:0 11px">
          <span style="font-size:13px;font-weight:500;color:var(--ink-3);letter-spacing:-0.005em">${label}</span>
          ${collapsible ? ic('chevUp', 15, 'var(--ink-3)') : ''}
        </div>
        ${items.join('\n        ')}
      </div>`;
}

/**
 * The redesigned sidebar. Two deliberate changes from today's build:
 *  - six flat destinations become three labelled groups, so the list reads
 *    as a hierarchy rather than a pile;
 *  - "Invoices" points at a real invoice list; creating one is the header's
 *    primary button, not a nav destination that silently means /invoices/create.
 */
export function sidebar(active) {
  const is = (k) => k === active;
  return `<div style="width:${W}px;flex-shrink:0;display:flex;flex-direction:column;background:var(--canvas);border-right:1px solid var(--line)">

    <div style="display:flex;align-items:center;gap:11px;padding:16px 16px;border-bottom:1px solid var(--line)">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex-shrink:0;border-radius:11px;background:var(--blue);color:#fff;font-size:16px;font-weight:600">I</span>
      <span style="display:flex;flex-direction:column;min-width:0;flex:1">
        <span style="font-size:14.5px;font-weight:600;color:var(--ink);letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Sundar Consulting</span>
        <span style="font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">3 brands · Free plan</span>
      </span>
      ${ic('panel', 19, 'var(--ink-2)')}
    </div>

    <div style="padding:14px 12px 0">
      <div style="display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:11px;background:var(--field)">
        ${ic('search', 17, 'var(--ink-3)')}
        <span style="flex:1;font-size:14.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Search</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--surface);border:1px solid var(--line);font-size:12px;color:var(--ink-2)">/</span>
      </div>
    </div>

    ${group('Essentials', [
      navItem('dashboard', 'Dashboard', { active: is('dashboard') }),
      navItem('bell', 'Follow-ups', { active: is('followups'), badge: '3' }),
    ])}
    <div style="height:1px;background:var(--line);margin:0 0"></div>
    ${group('Work', [
      navItem('file', 'Invoices', { active: is('invoices'), count: '42' }),
      navItem('building', 'Brands', { active: is('brands'), count: '3' }),
      navItem('users', 'Clients', { active: is('clients'), count: '18' }),
    ])}
    <div style="height:1px;background:var(--line)"></div>
    ${group('Measure', [navItem('chart', 'Reports', { active: is('reports') })])}

    <div style="flex:1"></div>

    <div style="padding:0 12px 12px">
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-card)">
        <div style="height:78px;position:relative;background:
            radial-gradient(120% 140% at 12% 20%, oklch(0.86 0.09 235) 0%, transparent 55%),
            radial-gradient(120% 140% at 82% 12%, oklch(0.93 0.10 92) 0%, transparent 58%),
            radial-gradient(140% 160% at 60% 100%, oklch(0.90 0.07 30) 0%, transparent 60%),
            oklch(0.94 0.03 250)">
          <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 14px;border-radius:9px;background:var(--ink);color:#fff;font-size:13px;font-weight:500;box-shadow:0 2px 6px rgb(0 0 0 / 0.2)">Add details</span>
        </div>
        <div style="padding:13px 14px 14px">
          <div style="font-size:14.5px;font-weight:600;color:var(--ink);letter-spacing:-0.01em">Finish setup</div>
          <div style="font-size:12.5px;line-height:1.45;color:var(--ink-2);margin-top:3px">Add bank details so your PDFs are payable.</div>
          <div style="display:flex;align-items:center;gap:9px;margin-top:11px">
            <svg width="17" height="17" viewBox="0 0 20 20" style="flex-shrink:0"><circle cx="10" cy="10" r="8" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="10" cy="10" r="8" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linecap="round" stroke-dasharray="50.3" stroke-dashoffset="25.1" transform="rotate(-90 10 10)"/></svg>
            <span style="font-size:12.5px;color:var(--ink-2);font-variant-numeric:tabular-nums;flex:1">2 of 4</span>
            <span style="font-size:12.5px;color:var(--ink-3)">Skip</span>
            <span style="display:inline-flex;align-items:center;height:26px;padding:0 11px;border-radius:8px;background:var(--field);font-size:12.5px;font-weight:500;color:var(--ink)">Next</span>
          </div>
        </div>
      </div>
    </div>

    <div style="padding:0 12px 12px;display:flex;flex-direction:column;gap:2px">
      ${navItem('sun', 'Appearance')}
      ${navItem('help', 'Help &amp; support')}
      <div style="display:flex;align-items:center;gap:11px;padding:8px 11px 0">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;flex-shrink:0;border-radius:999px;background:var(--field);border:1px solid var(--line);font-size:12.5px;font-weight:600;color:var(--ink-2)">SS</span>
        <span style="display:flex;flex-direction:column;min-width:0;flex:1">
          <span style="font-size:14px;font-weight:500;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Sivan Sundar</span>
          <span style="font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Plan &amp; billing</span>
        </span>
      </div>
    </div>
  </div>`;
}

/** Page top bar: icon + title left, actions right, hairline underneath. */
export function topbar(icon, title, actions) {
  return `<div style="display:flex;align-items:center;gap:13px;padding:20px 32px;border-bottom:1px solid var(--line);flex-shrink:0">
      ${ic(icon, 24, 'var(--ink)', 1.9)}
      <h1 style="margin:0;font-size:26px;font-weight:600;letter-spacing:-0.022em;color:var(--ink)">${title}</h1>
      <div style="flex:1"></div>
      ${actions}
    </div>`;
}

/** Standard right-hand action cluster: notifications, export, primary. */
export function topbarActions(primaryLabel = 'New invoice') {
  return `<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card)">
        ${ic('bell', 17, 'var(--ink-2)')}
        <span style="position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:999px;background:var(--blue);border:1.5px solid var(--surface)"></span>
      </span>
      ${btnOutline('Export', 'share')}
      ${btnPrimary(primaryLabel, 'plus')}`;
}

/** Segmented control — active segment is a white pill on the canvas grey. */
export function segmented(items, activeIndex) {
  return `<div style="display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:11px;background:var(--field)">
      ${items
        .map((label, i) => {
          const dot = label.dot;
          const text = label.label ?? label;
          return `<span style="display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:9px;font-size:14px;font-weight:500;white-space:nowrap;${
            i === activeIndex ? 'background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgb(0 0 0 / 0.06)' : 'color:var(--ink-2)'
          }">${text}${dot ? `<span style="width:7px;height:7px;border-radius:999px;background:${dot}"></span>` : ''}</span>`;
        })
        .join('\n      ')}
    </div>`;
}

/** Wraps a screen body in the full document + shell chrome. */
export function screen({ nav, icon, title, actions, body, width = 1440, height, accentDefault = 'oklch(0.52 0.16 258)' }) {
  return { nav, icon, title, actions, body, width, height, accentDefault };
}

export { W as SIDEBAR_W };
