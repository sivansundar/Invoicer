import { Badge } from "@/components/ui/badge";
import { InvoiceStatus } from "@/lib/types";

const statusConfig: Record<
  InvoiceStatus,
  { label: string; variant: "secondary" | "outline" | "destructive"; className?: string }
> = {
  paid: { label: "Paid", variant: "secondary" },
  sent: { label: "Sent", variant: "outline" },
  draft: { label: "Draft", variant: "outline", className: "text-muted-foreground" },
  overdue: { label: "Overdue", variant: "destructive" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
