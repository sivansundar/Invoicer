import { describe, expect, it } from "vitest";
import {
  canChaseManually,
  DEFAULT_STAGE_OFFSETS,
  dueReminder,
  nextManualOrdinal,
  reminderSchedule,
  stageIsSendable,
  type ReminderSchedule,
  type SentReminder,
} from "./reminder-stages";
import { makeInvoice } from "@/test/factories";

const DUE = "2026-07-20";
const day = (iso: string) => new Date(`${iso}T09:00`);

function schedule(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return {
    enabled: true,
    repeatFinalEveryDays: 0,
    stages: [
      { stage: "nudge", enabled: true, offsetDays: 3, templateId: "t-nudge" },
      { stage: "followup", enabled: true, offsetDays: 10, templateId: "t-follow" },
      { stage: "final", enabled: true, offsetDays: 21, templateId: "t-final" },
    ],
    ...overrides,
  };
}

const invoice = (overrides = {}) => makeInvoice({ dueDate: DUE, status: "sent", ...overrides });

describe("reminderSchedule", () => {
  it("reads the new shape back", () => {
    const parsed = reminderSchedule({
      enabled: true,
      repeatFinalEveryDays: 7,
      stages: [{ stage: "nudge", enabled: true, offsetDays: 5, templateId: "t1" }],
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.repeatFinalEveryDays).toBe(7);
    expect(parsed.stages[0]).toEqual({
      stage: "nudge",
      enabled: true,
      offsetDays: 5,
      templateId: "t1",
    });
  });

  it("fills in the stages the stored blob does not mention", () => {
    const parsed = reminderSchedule({ enabled: true, stages: [] });
    expect(parsed.stages.map((s) => s.stage)).toEqual(["nudge", "followup", "final"]);
    expect(parsed.stages.map((s) => s.offsetDays)).toEqual([
      DEFAULT_STAGE_OFFSETS.nudge,
      DEFAULT_STAGE_OFFSETS.followup,
      DEFAULT_STAGE_OFFSETS.final,
    ]);
  });

  // Every brand written before this feature has the old flat shape.
  it("carries a legacy templateId onto the first stage only", () => {
    const parsed = reminderSchedule({ enabled: true, templateId: "old-template" });
    expect(parsed.stages[0]).toMatchObject({ templateId: "old-template", enabled: true });
    expect(parsed.stages[1]!.templateId).toBe("");
    expect(parsed.stages[2]!.templateId).toBe("");
    // Copying it onto all three would recreate the problem this replaces:
    // three stages that say exactly the same thing.
    expect(parsed.stages[1]!.enabled).toBe(false);
    expect(parsed.stages[2]!.enabled).toBe(false);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, 42, "nonsense", { stages: "not an array" }]) {
      const parsed = reminderSchedule(junk);
      expect(parsed.enabled).toBe(false);
      expect(parsed.stages).toHaveLength(3);
    }
  });

  it("refuses a negative offset, which would chase before the due date", () => {
    const parsed = reminderSchedule({
      enabled: true,
      stages: [{ stage: "nudge", enabled: true, offsetDays: -5, templateId: "t" }],
    });
    expect(parsed.stages[0]!.offsetDays).toBe(0);
  });
});

describe("stageIsSendable", () => {
  it("needs both a switch and a template", () => {
    expect(stageIsSendable({ stage: "nudge", enabled: true, offsetDays: 3, templateId: "t" })).toBe(true);
    expect(stageIsSendable({ stage: "nudge", enabled: false, offsetDays: 3, templateId: "t" })).toBe(false);
    expect(stageIsSendable({ stage: "nudge", enabled: true, offsetDays: 3, templateId: "  " })).toBe(false);
  });
});

