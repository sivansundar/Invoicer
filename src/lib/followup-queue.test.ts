import { describe, expect, it } from "vitest";
import { buildFollowupQueue } from "./followup-queue";
import type { Brand, FollowupConfig, Invoice } from "./types";

const weekly: FollowupConfig = {
  enabled: true,
  mode: "weekly",
  weekday: 2,
  time: "09:00",
  repeat: "week",
  templateId: "tpl-gentle-nudge",
  stopAfter: 4,
};

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "brand-1",
    name: "Sivan Studio",
    followup: weekly,
    ...overrides,
  } as Brand;
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoiceNumber: "SS-2026-001",
    brandId: "brand-1",
    status: "sent",
    dueDate: "2026-07-10",
    reminders: [],
    followupsPaused: false,
    client: { companyName: "Basecamp Ltd", address: "" },
    ...overrides,
  } as Invoice;
}

const today = new Date(2026, 6, 10); // 10 Jul 2026

describe("buildFollowupQueue", () => {
  it("includes a sent invoice with a live schedule", () => {
    const queue = buildFollowupQueue([makeInvoice()], [makeBrand()], today);
    expect(queue).toHaveLength(1);
    expect(queue[0].invoice.id).toBe("inv-1");
    expect(queue[0].brand.id).toBe("brand-1");
    expect(queue[0].reminderNumber).toBe(1);
  });

  it("includes an overdue invoice the same as a sent one", () => {
    const queue = buildFollowupQueue(
      [makeInvoice({ status: "overdue" })],
      [makeBrand()],
      today
    );
    expect(queue).toHaveLength(1);
  });

  it("excludes a draft invoice", () => {
    const queue = buildFollowupQueue([makeInvoice({ status: "draft" })], [makeBrand()], today);
    expect(queue).toHaveLength(0);
  });

  it("excludes a paid invoice", () => {
    const queue = buildFollowupQueue([makeInvoice({ status: "paid" })], [makeBrand()], today);
    expect(queue).toHaveLength(0);
  });

  it("excludes an invoice paused individually", () => {
    const queue = buildFollowupQueue(
      [makeInvoice({ followupsPaused: true })],
      [makeBrand()],
      today
    );
    expect(queue).toHaveLength(0);
  });

  it("excludes an invoice whose brand has follow-ups disabled", () => {
    const brand = makeBrand({ followup: { ...weekly, enabled: false } });
    const queue = buildFollowupQueue([makeInvoice()], [brand], today);
    expect(queue).toHaveLength(0);
  });

  it("survives an invoice with a missing due date rather than crashing the page", () => {
    const queue = buildFollowupQueue(
      [makeInvoice({ dueDate: "" }), makeInvoice({ id: "inv-2", dueDate: "2026-07-11" })],
      [makeBrand()],
      today
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].invoice.id).toBe("inv-2");
  });

  it("survives an invoice whose brand was deleted, dropping it rather than throwing", () => {
    const queue = buildFollowupQueue(
      [makeInvoice({ brandId: "brand-missing" })],
      [makeBrand()],
      today
    );
    expect(queue).toHaveLength(0);
  });

  it("sorts ascending by scheduled date across multiple brands", () => {
    const brandA = makeBrand({ id: "brand-a", followup: { ...weekly, weekday: 2 } });
    const brandB = makeBrand({ id: "brand-b", followup: { ...weekly, weekday: 2 } });
    const invoiceLater = makeInvoice({
      id: "inv-later",
      brandId: "brand-a",
      dueDate: "2026-07-20",
    });
    const invoiceSooner = makeInvoice({
      id: "inv-sooner",
      brandId: "brand-b",
      dueDate: "2026-07-05",
    });
    const queue = buildFollowupQueue([invoiceLater, invoiceSooner], [brandA, brandB], today);
    expect(queue.map((entry) => entry.invoice.id)).toEqual(["inv-sooner", "inv-later"]);
  });

  /**
   * Rewritten for the stage model. It used to assert `sent + 1`, unbounded —
   * a fourth and fifth reminder were meaningful under a repeating cadence.
   * There are exactly three stages now, so the number is which stage comes
   * next, and two already sent means the final notice.
   */
  it("numbers the reminder by which stage comes next", () => {
    const brand = makeBrand();
    brand.followup = {
      ...brand.followup,
      enabled: true,
      stages: [
        { stage: "nudge", enabled: true, offsetDays: 3, templateId: "t1" },
        { stage: "followup", enabled: true, offsetDays: 10, templateId: "t2" },
        { stage: "final", enabled: true, offsetDays: 21, templateId: "t3" },
      ],
    };
    const inv = makeInvoice({ reminders: ["2026-06-01", "2026-06-08"] });
    const queue = buildFollowupQueue([inv], [brand], today);
    expect(queue[0].reminderNumber).toBe(3);
    expect(queue[0].stage).toBe("final");
  });

  /**
   * The behaviour change worth pinning: a brand carried over from the single
   * cadence has only its first stage configured, so once that has gone there
   * is nothing queued until somebody chooses templates for the other two.
   * Silence is correct — the alternative is inventing copy nobody wrote.
   */
  it("queues nothing further for a legacy brand once its one stage has sent", () => {
    const inv = makeInvoice({ reminders: ["2026-06-01"] });
    expect(buildFollowupQueue([inv], [makeBrand()], today)).toEqual([]);
  });

  it("returns an empty queue for no invoices", () => {
    expect(buildFollowupQueue([], [makeBrand()], today)).toEqual([]);
  });
});
