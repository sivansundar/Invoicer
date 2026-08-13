import { Skeleton } from "@/components/ui/skeleton";

/**
 * Per-screen loading states.
 *
 * Reads used to be synchronous, so the app had almost no loading affordances
 * — every screen assumed its data was already there. Two things go wrong
 * without these, and the second is the worse one:
 *
 * 1. A list flashes its empty state ("No clients yet") before the data
 *    arrives, telling a user with fifty clients that they have none.
 * 2. A detail or edit screen flashes "not found", which is not merely
 *    unstyled — it is false, and it is the screen where a user is most
 *    likely to believe something has been lost.
 *
 * Each skeleton mirrors the real layout closely enough that the swap is not
 * a jolt: same page padding, same block sizes, same number of rows.
 */

/** The page title and description block every screen opens with. */
function HeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/** `/clients` — a header over a bordered table of rows. */
export function ListPageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <HeaderSkeleton />
      <div className="border rounded-[14px] bg-card overflow-hidden">
        <div className="flex items-center h-10 px-4 border-b">
          <Skeleton className="h-4 w-24" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
            <Skeleton className="h-4 flex-[1.4]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-[1.3]" />
            <Skeleton className="h-4 flex-[0.6]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** `/brands` — a header over a two-column grid of cards. */
export function CardGridSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: cards }, (_, i) => (
          <div
            key={i}
            className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-3 min-h-[160px]"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="border-t pt-3 flex gap-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** `/dashboard` — stat cards, then the chart, then the invoice table. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="px-6 grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="border rounded-[14px] bg-card shadow-sm p-6 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>
      <div className="px-6">
        <div className="border rounded-[14px] bg-card shadow-sm p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-[220px] w-full" />
        </div>
      </div>
      <div className="px-6">
        <div className="border rounded-[14px] bg-card overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 flex-[0.8]" />
              <Skeleton className="h-4 flex-[1.4]" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-[0.6]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Brand, client, template and invoice forms — a titled card of fields. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="p-6 max-w-[660px]">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-56 mt-3" />
      <Skeleton className="h-4 w-96 mt-2" />
      <div className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-5 mt-6">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** `/invoices/[id]` — the two-pane detail view. */
export function InvoiceDetailSkeleton() {
  return (
    <div className="flex flex-wrap items-stretch flex-1 min-h-0">
      <div className="flex-[1_1_460px] min-w-0 p-6 flex flex-col gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-64" />
        <div className="border rounded-[14px] bg-card shadow-sm p-6 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-[1_1_460px] min-w-0 p-6">
        <Skeleton className="h-[560px] w-full rounded-[14px]" />
      </div>
    </div>
  );
}

/** `/reports` — a header over two bordered sections. */
export function ReportsSkeleton() {
  return (
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="border rounded-[14px] bg-card shadow-sm p-6 space-y-2">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-3 w-80" />
          <Skeleton className="h-9 w-40 mt-4" />
        </div>
      ))}
    </div>
  );
}
