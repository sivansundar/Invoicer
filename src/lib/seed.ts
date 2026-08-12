import type { EmailTemplate, FollowupConfig } from "./types";

export const DEFAULT_TEMPLATE_ID = "tpl-gentle-nudge";

/**
 * The same three templates the signup trigger writes for every new org
 * (`*_seed_default_templates.sql`) — kept here for the localStorage
 * importer, which still has to recognise and normalise them in a backup
 * file exported by the pre-Postgres app.
 *
 * These ids are not uuids, so they cannot be inserted into
 * `public.email_templates` as they stand. The importer has to remap them.
 */
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

/**
 * `templateId` is deliberately empty rather than naming a default.
 *
 * Templates are seeded per org with `gen_random_uuid()` (the primary key is
 * `id` alone, so a shared constant id would collide on the second signup),
 * which means no template id is knowable client-side. A brand created with a
 * hardcoded one would carry a reference to a row that does not exist —
 * the dangling-templateId problem in docs/POST-MERGE-NOTES.md, made
 * unavoidable rather than merely likely.
 *
 * An empty `templateId` is an established, handled state: the follow-ups UI
 * treats a missing template as "none chosen" and falls back to "Reminder"
 * wherever a name is needed.
 */
export function defaultFollowupConfig(): FollowupConfig {
  return {
    enabled: true,
    mode: "weekly",
    weekday: 2,
    time: "09:00",
    repeat: "week",
    templateId: "",
    stopAfter: 4,
  };
}
