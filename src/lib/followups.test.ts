import { describe, expect, it } from "vitest";
import {
  cadenceLabel,
  fillTemplate,
  nextSendDate,
  templateContext,
  timeLabel,
} from "./followups";
import type { FollowupConfig, Invoice } from "./types";

const weekly: FollowupConfig = {
  enabled: true,
  mode: "weekly",
  weekday: 2,
  time: "09:00",
  repeat: "week",
  templateId: "tpl-gentle-nudge",
  stopAfter: 4,
};

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
function localDate(date: Date | null): string | null {
  if (!date) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

describe("nextSendDate", () => {
  it("schedules a week after the due date when nothing has been sent", () => {
    expect(localDate(nextSendDate(invoice(), weekly))).toBe("2026-07-17");
  });

  it("schedules a week after the last reminder", () => {
    const next = nextSendDate(invoice({ reminders: ["2026-07-17"] }), weekly);
    expect(localDate(next)).toBe("2026-07-24");
  });

  it("returns null when follow-ups are disabled for the brand", () => {
    expect(nextSendDate(invoice(), { ...weekly, enabled: false })).toBeNull();
  });

  it("returns null for a paid invoice", () => {
    expect(nextSendDate(invoice({ status: "paid" }), weekly)).toBeNull();
  });

  it("returns null for a draft invoice", () => {
    expect(nextSendDate(invoice({ status: "draft" }), weekly)).toBeNull();
  });

  it("returns null when the invoice is individually paused", () => {
    expect(nextSendDate(invoice({ followupsPaused: true }), weekly)).toBeNull();
  });

  it("returns null once the reminder cap is reached", () => {
    const inv = invoice({ reminders: ["a", "b", "c", "d"] });
    expect(nextSendDate(inv, { ...weekly, stopAfter: 4 })).toBeNull();
  });

  it("keeps scheduling when stopAfter is zero", () => {
    const inv = invoice({ reminders: ["2026-07-17", "2026-07-24"] });
    expect(nextSendDate(inv, { ...weekly, stopAfter: 0 })).not.toBeNull();
  });

  it("returns null rather than an Invalid Date for a sent invoice with no due date", () => {
    // Reachable via a draft (no due date required) marked sent directly, or
    // via imported/hand-edited data. `new Date("T00:00")` is an Invalid Date
    // — a truthy object — so this guards against it being returned as if a
    // real send were scheduled.
    const inv = invoice({ dueDate: "", reminders: [] });
    expect(nextSendDate(inv, weekly)).toBeNull();
  });

  it("returns null rather than an Invalid Date when the last reminder itself is unparseable", () => {
    const inv = invoice({ dueDate: "2026-07-10", reminders: [""] });
    expect(nextSendDate(inv, weekly)).toBeNull();
  });

  it("advances by a month when custom mode repeats monthly", () => {
    const config: FollowupConfig = { ...weekly, mode: "custom", repeat: "month", weekday: 1 };
    const next = nextSendDate(invoice(), config);
    expect(next!.getMonth()).toBe(7); // August
  });

  it("lands on the configured weekday in custom mode", () => {
    // dueDate 2026-07-10 is a Friday (day 5); a naive +7 day advance also
    // lands on Friday, so weekday: 5 here would make the snap a no-op and
    // pass even with the snap logic deleted. weekday: 3 (Wednesday) forces
    // a genuine 5-day forward snap, from Fri 17 Jul to Wed 22 Jul.
    const config: FollowupConfig = { ...weekly, mode: "custom", repeat: "week", weekday: 3 };
    const next = nextSendDate(invoice(), config);
    expect(next!.getDay()).toBe(3);
    expect(localDate(next)).toBe("2026-07-22");
  });

  it("clamps a 31 Jan anchor to 28 Feb rather than overflowing to 3 Mar", () => {
    // Feb 28 2026 is itself a Saturday (weekday: 6), so the subsequent
    // weekday snap is a no-op here — this test isolates the month-clamp
    // arithmetic from the weekday-snap arithmetic.
    const config: FollowupConfig = { ...weekly, mode: "custom", repeat: "month", weekday: 6 };
    const next = nextSendDate(invoice({ dueDate: "2026-01-31" }), config);
    expect(localDate(next)).toBe("2026-02-28");
  });

  it("clamps a 31 Mar anchor to 30 Apr rather than overflowing to 1 May", () => {
    // Apr 30 2026 is itself a Thursday (weekday: 4), so the subsequent
    // weekday snap is a no-op here too.
    const config: FollowupConfig = { ...weekly, mode: "custom", repeat: "month", weekday: 4 };
    const next = nextSendDate(invoice({ dueDate: "2026-03-31" }), config);
    expect(localDate(next)).toBe("2026-04-30");
  });
});

describe("timeLabel", () => {
  it("renders morning times", () => {
    expect(timeLabel("09:00")).toBe("9:00 AM");
  });

  it("renders afternoon times", () => {
    expect(timeLabel("14:30")).toBe("2:30 PM");
  });

  it("renders midnight as 12 AM", () => {
    expect(timeLabel("00:15")).toBe("12:15 AM");
  });
});

describe("cadenceLabel", () => {
  it("reports when follow-ups are off", () => {
    expect(cadenceLabel({ ...weekly, enabled: false })).toBe("Follow-ups off");
  });

  it("describes the weekly cadence", () => {
    expect(cadenceLabel(weekly)).toBe("Every week after the due date · 9:00 AM");
  });

  it("describes a custom weekly cadence", () => {
    expect(cadenceLabel({ ...weekly, mode: "custom", weekday: 1 })).toBe(
      "Every week on Monday · 9:00 AM"
    );
  });

  it("describes a custom monthly cadence", () => {
    expect(cadenceLabel({ ...weekly, mode: "custom", repeat: "month", weekday: 4 })).toBe(
      "Every month on Thursday · 9:00 AM"
    );
  });
});

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
