import type { Brand, Client, Invoice } from "./types";
import { paymentDetailFields } from "./invoice-preview";

export type SetupStepId = "brand" | "payment" | "client" | "invoice";

export interface SetupStep {
  id: SetupStepId;
  /** One line, in the second person, saying what this step buys the user. */
  reason: string;
  /** The button label — a verb, matching where the href lands. */
  action: string;
  /** A route that actually completes this step, never a list to hunt from. */
  href: string;
  done: boolean;
}

export interface SetupProgress {
  steps: SetupStep[];
  /** How many of `steps` are done, and how many there are: "2 of 4". */
  done: number;
  total: number;
  /** The first step still outstanding, or null once nothing is left. */
  next: SetupStep | null;
  complete: boolean;
}

export interface SetupRecords {
  brands: Brand[];
  clients: Client[];
  invoices: Invoice[];
}

/**
 * Whether a brand carries payment details, judged by `paymentDetailFields`
 * (`@/lib/invoice-preview`) — the same call the invoice preview and the PDF
 * make to decide whether to print a "Payment details" block at all. Reused
 * rather than restated so this step and the document agree by construction.
 *
 * The brands screen applies a stricter test of its own (`hasPayableDetails`,
 * `app/(app)/brands/page.tsx`), which additionally insists the filled fields
 * add up to something money can actually be sent to. That one is local to
 * the page and not exported; if it ever moves into `lib/`, this should call
 * it instead, since a brand carrying only an account name satisfies the
 * check below while still printing a box nobody can pay into.
 */
function hasPaymentDetails(brand: Brand): boolean {
  return paymentDetailFields(brand.bankDetails).length > 0;
}

/**
 * The onboarding checklist, derived entirely from records that exist. Each
 * step is something the data model can actually satisfy, in the order the
 * app forces anyway: an invoice needs a brand, and payment details are worth
 * adding before the first invoice freezes a `brandSnapshot` without them.
 *
 * Ordering matters more than it looks: the card only ever shows `next`, so
 * this sequence is the sequence a new account is walked through.
 */
export function buildSetupProgress({
  brands,
  clients,
  invoices,
}: SetupRecords): SetupProgress {
  // The first brand whose bank block is still blank — the one the payment
  // step sends you to edit. Every brand has to carry details for the step to
  // count as done, because an invoice issued under the one that does not is
  // the invoice with no payment block on it. Falls back to the brands list
  // when there is no brand at all, which the card never actually reaches:
  // the brand step is outstanding too, and it sorts first.
  const brandNeedingPayment = brands.find((brand) => !hasPaymentDetails(brand));

  const steps: SetupStep[] = [
    {
      id: "brand",
      reason: "Add a brand so invoices carry your business details.",
      action: "Add brand",
      href: "/brands/create",
      done: brands.length > 0,
    },
    {
      id: "payment",
      // Worded against what the check above actually guarantees. One filled
      // field satisfies `paymentDetailFields`, so promising a payable
      // invoice here would over-claim for a brand carrying only an account
      // name; what it does guarantee is that the block prints.
      reason: "Add bank details so they print on your invoices.",
      action: "Add details",
      href: brandNeedingPayment ? `/brands/${brandNeedingPayment.id}/edit` : "/brands",
      done: brands.length > 0 && brandNeedingPayment === undefined,
    },
    {
      id: "client",
      reason: "Save a client once and reuse them on every invoice.",
      action: "Add client",
      href: "/clients/create",
      done: clients.length > 0,
    },
    {
      id: "invoice",
      reason: "Issue your first invoice and start tracking what's owed.",
      action: "New invoice",
      href: "/invoices/create",
      done: invoices.length > 0,
    },
  ];

  const done = steps.filter((step) => step.done).length;
  return {
    steps,
    done,
    total: steps.length,
    next: steps.find((step) => !step.done) ?? null,
    complete: done === steps.length,
  };
}
