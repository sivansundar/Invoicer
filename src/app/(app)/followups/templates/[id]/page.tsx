"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { TemplateForm } from "@/components/followups/template-form";
import { useTemplates } from "@/hooks/use-templates";
import { FEATURES } from "@/lib/features";

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const { templates } = useTemplates();

  // See app/followups/page.tsx for why this redirects rather than 404s.
  useEffect(() => {
    if (!FEATURES.followups) router.replace("/dashboard");
  }, [router]);

  const id = params.id as string;
  const template = useMemo(() => templates.find((t) => t.id === id) ?? null, [templates, id]);

  if (!FEATURES.followups) return null;

  if (!template) {
    return <p className="text-sm text-muted-foreground p-6">Template not found.</p>;
  }

  return <TemplateForm template={template} />;
}
