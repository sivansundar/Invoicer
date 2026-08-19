/**
 * `cadenceLabel`, `nextSendDate` and `timeLabel` were deleted along with the
 * weekly cadence, so the ~32 assertions covering them went too. That
 * behaviour is not untested — it is gone. What replaced it is covered in
 * `reminder-stages.test.ts`, against the stage walk that now decides every
 * send date in the app.
 */
import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  templateContext,
} from "./followups";
import type {  Invoice } from "./types";


function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    status: "sent",
    dueDate: "2026-07-10",
    reminders: [],
    followupsPaused: false,
    ...overrides,
  } as Invoice;
}

/**
 * Local "yyyy-MM-dd". Never use toISOString() here — the engine builds dates
 * at local midnight, and UTC conversion shifts the day backwards for any
 * timezone ahead of UTC (this repo's author is in IST, where it would).
 */

// Pinned close to `invoice()`'s default dueDate ("2026-07-10") so the naive
// "one step off the anchor" slot every test below expects is never itself in
// the past relative to `today` — these tests are about the base scheduling
// maths, not the roll-forward behaviour (covered in its own describe block).


describe("fillTemplate", () => {
  it("replaces known tokens", () => {
    expect(fillTemplate("Hi {{client}}", { client: "Priya" })).toBe("Hi Priya");
  });

  it("leaves unknown tokens in place", () => {
    expect(fillTemplate("Hi {{nobody}}", { client: "Priya" })).toBe("Hi {{nobody}}");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(fillTemplate("Hi {{ client }}", { client: "Priya" })).toBe("Hi Priya");
  });

  it("returns an empty string for empty input", () => {
    expect(fillTemplate("", {})).toBe("");
  });
});

describe("templateContext", () => {
  const inv = invoice({
    invoiceNumber: "SC-2026-012",
    total: 34000,
    currency: "INR",
    dueDate: "2026-07-02",
    client: { companyName: "Basecamp Ltd", name: "Aisha Khan", address: "" },
  } as Partial<Invoice>);

  it("prefers the contact name over the company name", () => {
    const ctx = templateContext(inv, "Sivan Studio", new Date(2026, 6, 28));
    expect(ctx.client).toBe("Aisha Khan");
    expect(ctx.company).toBe("Basecamp Ltd");
  });

  it("counts days late, never negative", () => {
    // dueDate is 2026-07-02; "today" of 2026-07-28 is exactly 26 days later.
    const ctx = templateContext(inv, "Sivan Studio", new Date(2026, 6, 28));
    expect(ctx.days_late).toBe("26");
    const early = templateContext(inv, "Sivan Studio", new Date(2026, 5, 1));
    expect(early.days_late).toBe("0");
  });

  it("includes the brand name and formatted amount", () => {
    const ctx = templateContext(inv, "Sivan Studio", new Date(2026, 6, 28));
    expect(ctx.brand).toBe("Sivan Studio");
    expect(ctx.amount).toContain("34,000");
  });

  it("degrades to safe placeholders rather than 'NaN'/'Invalid Date' for an unparseable due date", () => {
    // Reachable via imported/hand-edited data — import-export.tsx casts parsed
    // JSON straight to Invoice[] with no validation. A reminder subject built
    // from this must never render the literal strings "NaN" or "Invalid Date".
    const bad = invoice({ dueDate: "2026-13-45" } as Partial<Invoice>);
    const ctx = templateContext(bad, "Sivan Studio", new Date(2026, 6, 28));
    expect(ctx.days_late).toBe("0");
    expect(ctx.due_date).toBe("an unspecified date");
  });
});
