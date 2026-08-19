import { describe, expect, it } from "vitest";
import { canMarkSent, dueLine, followupPillLabel, nextSendLine, resolveFollowupState } from "./invoice-detail";
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

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    invoiceNumber: "SC-2026-001",
    status: "sent",
    dueDate: "2026-07-10",
    reminders: [],
    followupsPaused: false,
    ...overrides,
  } as Invoice;
}

const today = new Date(2026, 6, 10); // 10 Jul 2026

describe("dueLine", () => {
  it("reads a settled line for a paid invoice", () => {
    expect(dueLine(makeInvoice({ status: "paid" }), 0, today)).toEqual({
      text: "Paid and settled — nothing to chase",
      destructive: false,
    });
  });

  it("reads a not-sent line for a draft", () => {
    expect(dueLine(makeInvoice({ status: "draft" }), 0, today)).toEqual({
      text: "Draft — not sent to the client yet",
      destructive: false,
    });
  });

  it("singularizes one day overdue", () => {
    expect(dueLine(makeInvoice({ status: "overdue" }), 1, today)).toEqual({
      text: "1 day overdue — a friendly nudge might help",
      destructive: true,
    });
  });

  it("pluralizes several days overdue and marks it destructive", () => {
    expect(dueLine(makeInvoice({ status: "overdue" }), 5, today)).toEqual({
      text: "5 days overdue — a friendly nudge might help",
      destructive: true,
    });
  });

  it("counts down to a future due date for a sent invoice", () => {
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "2026-07-13" }), 0, today)).toEqual({
      text: "Due in 3 days",
      destructive: false,
    });
  });

  it("singularizes a one-day countdown", () => {
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "2026-07-11" }), 0, today)).toEqual({
      text: "Due in 1 day",
      destructive: false,
    });
  });

  it("marks a sent invoice destructive-overdue once daysLateCount is positive, not just a literal 'overdue' status", () => {
    // Nothing this app writes ever stores status "overdue" (see
    // dashboard.ts's effectiveStatus) — this is the real-world shape a late
    // invoice actually arrives in: status stays "sent", and daysLate (passed
    // in by the caller) is what tells this line to go destructive.
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "2026-06-01" }), 39, today)).toEqual({
      text: "39 days overdue — a friendly nudge might help",
      destructive: true,
    });
  });

  it("reads Past due once a sent invoice's due date has passed", () => {
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "2026-07-01" }), 0, today)).toEqual({
      text: "Past due",
      destructive: false,
    });
  });

  it("reads Past due on the due date itself", () => {
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "2026-07-10" }), 0, today)).toEqual({
      text: "Past due",
      destructive: false,
    });
  });

  it("falls back gracefully for a sent invoice with no due date set", () => {
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "" }), 0, today)).toEqual({
      text: "Due date not set",
      destructive: false,
    });
  });

  it("reads an honest unreadable line for a malformed due date, rather than a false Past due", () => {
    expect(dueLine(makeInvoice({ status: "sent", dueDate: "not-a-date" }), 0, today)).toEqual({
      text: "Due date unreadable",
      destructive: false,
    });
  });
});

