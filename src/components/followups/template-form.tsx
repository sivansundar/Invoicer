"use client";

// MOCK: this editor (like the rest of the follow-ups feature) never sends
// anything. The right-hand pane is a static mock of what a reminder email
// would look like — it renders straight from localStorage-backed template
// and invoice data, never a real inbox.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { useTemplates } from "@/hooks/use-templates";
import { fillTemplate, TEMPLATE_TOKENS, templateContext } from "@/lib/followups";
import { sampleInvoiceForPreview, templateBrandNames } from "@/lib/templates";
import { cn } from "@/lib/utils";
import type { EmailTemplate, EmailTone } from "@/lib/types";

const TONES: EmailTone[] = ["Friendly", "Direct", "Firm"];

const NEW_TEMPLATE_BODY = "Hi {{client}},\n\n\n\nThanks,\n{{brand}}";

interface TemplateFormProps {
  template?: EmailTemplate;
}

export function TemplateForm({ template }: TemplateFormProps) {
  const router = useRouter();
  const { brands } = useBrands();
  const { invoices } = useInvoices();
  const { save, remove } = useTemplates();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [tone, setTone] = useState<EmailTone>(template?.tone ?? "Friendly");
  const [body, setBody] = useState(template?.body ?? NEW_TEMPLATE_BODY);

  const usedBy = template ? templateBrandNames(template.id, brands) : [];

  const subtitle = !isEdit
    ? "Attach it to a brand after saving"
    : usedBy.length === 0
      ? "Not attached to a brand yet"
      : `Used by ${usedBy.join(" · ")}`;

  // First overdue invoice, else first sent, else first of any kind, else
  // null — see `sampleInvoiceForPreview` for why. `null` only when the
  // account has no invoices at all, which the preview below renders as the
  // raw, unfilled template rather than crashing on a missing sample.
  const sampleInvoice = useMemo(() => sampleInvoiceForPreview(invoices), [invoices]);

  // The frozen brand name on the sample invoice itself — that's the brand a
  // real reminder for this invoice would actually send from, regardless of
  // whether this template happens to be attached to any brand yet.
  const previewContext = sampleInvoice
    ? templateContext(sampleInvoice, sampleInvoice.brandSnapshot.name)
    : null;

  const filledSubject = previewContext ? fillTemplate(subject, previewContext) : subject;
  const filledBody = previewContext ? fillTemplate(body, previewContext) : body;

  const insertToken = (token: string) => setBody((current) => `${current}{{${token}}}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedSubject = subject.trim();
    if (!trimmedName || !trimmedSubject) {
      toast("A template needs a name and a subject line");
      return;
    }

    const record: EmailTemplate = {
      id: template?.id ?? crypto.randomUUID(),
      name: trimmedName,
      subject: trimmedSubject,
      tone,
      body,
      createdAt: template?.createdAt ?? new Date().toISOString(),
    };

    // `save` (from `useTemplates`) passes through `storage.saveTemplate`'s
    // own return value — `false` means the write didn't actually persist
    // (e.g. a full `localStorage` quota, which `storage.ts` has already
    // toasted its own clear failure message for). Toasting success and
    // navigating away regardless would tell the user this worked when it
    // didn't, and take them off the one screen still holding what they
    // typed.
    const persisted = save(record);
    if (!persisted) return;

    toast(isEdit ? `${trimmedName} updated` : `${trimmedName} created — attach it to a brand`);
    router.push("/followups");
  };

  const handleDelete = () => {
    if (!template) return;

    // A template still pointed at by a brand's `followup.templateId` can't
    // be deleted out from under it — that select has no matching option
    // left, and the brand's next reminder would silently have no template
    // to read. Named guard, same shape as `brandDeleteGuard` in `brands.ts`.
    if (usedBy.length > 0) {
      toast(`Swap the template on ${usedBy.join(" and ")} first`);
      return;
    }

    if (!remove(template.id)) return;
    toast(`${template.name} deleted`);
    router.push("/followups");
  };

  return (
    <div className="flex flex-wrap items-stretch flex-1 min-h-0">
      {/* Left pane: the form */}
      <div className="flex-[1_1_520px] min-w-[400px] p-6 flex flex-col gap-5">
        <div>
          <Link
            href="/followups"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
          >
            <ChevronLeft className="size-3.5" />
            Follow-ups
          </Link>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] mt-3">
            {isEdit ? `Edit "${template.name}"` : "New email template"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-5"
        >
          <div className="flex gap-3 flex-wrap">
            <div className="flex-[1.2_1_200px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Template name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gentle nudge"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tone</Label>
              <ToggleGroup
                type="single"
                value={tone}
                onValueChange={(value) => {
                  if (value) setTone(value as EmailTone);
                }}
                className="inline-flex h-9 bg-accent rounded-[10px] p-[3px] gap-0 w-fit"
              >
                {TONES.map((option) => (
                  <ToggleGroupItem
                    key={option}
                    value={option}
                    className="h-[30px] px-3 rounded-md text-[13px] font-medium data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground"
                  >
                    {option}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subject line</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A small nudge about your invoice"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="text-sm leading-[1.6]"
            />
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs text-muted-foreground">Insert</span>
              {TEMPLATE_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertToken(token)}
                  className="h-[26px] px-2.5 bg-muted border rounded-full font-mono text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {`{{${token}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/followups")}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {isEdit ? "Save template" : "Create template"}
            </Button>
          </div>
        </form>

        {isEdit && (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted-foreground">
              {usedBy.length === 0 ? "Not attached to a brand yet" : `Used by ${usedBy.join(" · ")}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "ml-auto",
                "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
              )}
              onClick={handleDelete}
            >
              Delete template
            </Button>
          </div>
        )}
      </div>

      {/* Right pane: static mock of the resulting email */}
      <div className="flex-[1_1_440px] min-w-[400px] bg-muted border-l p-6">
        <div className="mb-4">
          <p className="text-sm font-medium">Preview</p>
          <p className="text-[13px] text-muted-foreground">
            {sampleInvoice ? `Preview uses ${sampleInvoice.invoiceNumber}` : "Preview uses sample data"}
          </p>
        </div>

        <div className="bg-card border rounded-[14px] shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b flex flex-col gap-1.5">
            <p className="text-[15px] font-semibold tracking-[-0.01em] leading-[1.35]">
              {filledSubject || "Subject line"}
            </p>
            <p className="text-xs text-muted-foreground">
              {previewContext
                ? `${previewContext.brand} → ${previewContext.company}`
                : "{{brand}} → {{company}}"}
            </p>
          </div>
          <div className="p-5 text-[13px] leading-[1.7] whitespace-pre-wrap">
            {filledBody || "Your message goes here."}
          </div>
          <div className="px-5 py-3.5 border-t bg-muted flex items-center gap-2">
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              A PDF of the invoice is attached automatically
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
