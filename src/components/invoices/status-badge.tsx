import { Badge } from "@/components/ui/badge";
import { InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  InvoiceStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-blue-500/10 text-blue-400" },
  paid: { label: "Paid", className: "bg-green-500/10 text-green-400" },
  overdue: { label: "Overdue", className: "bg-red-500/10 text-red-400" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const config = statusConfig[status];
  return (
    <Badge
      variant="secondary"
      className={cn("text-[10px] font-medium", config.className)}
    >
      {config.label}
    </Badge>
  );
}
