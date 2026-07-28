import type { EmailTemplate, FollowupConfig } from "./types";

export const DEFAULT_TEMPLATE_ID = "tpl-gentle-nudge";

/** Seeded once, on first migration. Users can edit or delete them afterwards. */
export const SEED_TEMPLATES: EmailTemplate[] = [
  {
    id: DEFAULT_TEMPLATE_ID,
    name: "Gentle nudge",
    tone: "Friendly",
    subject: "A small nudge about {{invoice}}",
    body:
      "Hi {{client}},\n\n" +
      "Hope the week is treating you kindly. Just floating {{invoice}} back to the top of your inbox — {{amount}} was due on {{due_date}}.\n\n" +
      "The payment details are on the invoice, and I've attached a copy for convenience. If it's already on its way, ignore me entirely.\n\n" +
      "Warmly,\n{{brand}}",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-second-reminder",
    name: "Second reminder",
    tone: "Direct",
    subject: "{{invoice}} — {{days_late}} days past due",
    body:
      "Hi {{client}},\n\n" +
      "{{invoice}} for {{amount}} is now {{days_late}} days past its due date of {{due_date}}.\n\n" +
      "Could you let me know when I can expect the transfer? Happy to re-send the invoice or share alternate payment details if that helps.\n\n" +
      "Thanks,\n{{brand}}",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-final-notice",
    name: "Final notice",
    tone: "Firm",
    subject: "Final reminder: {{invoice}} ({{amount}})",
    body:
      "Hi {{client}},\n\n" +
      "This is my last automated reminder for {{invoice}}, outstanding since {{due_date}} — {{amount}}.\n\n" +
      "If payment isn't settled this week I'll follow up directly to sort out next steps. I'd much rather close this quietly.\n\n" +
      "Regards,\n{{brand}}",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export function defaultFollowupConfig(): FollowupConfig {
  return {
    enabled: true,
    mode: "weekly",
    weekday: 2,
    time: "09:00",
    repeat: "week",
    templateId: DEFAULT_TEMPLATE_ID,
    stopAfter: 4,
  };
}
