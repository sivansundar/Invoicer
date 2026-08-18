import { ic, icRaw, statusPill } from './lib.mjs';

function tick(text) {
  return `<div style="display:flex;align-items:center;gap:10px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex-shrink:0;border-radius:999px;background:var(--ink);">${ic('check', 12, '#fff', 3)}</span>
        <span style="font-size:14.5px;color:var(--ink-2)">${text}</span>
      </div>`;
}

function field(label, value, { placeholder = false, hint = null } = {}) {
  return `<div style="display:flex;flex-direction:column;gap:7px">
        <label style="font-size:13.5px;font-weight:500;color:var(--ink)">${label}</label>
        <div style="display:flex;align-items:center;height:44px;padding:0 14px;border-radius:11px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-card);font-size:14.5px;color:${placeholder ? 'var(--ink-3)' : 'var(--ink)'}">${value}</div>
        ${hint ? `<span style="font-size:12.5px;color:var(--ink-3)">${hint}</span>` : ''}
      </div>`;
}

export function loginBody() {
  return `
  <!-- LEFT: the callout -->
  <div style="flex:1 1 50%;min-width:0;position:relative;overflow:hidden;display:flex;flex-direction:column;padding:44px 56px;
      background:
        radial-gradient(90% 80% at 8% 6%, oklch(0.88 0.075 235) 0%, transparent 58%),
        radial-gradient(85% 75% at 96% 4%, oklch(0.94 0.085 92) 0%, transparent 60%),
        radial-gradient(110% 95% at 78% 100%, oklch(0.90 0.065 26) 0%, transparent 62%),
        radial-gradient(100% 90% at 20% 92%, oklch(0.91 0.055 300) 0%, transparent 60%),
        oklch(0.955 0.02 250)">

    <!-- fine dot texture, the same grain the reference uses on its gradient cards -->
    <div style="position:absolute;inset:0;pointer-events:none;opacity:0.28;
        background-image:radial-gradient(oklch(1 0 0) 1px, transparent 1px);background-size:5px 5px"></div>

    <div style="position:relative;display:flex;align-items:center;gap:11px">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:var(--ink);color:#fff;font-size:16px;font-weight:600">I</span>
      <span style="font-size:17px;font-weight:600;letter-spacing:-0.015em;color:var(--ink)">Invoicer</span>
    </div>

    <div style="position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;max-width:520px">
      <h2 style="margin:0;font-size:54px;line-height:1.04;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);color:var(--ink);text-wrap:pretty">Bill under every name you work as.</h2>
      <p style="margin:20px 0 0;font-size:16.5px;line-height:1.55;color:var(--ink-2);max-width:440px;text-wrap:pretty">
        Keep each business separate — its own logo, GST number, bank details and invoice series — and run them all from one dashboard.
      </p>

      <div style="display:flex;flex-direction:column;gap:13px;margin-top:32px">
        ${tick('A frozen brand snapshot on every invoice')}
        ${tick('Print-ready PDFs with your bank details')}
        ${tick('Reminders that chase late payers for you')}
      </div>

      <!-- Product-vocabulary proof, not a stock testimonial -->
      <div style="margin-top:40px;max-width:392px;background:var(--surface);border:1px solid oklch(1 0 0 / 0.7);border-radius:15px;box-shadow:0 10px 28px oklch(0.19 0.02 250 / 0.10), 0 2px 6px oklch(0.19 0.02 250 / 0.06);padding:17px 19px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:9px;height:9px;border-radius:999px;background:var(--blue);flex-shrink:0"></span>
          <span style="font-size:13.5px;color:var(--ink-2)">Sundar Consulting</span>
          <span style="flex:1"></span>
          ${statusPill('Paid')}
        </div>
        <div style="display:flex;align-items:flex-end;gap:12px;margin-top:14px">
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-mono);font-size:13px;color:var(--ink-3)">SC-2026-041</div>
            <div style="font-size:26px;font-weight:600;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;color:var(--ink);margin-top:3px">₹1,20,000</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12.5px;color:var(--ink-3)">Settled in</div>
            <div style="font-size:14.5px;font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums;margin-top:2px">11 days</div>
          </div>
        </div>
      </div>
    </div>

    <div style="position:relative;font-size:13px;color:var(--ink-3)">Your data lives in your own account, in Postgres.</div>
  </div>

  <!-- RIGHT: sign in -->
  <div style="flex:1 1 50%;min-width:0;background:var(--canvas);border-left:1px solid var(--line);display:flex;flex-direction:column;padding:44px 56px">

    <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
      <span style="font-size:13.5px;color:var(--ink-3)">New here? The same button makes your account.</span>
    </div>

    <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
      <div style="width:100%;max-width:396px;margin:0 auto">

        <h1 style="margin:0;font-size:36px;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);color:var(--ink)">Sign in</h1>
        <p style="margin:9px 0 0;font-size:15px;line-height:1.5;color:var(--ink-2)">One click with Google, or a link in your inbox. No password to remember.</p>

        <!-- Fastest path first -->
        <button style="display:flex;align-items:center;justify-content:center;gap:11px;width:100%;height:48px;margin-top:28px;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-card);font-family:inherit;font-size:15px;font-weight:500;color:var(--ink)">
          ${icRaw('google', 19)}Continue with Google
        </button>

        <div style="display:flex;align-items:center;gap:14px;margin:22px 0">
          <span style="flex:1;height:1px;background:var(--line)"></span>
          <span style="font-size:12.5px;color:var(--ink-3)">or use email</span>
          <span style="flex:1;height:1px;background:var(--line)"></span>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          ${field('Email', 'you@example.com', { placeholder: true })}
          <button style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:48px;border:0;border-radius:12px;background:var(--blue);color:#fff;font-family:inherit;font-size:15px;font-weight:500;box-shadow:0 1px 2px rgb(0 0 0 / 0.12)">
            ${ic('mail', 18, '#fff', 2)}Email me a sign-in link
          </button>
        </div>

        <div style="display:flex;align-items:flex-start;gap:9px;margin-top:18px;padding:13px 15px;border-radius:12px;background:var(--surface);border:1px solid var(--line)">
          ${ic('clock', 16, 'var(--ink-3)')}
          <span style="font-size:13px;line-height:1.5;color:var(--ink-2)">The link is good for one hour and signs you in on this device. Signing in on your phone? Open the email there instead.</span>
        </div>

        <p style="margin:24px 0 0;font-size:12.5px;line-height:1.55;color:var(--ink-3);text-align:center">
          By continuing you agree to the <a href="#" style="text-decoration:underline;text-underline-offset:2px">Terms</a> and <a href="#" style="text-decoration:underline;text-underline-offset:2px">Privacy Policy</a>.
        </p>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:center;gap:7px;font-size:13px;color:var(--ink-3)">
      ${ic('help', 15, 'var(--ink-3)')}Trouble signing in?
    </div>
  </div>`;
}
