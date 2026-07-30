"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { TemplateForm } from "@/components/followups/template-form";
import { FEATURES } from "@/lib/features";

export default function CreateTemplatePage() {
  const router = useRouter();

  // See app/followups/page.tsx for why this redirects rather than 404s.
  useEffect(() => {
    if (!FEATURES.followups) router.replace("/");
  }, [router]);

  if (!FEATURES.followups) return null;

  return (
    <Shell>
      <TemplateForm />
    </Shell>
  );
}
