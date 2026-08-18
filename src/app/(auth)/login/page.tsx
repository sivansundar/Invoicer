"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <p className="text-sm text-muted-foreground">
        Check your inbox — we sent a sign-in link to{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" disabled={pending || email.length === 0}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" onClick={handleGoogle} disabled={googlePending}>
        {googlePending ? "Redirecting…" : "Continue with Google"}
      </Button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Sign in to Invoicer</CardTitle>
        </CardHeader>
        <CardContent>
          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
