import { describe, expect, it } from "vitest";
import { dueLine, followupPillLabel, nextSendLine, resolveFollowupState } from "./invoice-detail";
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
});

describe("nextSendLine", () => {
  it("formats the scheduled slot with the configured time", () => {
    const state = resolveFollowupState(makeInvoice(), weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toMatch(/at 9:00 AM$/);
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

  it("reads the limit-reached line", () => {
    const inv = makeInvoice({ reminders: ["a", "b", "c", "d"] });
    const state = resolveFollowupState(inv, weekly, today);
    expect(nextSendLine(state, weekly, "Sivan Studio")).toBe(
      "Reminder limit reached — over to you now"
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
