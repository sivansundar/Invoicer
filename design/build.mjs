import { writeFileSync } from 'node:fs';
import { doc } from './doc.mjs';
import { dashboardBody } from './dashboard.mjs';
import { loginBody } from './login.mjs';
import { invoiceBody } from './invoice.mjs';
import { newInvoiceBody } from './newinvoice.mjs';
import { brandsBody, clientsBody } from './screens2.mjs';
import { followupsBody, reportsBody } from './screens3.mjs';
import { componentsBody } from './components.mjs';
import { followupsBrandBody } from './followups-brand.mjs';
import { typeBody } from './type.mjs';

const S = [
  { file: 'Main.dc.html',       title: 'Dashboard',      body: dashboardBody(),  w: 1440, h: 1420, page: 'page-1', x: 0,    y: 0 },
  { file: 'Login.dc.html',      title: 'Login',          body: loginBody(),      w: 1440, h: 900,  page: 'page-1', x: 1540, y: 0 },
  { file: 'Invoice.dc.html',    title: 'Invoice detail', body: invoiceBody(),    w: 1440, h: 1200, page: 'page-1', x: 3080, y: 0 },
  { file: 'NewInvoice.dc.html', title: 'New invoice',    body: newInvoiceBody(), w: 1440, h: 1405, page: 'page-1', x: 4620, y: 0 },

  { file: 'Brands.dc.html',     title: 'Brands',         body: brandsBody(),     w: 1440, h: 895,  page: 'page-2', x: 0,    y: 0 },
  { file: 'Clients.dc.html',    title: 'Clients',        body: clientsBody(),    w: 1440, h: 895,  page: 'page-2', x: 1540, y: 0 },
  { file: 'Followups.dc.html',  title: 'Follow-ups',     body: followupsBody(),  w: 1440, h: 1320, page: 'page-2', x: 3080, y: 0 },
  { file: 'FollowupsBrand.dc.html', title: 'Follow-ups — per brand', body: followupsBrandBody(), w: 1440, h: 1375, page: 'page-2', x: 6160, y: 0 },
  { file: 'Reports.dc.html',    title: 'Reports',        body: reportsBody(),    w: 1440, h: 1465, page: 'page-2', x: 4620, y: 0 },

  { file: 'Type.dc.html',       title: 'Type directions', body: typeBody(),      w: 1560, h: 1180, page: 'page-3', x: 0,    y: 0, column: true, allFonts: true },
  { file: 'Components.dc.html', title: 'Design system',  body: componentsBody(), w: 1240, h: 2145, page: 'page-3', x: 1660, y: 0, column: true },
];

for (const s of S) {
  writeFileSync(
    s.file,
    doc({ body: s.body, width: s.w, height: s.h, root: s.column ? 'flex-direction: column;' : '', allFonts: !!s.allFonts })
  );
}

const note = (id, page, x, y, w, text) => ({ id, page, x, y, w, text });

