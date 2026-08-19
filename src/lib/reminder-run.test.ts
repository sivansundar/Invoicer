import { describe, expect, it, vi } from "vitest";
import { runReminderSweep, type ClaimedSlot, type ReminderStore, type SweepCandidate } from "./reminder-run";
import type { ReminderSchedule, SentReminder } from "./reminder-stages";
import { makeInvoice } from "@/test/factories";

const identity = { fromEmail: "notifications@invoicer.app" };
const TODAY = new Date("2026-09-18T09:00");

function schedule(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return {
    enabled: true,
    repeatFinalEveryDays: 0,
    stages: [
      { stage: "nudge", enabled: true, offsetDays: 3, templateId: "t1" },
      { stage: "followup", enabled: true, offsetDays: 10, templateId: "t2" },
      { stage: "final", enabled: true, offsetDays: 21, templateId: "t3" },
    ],
    ...overrides,
  };
}

function candidate(overrides: Partial<SweepCandidate> = {}): SweepCandidate {
  return {
    orgId: "org-1",
    brandId: "b1",
    brandName: "Sundar Consulting",
    brandEmail: "hello@sundar.co",
    invoice: makeInvoice({
      id: "inv-1",
      dueDate: "2026-07-20",
      status: "sent",
      client: { companyName: "Kestrel", address: "", email: "ap@kestrel.com" },
    }),
    schedule: schedule(),
    templates: {
      t1: { id: "t1", subject: "Nudge {{invoice}}", body: "Hi {{client}}" },
      t2: { id: "t2", subject: "Follow up {{invoice}}", body: "Hi {{client}}" },
      t3: { id: "t3", subject: "Final {{invoice}}", body: "Hi {{client}}" },
    },
    ...overrides,
  };
}

interface FakeOptions {
  candidates?: SweepCandidate[];
  prior?: Record<string, (SentReminder & { messageId: string | null })[]>;
  claimResult?: ClaimedSlot | null;
  suppressed?: string[];
}

function fakeStore(options: FakeOptions = {}) {
  const calls: string[] = [];
  const claims: Parameters<ReminderStore["claim"]>[0][] = [];
  const sent: { id: string; providerMessageId: string; rfcMessageId: string }[] = [];
  const failed: { id: string; detail: string }[] = [];
  const blocked: { id: string; detail: string }[] = [];

  const store: ReminderStore = {
    async candidates() {
      calls.push("candidates");
      return options.candidates ?? [candidate()];
    },
    async priorSends(invoiceId) {
      calls.push("priorSends");
      return options.prior?.[invoiceId] ?? [];
    },
    async claim(args) {
      calls.push("claim");
      claims.push(args);
      if (options.claimResult === null) return null;
      return options.claimResult ?? { id: "send-1", status: "queued", error: null };
    },
    async markSent(id, providerMessageId, rfcMessageId) {
      calls.push("markSent");
      sent.push({ id, providerMessageId, rfcMessageId });
    },
    async markFailed(id, detail) {
      calls.push("markFailed");
      failed.push({ id, detail });
    },
    async markBlocked(id, detail) {
      calls.push("markBlocked");
      blocked.push({ id, detail });
    },
    async isSuppressed(email) {
      calls.push("isSuppressed");
      return (options.suppressed ?? []).includes(email);
    },
  };

  return { store, calls, claims, sent, failed, blocked };
}

const okFetch = () =>
  vi.fn(
    async () => new Response(JSON.stringify({ id: "resend-1" }), { status: 200 })
  ) as unknown as typeof fetch;

