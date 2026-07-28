"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { TemplateForm } from "@/components/followups/template-form";
import { useTemplates } from "@/hooks/use-templates";

export default function EditTemplatePage() {
  const params = useParams();
  const { templates } = useTemplates();

  const id = params.id as string;
  const template = useMemo(() => templates.find((t) => t.id === id) ?? null, [templates, id]);

  if (!template) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground p-6">Template not found.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <TemplateForm template={template} />
    </Shell>
  );
}