const canvas = {
  pages: [
    { id: 'page-1', name: 'Core screens' },
    { id: 'page-2', name: 'Manage' },
    { id: 'page-3', name: 'System & before' },
  ],
  artboards: [
    ...S.map(({ file, title, x, y, w, h, page }) => ({ file, title, x, y, w, h, page })),
    { file: 'Today.dc.html', title: 'Before — today’s dashboard', x: 3000, y: 0, w: 1440, h: 1100, page: 'page-3' },
  ],
  annotations: [
    note('brief', 'page-1', 0, -300, 620,
      'INVOICER — REDESIGN\n\nTaken from the reference: a warm-grey canvas with white cards floating on it, grouped sidebar nav with a white active pill, colored icon tiles, and metrics that always name what they are compared against.\n\nKept from the current build: Geist + Geist Mono, and the existing screen structure — nothing was moved that did not need moving.'),
    note('ux-dashboard', 'page-1', 700, -300, 700,
      'UX — the top row is now ACTIONS, not stats.\n\nToday the dashboard opens with four numbers you cannot act on. Here the first thing you see is the three things needing you, each with one button: chase the overdue, send the draft, view what is outstanding. The vanity metrics move down to a Performance strip, where they carry their comparison baseline so a number means something.\n\nAlso: "Mark paid" and "Chase" are on the table row, so the common case never requires opening the invoice.'),
    note('ux-login', 'page-1', 1540, -300, 620,
      'LOGIN — half and half, as asked.\n\nLeft is the callout: the product’s actual promise (billing under more than one name) with a real invoice card as proof rather than a stock testimonial.\n\nRight is auth. UX change: Google moved ABOVE the magic link — it is one click versus leaving the app for your inbox. The "new here?" line removes the usual sign-in / sign-up fork; the same button does both.'),
    note('ux-invoice', 'page-1', 3080, -300, 620,
      'INVOICE DETAIL\n\nThe one thing to do is at the top with the button on it. Lifecycle, follow-up history and the PDF preview move to a right rail, so the left column stays a document you can read top to bottom.\n\nThe follow-up card shows what already went out and what goes next — today you have to reason about that from a schedule elsewhere.'),
    note('ux-newinvoice', 'page-1', 4620, -300, 660,
      'NEW INVOICE — the biggest UX change.\n\nOne screen, no wizard. Brand is a click, not a dropdown. Terms are a segmented control and the due date derives itself. Recent clients are chips, so the common case is one tap.\n\nAnd one button: "Send invoice" creates it, emails the PDF, marks it Sent and starts the reminder schedule. Today those are four separate decisions.'),
    note('ux-brand-history', 'page-2', 6160, -300, 640,
      'NEW — FOLLOW-UPS PER BRAND.\n\nReached from the "View all 38 sent" button on each brand\'s schedule card. It answers three questions in one place: what has already gone out, what is queued next, and whether any of it works.\n\nEverything sent is grouped by month, and each row carries its OUTCOME — paid two days later, opened but not paid, no reply — because a reminder log without outcomes is just noise. "Which nudge works" turns that into the actionable number: most invoices settle after the second nudge, so it is worth moving earlier.'),
    note('ux-manage', 'page-2', 0, -260, 700,
      'MANAGE\n\nBrands keeps the card grid but each card now earns its space — collected vs outstanding, collection rate, and which schedule is running. The two cards on the second row are prompts, not decoration: one of them is a real gap (a brand with no bank details, so its PDFs have nowhere to pay).\n\nClients moves from a card grid to a table — 18 clients compared side by side is a table job. "Avg days to pay" is new and is the number that actually predicts trouble.\n\nFollow-ups leads with what goes out today and lets you hold or send from the queue. Reports groups by currency first, which is how multi-currency books are actually read.'),
    note('ux-type', 'page-3', 0, -300, 620,
      'PICK A TYPE DIRECTION.\n\nGeist read as vanilla, so here are three, each applied to the same fragments — title, headline number, dense table row, and a stack of figures that has to align.\n\nAll three are on Google Fonts. The screens are currently drawn in the first one; switching is a single line, and nothing else in the system moves.'),
    note('ux-system', 'page-3', 1660, -300, 560,
      'The system sheet is the handover: every colour, size and radius the screens use, in oklch, ready to replace the neutral ramp in globals.css.\n\nThe categorical order — blue, amber, violet, green — is not a taste call: it was run through a colour-vision and contrast validator, and amber was re-stepped darker to clear 3:1 against white.'),
    note('ux-before', 'page-3', 3000, -260, 480,
      'Today’s dashboard, rebuilt from the real values in globals.css and the shipped components, so the before/after is honest rather than remembered.'),
  ],
  launch: { view: 'canvas', page: 'page-1' },
};

writeFileSync('canvas.json', JSON.stringify(canvas, null, 2));
console.log('wrote', S.length + 1, 'artboards + canvas.json');