describe("runReminderSweep", () => {
  it("sends the owed stage and records the outcome", async () => {
    const fake = fakeStore();
    const report = await runReminderSweep({
      store: fake.store,
      identity,
      apiKey: "re_test",
      today: TODAY,
      fetchImpl: okFetch(),
    });

    expect(report).toMatchObject({ considered: 1, sent: 1, failed: 0, blocked: 0 });
    expect(fake.claims[0]).toMatchObject({ stage: "final", ordinal: 1, templateId: "t3" });
    expect(fake.sent[0]!.providerMessageId).toBe("resend-1");
  });

  /**
   * The ordering the whole design rests on. Claiming after sending would let
   * a crash between the two resend the same chase on the next run; claiming
   * before means the worst case is a row that never completes, which is
   * visible and fixable.
   */
  it("claims the slot before contacting the provider", async () => {
    const fake = fakeStore();
    await runReminderSweep({
      store: fake.store,
      identity,
      apiKey: "re_test",
      today: TODAY,
      fetchImpl: okFetch(),
    });
    expect(fake.calls.indexOf("claim")).toBeLessThan(fake.calls.indexOf("markSent"));
  });

  it("stores the Message-ID that matches the row holding it", async () => {
    const fake = fakeStore({ claimResult: { id: "row-abc", status: "queued", error: null } });
    await runReminderSweep({
      store: fake.store,
      identity,
      apiKey: "re_test",
      today: TODAY,
      fetchImpl: okFetch(),
    });
    expect(fake.sent[0]!.rfcMessageId).toBe("<reminder.row-abc@invoicer.app>");
  });

  it("threads onto earlier reminders", async () => {
    const fetchImpl = okFetch();
    const fake = fakeStore({
      prior: {
        "inv-1": [
          { stage: "nudge", ordinal: 1, sentOn: "2026-07-23", messageId: "<reminder.one@invoicer.app>" },
          { stage: "followup", ordinal: 1, sentOn: "2026-07-30", messageId: "<reminder.two@invoicer.app>" },
        ],
      },
    });
    await runReminderSweep({
      store: fake.store,
      identity,
      apiKey: "re_test",
      today: TODAY,
      fetchImpl,
    });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.headers["In-Reply-To"]).toBe("<reminder.two@invoicer.app>");
  });

  it("does nothing when no stage is owed", async () => {
    const fake = fakeStore({ candidates: [candidate({ invoice: makeInvoice({ id: "inv-1", dueDate: "2026-09-17", status: "sent", client: { companyName: "K", address: "", email: "a@b.com" } }) })] });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl: okFetch(),
    });
    expect(report).toMatchObject({ considered: 1, sent: 0, skipped: 1 });
    expect(fake.claims).toHaveLength(0);
  });

  /**
   * A refusal must not cost a slot. If it did, a brand with no reply-to would
   * burn its nudge slot on the first run and could never send that stage once
   * the address was filled in.
   */
  it("does not claim a slot for a reminder it cannot compose", async () => {
    const fake = fakeStore({ candidates: [candidate({ brandEmail: null })] });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl: okFetch(),
    });
    expect(fake.claims).toHaveLength(0);
    expect(report.skipped).toBe(1);
    expect(report.reasons.no_reply_to).toBe(1);
  });

  it("skips a stage whose template has been deleted", async () => {
    const fake = fakeStore({ candidates: [candidate({ templates: {} })] });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl: okFetch(),
    });
    expect(report.reasons.template_missing).toBe(1);
    expect(fake.claims).toHaveLength(0);
  });

  // Two runs racing is the constraint doing its job, not an error.
  it("moves on quietly when another run already holds the slot", async () => {
    const fake = fakeStore({ claimResult: null });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl: okFetch(),
    });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(report.reasons.already_claimed).toBe(1);
  });

  /**
   * The claim is read back rather than assumed: the quota trigger rewrites the
   * row to `blocked` on the way in, and acting on the status we asked for
   * instead of the one we got is exactly how a limit gets bypassed by the code
   * meant to respect it.
   */
  it("does not send when the quota trigger blocked the claim", async () => {
    const fetchImpl = okFetch();
    const fake = fakeStore({
      claimResult: { id: "row-1", status: "blocked", error: "Monthly email limit reached" },
    });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl,
    });
    expect(report.blocked).toBe(1);
    expect(report.sent).toBe(0);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("records a suppressed recipient against the invoice rather than silently skipping", async () => {
    const fetchImpl = okFetch();
    const fake = fakeStore({ suppressed: ["ap@kestrel.com"] });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl,
    });
    expect(report.blocked).toBe(1);
    expect(fake.blocked[0]!.detail).toContain("suppressed");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("marks a provider rejection failed and keeps going", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: "Invalid to field" }), { status: 422 })
    ) as unknown as typeof fetch;
    const fake = fakeStore({
      candidates: [candidate(), candidate({ invoice: makeInvoice({ id: "inv-2", dueDate: "2026-07-20", status: "sent", client: { companyName: "K", address: "", email: "b@c.com" } }) })],
    });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl,
    });
    expect(report).toMatchObject({ considered: 2, failed: 2 });
    expect(fake.failed[0]!.detail).toBe("Invalid to field");
  });

  /**
   * One unreachable provider must not end the run for everybody else — the
   * loop covers every overdue invoice in the system.
   */
  it("survives a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    const fake = fakeStore();
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl,
    });
    expect(report.failed).toBe(1);
    expect(report.reasons.send_transient).toBe(1);
  });

  it("stops at the per-run ceiling", async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      candidate({
        invoice: makeInvoice({
          id: `inv-${i}`,
          dueDate: "2026-07-20",
          status: "sent",
          client: { companyName: "K", address: "", email: `c${i}@x.com` },
        }),
      })
    );
    const fake = fakeStore({ candidates: many });
    const report = await runReminderSweep({
      store: fake.store, identity, apiKey: "re_test", today: TODAY, fetchImpl: okFetch(), maxPerRun: 2,
    });
    expect(report.sent).toBe(2);
    expect(report.reasons.run_limit_reached).toBe(1);
  });
});