describe("dueReminder", () => {
  it("sends nothing before the first offset", () => {
    expect(dueReminder(invoice(), schedule(), [], day("2026-07-22"))).toBeNull();
  });

  it("sends the nudge on its offset day", () => {
    const due = dueReminder(invoice(), schedule(), [], day("2026-07-23"));
    expect(due).toMatchObject({ stage: "nudge", ordinal: 1, templateId: "t-nudge" });
    expect(due!.scheduledFor).toBe("2026-07-23");
  });

  it("walks the sequence one stage at a time as the invoice ages", () => {
    const sent: SentReminder[] = [];
    const at = (iso: string) => dueReminder(invoice(), schedule(), sent, day(iso));

    expect(at("2026-07-23")!.stage).toBe("nudge");
    sent.push({ stage: "nudge", ordinal: 1, sentOn: "2026-07-23" });
    expect(at("2026-07-24")).toBeNull();
    expect(at("2026-07-30")!.stage).toBe("followup");
    sent.push({ stage: "followup", ordinal: 1, sentOn: "2026-07-30" });
    expect(at("2026-08-10")!.stage).toBe("final");
    sent.push({ stage: "final", ordinal: 1, sentOn: "2026-08-10" });
    expect(at("2026-09-01")).toBeNull();
  });

  /**
   * The behaviour that matters most when the feature is first switched on,
   * against a book full of invoices that are already months late.
   */
  it("jumps to the furthest owed stage rather than starting gently", () => {
    const due = dueReminder(invoice(), schedule(), [], day("2026-09-18"));
    expect(due!.stage).toBe("final");
    // And the skipped stages leave no trace — history reports what happened,
    // not what was theoretically scheduled.
    expect(due!.ordinal).toBe(1);
  });

  it("never steps back down the sequence", () => {
    const sent: SentReminder[] = [{ stage: "final", ordinal: 1, sentOn: "2026-08-10" }];
    // Nudge and followup are unsent and long overdue, but the sequence has
    // already reached its end; de-escalating would be worse than silence.
    expect(dueReminder(invoice(), schedule(), sent, day("2026-09-01"))).toBeNull();
  });

  /**
   * The route that actually reaches the de-escalation guard, and the reason it
   * exists. A disabled stage is skipped before the already-sent check, so a
   * final notice that has fired and has since been switched off no longer
   * stops the walk — without the guard the next candidate is `followup`, and
   * a client who has already had the final warning gets a milder one after it.
   */
  it("stays silent when the stage it already sent has since been disabled", () => {
    const s = schedule();
    s.stages[2]!.enabled = false;
    const sent: SentReminder[] = [{ stage: "final", ordinal: 1, sentOn: "2026-08-10" }];
    expect(dueReminder(invoice(), s, sent, day("2026-09-01"))).toBeNull();
  });

  it("skips a stage with no template rather than sending an empty email", () => {
    const s = schedule();
    s.stages[1]!.templateId = "";
    const sent: SentReminder[] = [{ stage: "nudge", ordinal: 1, sentOn: "2026-07-23" }];
    expect(dueReminder(invoice(), s, sent, day("2026-07-30"))).toBeNull();
    expect(dueReminder(invoice(), s, sent, day("2026-08-10"))!.stage).toBe("final");
  });

  it("sends nothing when the sequence is off, the invoice is paused, or it is settled", () => {
    expect(dueReminder(invoice(), schedule({ enabled: false }), [], day("2026-09-01"))).toBeNull();
    expect(
      dueReminder(invoice({ followupsPaused: true }), schedule(), [], day("2026-09-01"))
    ).toBeNull();
    expect(dueReminder(invoice({ status: "paid" }), schedule(), [], day("2026-09-01"))).toBeNull();
    expect(dueReminder(invoice({ status: "draft" }), schedule(), [], day("2026-09-01"))).toBeNull();
  });

  // The scheduler runs unattended over every invoice in the system, so one
  // unusable row must mean "skip this one", never "abandon the run".
  it("returns null for an unparseable or missing due date", () => {
    expect(dueReminder(invoice({ dueDate: "" }), schedule(), [], day("2026-09-01"))).toBeNull();
    expect(dueReminder(invoice({ dueDate: "nonsense" }), schedule(), [], day("2026-09-01"))).toBeNull();
  });

  it("treats an offset of zero as the due date itself", () => {
    const s = schedule();
    s.stages[0]!.offsetDays = 0;
    expect(dueReminder(invoice(), s, [], day(DUE))!.stage).toBe("nudge");
    expect(dueReminder(invoice(), s, [], day("2026-07-19"))).toBeNull();
  });

  it("ignores legacy and manual history when picking the next stage", () => {
    const sent: SentReminder[] = [
      { stage: "legacy", ordinal: 1, sentOn: "2026-07-25" },
      { stage: "manual", ordinal: 1, sentOn: "2026-07-26" },
    ];
    expect(dueReminder(invoice(), schedule(), sent, day("2026-07-23"))!.stage).toBe("nudge");
  });

  describe("repeating the final notice", () => {
    const sent: SentReminder[] = [{ stage: "final", ordinal: 1, sentOn: "2026-08-10" }];

    it("does not repeat by default", () => {
      expect(dueReminder(invoice(), schedule(), sent, day("2026-09-30"))).toBeNull();
    });

    it("repeats on the interval, counting from the last one actually sent", () => {
      const s = schedule({ repeatFinalEveryDays: 7 });
      expect(dueReminder(invoice(), s, sent, day("2026-08-16"))).toBeNull();
      const due = dueReminder(invoice(), s, sent, day("2026-08-17"));
      expect(due).toMatchObject({ stage: "final", ordinal: 2 });
      expect(due!.scheduledFor).toBe("2026-08-17");
    });

    /**
     * Counting from the last send rather than from the due date is what stops
     * a quota-blocked or late-running month from firing a burst of catch-up
     * notices the moment it recovers.
     */
    it("does not fire a burst after a long gap", () => {
      const s = schedule({ repeatFinalEveryDays: 7 });
      const due = dueReminder(invoice(), s, sent, day("2026-12-01"));
      expect(due!.ordinal).toBe(2);
    });

    it("keeps incrementing the ordinal", () => {
      const s = schedule({ repeatFinalEveryDays: 7 });
      const twice: SentReminder[] = [
        ...sent,
        { stage: "final", ordinal: 2, sentOn: "2026-08-17" },
      ];
      expect(dueReminder(invoice(), s, twice, day("2026-08-24"))!.ordinal).toBe(3);
    });
  });
});

describe("canChaseManually", () => {
  it("is off until the final notice has gone", () => {
    expect(canChaseManually(invoice(), [])).toBe(false);
    expect(
      canChaseManually(invoice(), [{ stage: "nudge", ordinal: 1, sentOn: "2026-07-23" }])
    ).toBe(false);
    expect(
      canChaseManually(invoice(), [{ stage: "final", ordinal: 1, sentOn: "2026-08-10" }])
    ).toBe(true);
  });

  it("is off once the invoice is settled", () => {
    expect(
      canChaseManually(invoice({ status: "paid" }), [
        { stage: "final", ordinal: 1, sentOn: "2026-08-10" },
      ])
    ).toBe(false);
  });
});

describe("nextManualOrdinal", () => {
  it("counts only manual chases", () => {
    expect(nextManualOrdinal([])).toBe(1);
    expect(nextManualOrdinal([{ stage: "final", ordinal: 1, sentOn: "2026-08-10" }])).toBe(1);
    expect(
      nextManualOrdinal([
        { stage: "manual", ordinal: 1, sentOn: "2026-08-20" },
        { stage: "manual", ordinal: 2, sentOn: "2026-08-27" },
      ])
    ).toBe(3);
  });
});
