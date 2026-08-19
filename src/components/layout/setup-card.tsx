"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/primitives";
import { useBrands } from "@/hooks/use-brands";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { writeLocalStorage } from "@/lib/local-storage";
import { buildSetupProgress } from "@/lib/setup-progress";

/** Exported for the tests, which assert the dismissal actually persisted. */
export const SETUP_DISMISSED_KEY = "invoicer_setup_dismissed";

/**
 * The dismissal is read through `useSyncExternalStore` — the shape
 * `use-plan.ts` already uses for the plan flag — rather than an effect that
 * calls `setState`, which React flags as a cascading render. localStorage is
 * the only copy of the answer, so nothing here can disagree with what a
 * reload would find.
 */
const dismissalListeners = new Set<() => void>();

function subscribeToDismissal(onChange: () => void): () => void {
  dismissalListeners.add(onChange);
  // Dismissing in one tab should not leave the card standing in another.
  window.addEventListener("storage", onChange);
  return () => {
    dismissalListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isDismissed(): boolean {
  return localStorage.getItem(SETUP_DISMISSED_KEY) === "1";
}

// The server has no storage to consult. Answering "dismissed" keeps the card
// out of the server markup and out of the hydration pass, so someone who
// dismissed it months ago never sees it flash back before the real answer
// arrives; the reverse default would show it to everyone for a frame.
function isDismissedOnServer(): boolean {
  return true;
}

function dismiss(): void {
  // Deliberately not an optimistic hide. On a full quota `writeLocalStorage`
  // toasts that the change was not saved, and hiding a card that will be back
  // next session would contradict that toast. Every other outcome persists,
  // and the notify below is what re-renders the card away.
  writeLocalStorage(SETUP_DISMISSED_KEY, "1");
  for (const notify of dismissalListeners) notify();
}

const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The "2 of 4" ring. A stroked arc, drawn from twelve o'clock. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" className="shrink-0" aria-hidden>
      <circle cx="10" cy="10" r={RING_RADIUS} fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle
        cx="10"
        cy="10"
        r={RING_RADIUS}
        fill="none"
        stroke="var(--blue)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}

/**
 * The sidebar's onboarding card: the next thing worth doing, why it matters,
 * and one button that goes somewhere that actually does it. The checklist
 * itself is derived from real records in `@/lib/setup-progress`.
 *
 * Three cases render nothing at all. While the three queries are still
 * pending every list is empty, which would flash "0 of 4" at an account that
 * has everything; once every step is done the card has nothing left to say
 * and a permanently full 4-of-4 card is just clutter; and a dismissal sticks
 * across sessions.
 *
 * The mockup's progress row also carries a "Next" button beside "Skip".
 * It is not built: the only thing it could honestly do is follow the same
 * href as the button in the header strip above it, and a second control
 * onto the same route is not worth the row it costs.
 */
export function SetupCard() {
  const { brands, loading: brandsLoading } = useBrands();
  const { clients, loading: clientsLoading } = useClients();
  const { invoices, loading: invoicesLoading } = useInvoices();

  const dismissed = useSyncExternalStore(
    subscribeToDismissal,
    isDismissed,
    isDismissedOnServer
  );

  const progress = buildSetupProgress({ brands, clients, invoices });
  const step = progress.next;

  if (dismissed) return null;
  if (brandsLoading || clientsLoading || invoicesLoading) return null;
  if (!step) return null;

  return (
    <Panel className="overflow-hidden">
      {/* Soft-accent wash, built from the -soft tokens so it follows the
          theme; the button on top is the card's one action. */}
      <div
        className="relative h-[78px] bg-field"
        style={{
          backgroundImage: [
            "radial-gradient(120% 140% at 12% 20%, var(--blue-soft) 0%, transparent 55%)",
            "radial-gradient(120% 140% at 82% 12%, var(--amber-soft) 0%, transparent 58%)",
            "radial-gradient(140% 160% at 60% 100%, var(--red-soft) 0%, transparent 60%)",
          ].join(", "),
        }}
      >
        <Link
          href={step.href}
          className="absolute top-1/2 left-1/2 inline-flex h-[30px] -translate-x-1/2 -translate-y-1/2 items-center rounded-[9px] bg-ink px-3.5 text-[13px] font-medium text-canvas shadow-[var(--shadow-pill)]"
        >
          {step.action}
        </Link>
      </div>

      <div className="px-3.5 pt-3.5 pb-3.5">
        <div className="text-[14.5px] font-semibold tracking-[-0.01em]">Finish setup</div>
        <p className="mt-[3px] text-[12.5px] leading-[1.45] text-ink-2">{step.reason}</p>
        <div className="mt-[11px] flex items-center gap-2.5">
          <ProgressRing done={progress.done} total={progress.total} />
          <span className="flex-1 text-[12.5px] text-ink-2 tabular-nums">
            {progress.done} of {progress.total}
          </span>
          <button
            type="button"
            className="text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
            onClick={dismiss}
          >
            Skip
          </button>
        </div>
      </div>
    </Panel>
  );
}
