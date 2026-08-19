"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  REMINDER_STAGES,
  STAGE_LABEL,
  stageIsSendable,
  type ReminderSchedule,
  type ReminderStage,
  type StageConfig,
} from "@/lib/reminder-stages";
import type { EmailTemplate } from "@/lib/types";

/**
 * The three-stage sequence, as a form.
 *
 * Each row is one stage: a switch, how many days past due it fires, and which
 * template it sends. That is the whole model — there is no cadence, no
 * weekday and no time, because a stage fires once at an offset rather than
 * repeating on a schedule.
 *
 * A stage with no template renders as unsendable rather than as an error.
 * Choosing a template is the fix, and the row says so; a red validation
 * message on a thing nobody has filled in yet reads as a mistake rather than
 * as an instruction.
 */

const OFFSET_HINT: Record<ReminderStage, string> = {
  nudge: "Early enough to catch an invoice that merely got lost.",
  followup: "By now it is late rather than forgotten.",
  final: "The last automatic message. Anything after this is your call.",
};

interface StageEditorProps {
  schedule: ReminderSchedule;
  templates: EmailTemplate[];
  onChange: (schedule: ReminderSchedule) => void;
}

export function StageEditor({ schedule, templates, onChange }: StageEditorProps) {
  const patchStage = (stage: ReminderStage, patch: Partial<StageConfig>) => {
    onChange({
      ...schedule,
      stages: schedule.stages.map((s) => (s.stage === stage ? { ...s, ...patch } : s)),
    });
  };

  const liveStages = schedule.stages.filter(stageIsSendable);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        {REMINDER_STAGES.map((stage, index) => {
          const config = schedule.stages.find((s) => s.stage === stage);
          if (!config) return null;
          const sendable = stageIsSendable(config);

          return (
            <div
              key={stage}
              className={cn(
                "rounded-[12px] border px-4 py-3.5 transition-colors",
                sendable ? "bg-surface" : "bg-field/60"
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums",
                    sendable ? "bg-blue text-white" : "bg-line text-ink-3"
                  )}
                >
                  {index + 1}
                </span>
                <span className="text-[14.5px] font-medium">{STAGE_LABEL[stage]}</span>
                <div className="flex-1" />
                <Switch
                  aria-label={`Send the ${STAGE_LABEL[stage].toLowerCase()}`}
                  checked={config.enabled}
                  onCheckedChange={(checked) => patchStage(stage, { enabled: checked })}
                />
              </div>

              {config.enabled && (
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`offset-${stage}`}
                      className="text-xs text-ink-3"
                    >
                      Days past due
                    </Label>
                    <Input
                      id={`offset-${stage}`}
                      type="number"
                      min={0}
                      max={365}
                      value={config.offsetDays}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        // Guarded here as well as in `reminderSchedule`: a
                        // negative offset would chase before the invoice is
                        // even due, and the number input allows typing one.
                        patchStage(stage, {
                          offsetDays: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0,
                        });
                      }}
                      className="h-9 w-24 tabular-nums"
                    />
                  </div>

                  <div className="min-w-[200px] flex-1 space-y-1.5">
                    <Label htmlFor={`template-${stage}`} className="text-xs text-ink-3">
                      Template
                    </Label>
                    <NativeSelect
                      id={`template-${stage}`}
                      value={config.templateId}
                      onChange={(event) => patchStage(stage, { templateId: event.target.value })}
                      className="h-9"
                    >
                      <NativeSelectOption value="">Choose a template…</NativeSelectOption>
                      {templates.map((template) => (
                        <NativeSelectOption key={template.id} value={template.id}>
                          {template.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>

                  {config.templateId && (
                    <Link
                      href={`/followups/templates/${config.templateId}`}
                      className="inline-flex h-9 items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
                    >
                      <Mail className="size-3.5" />
                      Edit copy
                    </Link>
                  )}
                </div>
              )}

              <p className="mt-2 text-[12.5px] text-ink-3">
                {!config.enabled
                  ? "Switched off — this step is skipped entirely."
                  : !config.templateId
                    ? "Pick a template and this step starts sending."
                    : OFFSET_HINT[stage]}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border bg-surface px-4 py-3">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="repeat-final" className="text-xs text-ink-3">
            After the final notice
          </Label>
          <NativeSelect
            id="repeat-final"
            value={String(schedule.repeatFinalEveryDays)}
            onChange={(event) =>
              onChange({ ...schedule, repeatFinalEveryDays: Number(event.target.value) })
            }
            className="h-9"
          >
            <NativeSelectOption value="0">Stop — chase by hand from here</NativeSelectOption>
            <NativeSelectOption value="7">Repeat it every 7 days</NativeSelectOption>
            <NativeSelectOption value="14">Repeat it every 14 days</NativeSelectOption>
            <NativeSelectOption value="30">Repeat it every 30 days</NativeSelectOption>
          </NativeSelect>
        </div>
        <p className="min-w-[220px] flex-1 text-[12.5px] text-ink-3">
          {schedule.repeatFinalEveryDays === 0
            ? "Recommended. A final notice that keeps arriving is not a final notice, and clients learn to ignore it."
            : "Repeats until the invoice is paid or you pause it."}
        </p>
      </div>

      <p className="text-[12.5px] text-ink-3 tabular-nums">
        {liveStages.length === 0
          ? "No steps are sending yet — each one needs a template."
          : `${liveStages.length} of 3 steps will send, starting ${
              Math.min(...liveStages.map((s) => s.offsetDays))
            } days past the due date.`}
      </p>
    </div>
  );
}
