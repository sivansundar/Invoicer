import { describe, expect, it } from "vitest";
import {
  brandFollowupSummary,
  brandReminderHistory,
  groupEventsByMonth,
  outcomeLabel,
  recoveryByOrdinal,
} from "./followup-history";
import type { Invoice } from "./types";

function inv(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "1",
    invoiceNumber: "SC-2026-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-07-01",
    dueDate: "2026-07-15",
    client: { companyName: "Acme", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 1000,
    createdAt: "",
    updatedAt: "",
    brandSnapshot: {} as Invoice["brandSnapshot"],
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("brandReminderHistory", () => {
  it("returns one event per reminder, newest first", () => {
    const events = brandReminderHistory([
      inv({ id: "a", reminders: ["2026-07-20", "2026-07-27"] }),
      inv({ id: "b", reminders: ["2026-07-24"] }),
    ]);
    expect(events.map((e) => e.sentOn)).toEqual(["2026-07-27", "2026-07-24", "2026-07-20"]);
    expect(events.map((e) => e.ordinal)).toEqual([2, 1, 1]);
  });

  it("marks a reminder followed by another as escalated", () => {
    const [, older] = brandReminderHistory([
      inv({ reminders: ["2026-07-20", "2026-07-27"] }),
    ]);
    expect(older!.outcome).toBe("escalated");
    expect(outcomeLabel(older!)).toBe("Followed by reminder 2");
  });

  it("attributes payment to the last reminder before it", () => {
    const [latest] = brandReminderHistory([
      inv({ reminders: ["2026-07-20"], status: "paid", paidOn: "2026-07-23" }),
    ]);
    expect(latest!.outcome).toBe("paid");
    expect(latest!.daysToPayment).toBe(3);
    expect(outcomeLabel(latest!)).toBe("Paid 3 days later");
  });

  it("says same day rather than 0 days", () => {
    const [event] = brandReminderHistory([
      inv({ reminders: ["2026-07-20"], status: "paid", paidOn: "2026-07-20" }),
    ]);
    expect(outcomeLabel(event!)).toBe("Paid same day");
  });

  it("leaves the last reminder on an unpaid invoice pending", () => {
    const [event] = brandReminderHistory([inv({ reminders: ["2026-07-20"] })]);
    expect(event!.outcome).toBe("pending");
    expect(outcomeLabel(event!)).toBe("No reply yet");
  });

  // paidOn is never backfilled, so an invoice settled before it existed has no
  // known payment date. Claiming "paid same day" there would be a fabrication.
  it("reports an unknown date rather than guessing one", () => {
    const [event] = brandReminderHistory([
      inv({ reminders: ["2026-07-20"], status: "paid", paidOn: undefined }),
    ]);
    expect(event!.outcome).toBe("unknown");
    expect(outcomeLabel(event!)).toBe("Paid, date unknown");
  });

  it("does not throw on a reminder dated after payment", () => {
    const [event] = brandReminderHistory([
      inv({ reminders: ["2026-07-30"], status: "paid", paidOn: "2026-07-20" }),
    ]);
    expect(event!.outcome).toBe("unknown");
  });

  it("skips unparseable reminder dates", () => {
    const events = brandReminderHistory([inv({ reminders: ["nonsense", "2026-07-20"] })]);
    expect(events).toHaveLength(1);
    expect(events[0]!.ordinal).toBe(1);
  });

  it("ignores invoices that were never chased", () => {
    expect(brandReminderHistory([inv({ reminders: [] })])).toEqual([]);
  });
});

describe("groupEventsByMonth", () => {
  it("groups newest month first and totals what was recovered", () => {
    const events = brandReminderHistory([
      inv({ id: "a", total: 5000, reminders: ["2026-07-20"], status: "paid", paidOn: "2026-07-22" }),
      inv({ id: "b", total: 3000, reminders: ["2026-08-02"], status: "paid", paidOn: "2026-08-04" }),
    ]);
    const groups = groupEventsByMonth(events);
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2026-07"]);
    expect(groups[0]!.recovered).toEqual([{ currency: "INR", total: 3000 }]);
  });

  // Two reminders in one month for one invoice must not count the money twice.
  it("counts a recovered invoice once even with several reminders that month", () => {
    const events = brandReminderHistory([
      inv({
        id: "a",
        total: 5000,
        reminders: ["2026-07-10", "2026-07-20"],
        status: "paid",
        paidOn: "2026-07-22",
      }),
    ]);
    const [july] = groupEventsByMonth(events);
    expect(july!.recovered).toEqual([{ currency: "INR", total: 5000 }]);
  });
});

describe("brandFollowupSummary", () => {
  it("counts reminders, chased invoices and recoveries", () => {
    const summary = brandFollowupSummary([
      inv({ id: "a", total: 5000, reminders: ["2026-07-10", "2026-07-20"], status: "paid", paidOn: "2026-07-22" }),
      inv({ id: "b", total: 2000, reminders: ["2026-07-15"] }),
      inv({ id: "c", reminders: [] }),
    ]);
    expect(summary.remindersSent).toBe(3);
    expect(summary.invoicesChased).toBe(2);
    expect(summary.recoveredCount).toBe(1);
    expect(summary.recovered).toEqual([{ currency: "INR", total: 5000 }]);
    expect(summary.avgRemindersToPayment).toBe(2);
    expect(summary.stillUnanswered).toBe(1);
  });

  it("keeps currencies apart rather than summing across them", () => {
    const summary = brandFollowupSummary([
      inv({ id: "a", currency: "INR", total: 5000, reminders: ["2026-07-10"], status: "paid", paidOn: "2026-07-12" }),
      inv({ id: "b", currency: "USD", total: 400, reminders: ["2026-07-10"], status: "paid", paidOn: "2026-07-12" }),
    ]);
    expect(summary.recovered).toHaveLength(2);
    expect(summary.recovered.map((g) => g.currency).sort()).toEqual(["INR", "USD"]);
  });

  it("reports null rather than zero when nothing was recovered", () => {
    const summary = brandFollowupSummary([inv({ reminders: ["2026-07-10"] })]);
    expect(summary.avgRemindersToPayment).toBeNull();
    expect(summary.paysAfterNudgePct).toBeNull();
  });

  it("does not credit a payment that landed before any reminder", () => {
    const summary = brandFollowupSummary([
      inv({ reminders: ["2026-07-20"], status: "paid", paidOn: "2026-07-10" }),
    ]);
    expect(summary.recoveredCount).toBe(0);
    expect(summary.paysAfterNudgePct).toBe(0);
  });
});

describe("recoveryByOrdinal", () => {
  const chased = (id: string, reminders: string[], paidOn?: string) =>
    inv({ id, reminders, status: paidOn ? "paid" : "sent", paidOn });

  it("reports a rate per ordinal once the sample is big enough", () => {
    const rows = recoveryByOrdinal([
      chased("a", ["2026-07-01"], "2026-07-03"),
      chased("b", ["2026-07-01"], "2026-07-04"),
      chased("c", ["2026-07-01"]),
      chased("d", ["2026-07-01"]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ordinal: 1, sent: 4, recovered: 2, pct: 50 });
  });

  // A 100% rate off one invoice is noise, not a finding.
  it("withholds a rate below the minimum sample", () => {
    const rows = recoveryByOrdinal([chased("a", ["2026-07-01"], "2026-07-02")]);
    expect(rows[0]!.pct).toBeNull();
    expect(rows[0]!.recovered).toBe(1);
  });

  it("only credits payment inside the recovery window", () => {
    const rows = recoveryByOrdinal([
      chased("a", ["2026-07-01"], "2026-07-05"),
      chased("b", ["2026-07-01"], "2026-07-20"),
      chased("c", ["2026-07-01"]),
    ]);
    expect(rows[0]).toMatchObject({ sent: 3, recovered: 1 });
  });
});