describe("resolveFollowupState", () => {
  it("is active when a send is scheduled", () => {
    const state = resolveFollowupState(makeInvoice(), weekly, today);
    expect(state.kind).toBe("active");
    expect(state.date).not.toBeNull();
  });

  it("reads paid over every other reason, even when also disabled", () => {
    const state = resolveFollowupState(
      makeInvoice({ status: "paid" }),
      { ...weekly, enabled: false },
      today
    );
    expect(state.kind).toBe("paid");
  });

  it("reads draft when the invoice hasn't been sent", () => {
    const state = resolveFollowupState(makeInvoice({ status: "draft" }), weekly, today);
    expect(state.kind).toBe("draft");
  });

  it("reads paused when the invoice is individually paused", () => {
    const state = resolveFollowupState(makeInvoice({ followupsPaused: true }), weekly, today);
    expect(state.kind).toBe("paused");
  });

  it("reads limit once the reminder cap is hit", () => {
    const inv = makeInvoice({ reminders: ["a", "b", "c", "d"] });
    expect(resolveFollowupState(inv, weekly, today).kind).toBe("limit");
  });

  it("reads off when the brand's follow-ups are disabled and nothing else applies", () => {
    const state = resolveFollowupState(makeInvoice(), { ...weekly, enabled: false }, today);
    expect(state.kind).toBe("off");
  });

  it("degrades to a sane, non-throwing state for a sent invoice with no due date", () => {
    // The exact crashing combination from the fix-round report: status
    // "sent", empty dueDate, no reminders yet to anchor on instead. Before
    // nextSendDate's Invalid Date guard, this produced { kind: "active",
    // date: Invalid Date }, which nextSendLine's format() call then threw on.
    const inv = makeInvoice({ dueDate: "", reminders: [] });
    const state = resolveFollowupState(inv, weekly, today);
    expect(state.kind).not.toBe("active");
    expect(() => nextSendLine(state, weekly, "Sivan Studio")).not.toThrow();
  });
});

describe("nextSendLine", () => {
  /**
   * No time of day any more. A stage fires on a date and the hourly sweep
   * decides the hour, so promising "at 9:00 AM" would be a precision the
   * scheduler never offered. The line names the stage instead, which is the
   * thing a reader actually wants to know.
   */
  it("names the stage and the date it lands on", () => {
    const state = resolveFollowupState(makeInvoice(), weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toMatch(/^Gentle nudge on /);
    expect(nextSendLine(state, weekly, "Sivan Studio")).not.toMatch(/AM|PM/);
  });

  it("reads the paid line", () => {
    const state = resolveFollowupState(makeInvoice({ status: "paid" }), weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toBe("Stopped — this invoice is paid");
  });

  it("reads the draft line", () => {
    const state = resolveFollowupState(makeInvoice({ status: "draft" }), weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toBe("Starts once the invoice is sent");
  });

  it("reads the paused line", () => {
    const state = resolveFollowupState(makeInvoice({ followupsPaused: true }), weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toBe("Paused for this invoice");
  });

  /**
   * "Limit" used to mean a stopAfter cap. Under the stage model it means the
   * sequence has no move left — every stage has fired, or the ones that have
   * not have no template. Both read the same way to a user, and both make the
   * manual chase the obvious next step.
   */
  it("reads the sequence-finished line", () => {
    const inv = makeInvoice({ reminders: ["2026-06-01", "2026-06-08", "2026-06-15"] });
    const state = resolveFollowupState(inv, weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toBe(
      "The sequence is finished — over to you now"
    );
  });

  it("interpolates the brand name into the off line", () => {
    const config = { ...weekly, enabled: false };
    const state = resolveFollowupState(makeInvoice(), config, today);
    expect(nextSendLine(state, config, "Sivan Studio")).toBe(
      "Follow-ups are off for Sivan Studio"
    );
  });
});

describe("followupPillLabel", () => {
  it("returns null for active, letting the caller render the distinct Active pill", () => {
    const state = resolveFollowupState(makeInvoice(), weekly, today);
    expect(followupPillLabel(state)).toBeNull();
  });

  it("labels every non-active reason", () => {
    expect(followupPillLabel({ kind: "paid", date: null })).toBe("Stopped · paid");
    expect(followupPillLabel({ kind: "draft", date: null })).toBe("Not started");
    expect(followupPillLabel({ kind: "paused", date: null })).toBe("Paused");
    expect(followupPillLabel({ kind: "limit", date: null })).toBe("Limit reached");
    expect(followupPillLabel({ kind: "off", date: null })).toBe("Off for this brand");
  });
});

describe("canMarkSent", () => {
  it("refuses a draft with no due date", () => {
    expect(canMarkSent(makeInvoice({ status: "draft", dueDate: "" }))).toBe(false);
  });

  it("allows the transition once a due date is set", () => {
    expect(canMarkSent(makeInvoice({ status: "draft", dueDate: "2026-08-05" }))).toBe(true);
  });
});
