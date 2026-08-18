"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Clock, LifeBuoy, Mail } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/primitives";

/** Google's mark. Inline rather than an asset so it needs no network fetch. */
function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 11v2.8h6.5a5.6 5.6 0 0 1-2.4 3.7l3.9 3a9.9 9.9 0 0 0 3-7.4c0-.7-.1-1.4-.2-2z"
        fill="#4285F4"
      />
      <path
        d="M12 22c3.2 0 5.9-1 7.9-2.8l-3.9-3A6.2 6.2 0 0 1 12 17.2a6.1 6.1 0 0 1-5.8-4.2l-4 3.1A10 10 0 0 0 12 22"
        fill="#34A853"
      />
      <path d="M6.2 13a6 6 0 0 1 0-3.8l-4-3.1a10 10 0 0 0 0 9z" fill="#FBBC05" />
      <path
        d="M12 6.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A10 10 0 0 0 2.2 6.1l4 3.1A6.1 6.1 0 0 1 12 6.8"
        fill="#EA4335"
      />
    </svg>
  );
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ink">
        <Check className="size-3 text-canvas" strokeWidth={3} />
      </span>
      <span className="text-[14.5px] text-ink-2">{children}</span>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  // Separate from `pending` above: the email form and this button can be in
  // flight independently, and one shared flag would disable the form the
  // user is still typing into.
  const [googlePending, setGooglePending] = useState(false);

  const callbackUrl = () =>
    `${window.location.origin}/callback?next=${encodeURIComponent(next)}`;

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setPending(false);

    if (error) {
      toast(error.message);
      return;
    }
    setSent(true);
  }

  async function handleGoogle() {
    setGooglePending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    // Deliberately not cleared on success: a resolved promise means the
    // browser is about to navigate away, and re-enabling the button in the
    // frames before that happens invites a second OAuth flow.
    if (error) {
      setGooglePending(false);
      toast(error.message);
    }
  }

  if (sent) {
    return (
      <div className="rounded-card border bg-surface p-5 shadow-[var(--shadow-card)]">
        <span className="inline-flex size-10 items-center justify-center rounded-[11px] bg-green">
          <Mail className="size-5 text-white" />
        </span>
        <p className="mt-3.5 text-[15px] leading-relaxed text-ink-2">
          Check your inbox — we sent a sign-in link to{" "}
          <span className="font-medium text-ink">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <>
      {/*
        Google first: it is one click, where the magic link means leaving the
        app for an inbox and coming back. The order is the whole change — both
        paths call exactly what they called before.
      */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogle}
        disabled={googlePending}
        className="h-12 w-full gap-3 rounded-xl text-[15px]"
      >
        <GoogleMark />
        {googlePending ? "Redirecting…" : "Continue with Google"}
      </Button>

      <div className="my-5.5 flex items-center gap-3.5">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12.5px] text-ink-3">or use email</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
        <div className="flex flex-col gap-[7px]">
          <Label htmlFor="email" className="text-[13.5px]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 rounded-xl bg-surface text-[14.5px]"
          />
        </div>
        <Button
          type="submit"
          disabled={pending || email.length === 0}
          className="h-12 w-full gap-2.5 rounded-xl text-[15px]"
        >
          <Mail className="size-[18px]" />
          {pending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="mt-4.5 flex items-start gap-2.5 rounded-xl border bg-surface p-3.5">
        <Clock className="mt-px size-4 shrink-0 text-ink-3" />
        <span className="text-[13px] leading-relaxed text-ink-2">
          The link is good for one hour and signs you in on this device. Signing in on your phone?
          Open the email there instead.
        </span>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh">
      {/* LEFT — the callout */}
      <div className="relative hidden min-w-0 flex-1 flex-col overflow-hidden p-11 lg:flex xl:p-14">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(90% 80% at 8% 6%, oklch(0.88 0.075 235) 0%, transparent 58%),
              radial-gradient(85% 75% at 96% 4%, oklch(0.94 0.085 92) 0%, transparent 60%),
              radial-gradient(110% 95% at 78% 100%, oklch(0.90 0.065 26) 0%, transparent 62%),
              radial-gradient(100% 90% at 20% 92%, oklch(0.91 0.055 300) 0%, transparent 60%),
              oklch(0.955 0.02 250)`,
          }}
        />
        {/* The same fine grain the setup card uses, so the panel is not a flat wash. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "5px 5px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-[11px] bg-[oklch(0.19_0.004_70)] text-base font-semibold text-white">
            I
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.015em] text-[oklch(0.19_0.004_70)]">
            Invoicer
          </span>
        </div>

        <div className="relative flex max-w-[520px] flex-1 flex-col justify-center">
          <h2 className="font-display text-[54px] leading-[1.04] tracking-[-0.018em] text-[oklch(0.19_0.004_70)] text-pretty">
            Bill under every name you work as.
          </h2>
          <p className="mt-5 max-w-[440px] text-[16.5px] leading-relaxed text-[oklch(0.32_0.008_70)] text-pretty">
            Keep each business separate — its own logo, GST number, bank details and invoice series
            — and run them all from one dashboard.
          </p>

          <div className="mt-8 flex flex-col gap-3.5 [&_span]:!text-[oklch(0.32_0.008_70)]">
            <Tick>A frozen brand snapshot on every invoice</Tick>
            <Tick>Print-ready PDFs with your bank details</Tick>
            <Tick>Reminders that chase late payers for you</Tick>
          </div>

          {/* Proof in the product's own vocabulary rather than a stock quote. */}
          <div className="mt-10 max-w-[392px] rounded-[15px] border border-white/70 bg-white p-[17px_19px] shadow-[0_10px_28px_oklch(0.19_0.02_250_/_0.10)]">
            <div className="flex items-center gap-2.5">
              <span className="size-[9px] shrink-0 rounded-full bg-blue" />
              <span className="text-[13.5px] text-[oklch(0.32_0.008_70)]">Sundar Consulting</span>
              <span className="flex-1" />
              <StatusPill status="paid" />
            </div>
            <div className="mt-3.5 flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] text-[oklch(0.5_0.008_70)]">SC-2026-041</div>
                <div className="mt-0.5 text-[26px] font-semibold tracking-[-0.03em] text-[oklch(0.19_0.004_70)] tabular-nums">
                  ₹1,20,000
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12.5px] text-[oklch(0.5_0.008_70)]">Settled in</div>
                <div className="mt-0.5 text-[14.5px] font-medium text-[oklch(0.19_0.004_70)] tabular-nums">
                  11 days
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative text-[13px] text-[oklch(0.5_0.008_70)]">
          Your data lives in your own account, in Postgres.
        </div>
      </div>

      {/* RIGHT — sign in */}
      <div className="flex min-w-0 flex-1 flex-col border-l bg-canvas p-8 sm:p-11 xl:p-14">
        <div className="flex items-center justify-end">
          <span className="text-[13.5px] text-ink-3">
            New here? The same button makes your account.
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-[396px]">
            <h1 className="font-display text-4xl leading-none tracking-[-0.018em]">Sign in</h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
              One click with Google, or a link in your inbox. No password to remember.
            </p>

            <div className="mt-7">
              {/* useSearchParams needs a Suspense boundary during prerender. */}
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>

            <p className="mt-6 text-center text-[12.5px] leading-relaxed text-ink-3">
              By continuing you agree to the{" "}
              <a href="#" className="underline underline-offset-2">
                Terms
              </a>{" "}
              and{" "}
              <a href="#" className="underline underline-offset-2">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-[13px] text-ink-3">
          <LifeBuoy className="size-[15px]" />
          Trouble signing in?
        </div>
      </div>
    </main>
  );
}
