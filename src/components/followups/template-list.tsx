"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Brand, EmailTemplate } from "@/lib/types";

interface TemplateListProps {
  templates: EmailTemplate[];
  brands: Brand[];
}

export function TemplateList({ templates, brands }: TemplateListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Email templates</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Write once, attach to any brand. Placeholders fill themselves in per invoice.
        </p>
      </div>

      <div className="border rounded-[14px] bg-card overflow-hidden">
        {templates.map((template) => {
          const usedBy = brands
            .filter((brand) => brand.followup.templateId === template.id)
            .map((brand) => brand.name);

          return (
            <Link
              key={template.id}
              href={`/followups/templates/${template.id}`}
              className="flex items-center gap-4 px-4 py-3.5 border-b last:border-b-0 cursor-pointer hover:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{template.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {usedBy.length > 0 ? usedBy.join(" · ") : "Not attached to a brand"}
                </p>
              </div>
              <p className="flex-[1.6] text-[13px] text-muted-foreground truncate">
                {template.subject}
              </p>
              <Badge variant="outline" className="text-xs">
                {template.tone}
              </Badge>
              <ChevronRight className="size-[15px] text-muted-foreground shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
