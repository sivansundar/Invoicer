import { headers } from "next/headers";
import Link from "next/link";
import { LegacyExport } from "@/components/legacy-export";

export const metadata = { title: "Export your data · Invoicer" };

const APP_DOMAIN = "invoicejunkie.com";

/**
 * Clerk's production keys only work on invoicejunkie.com, so on any other
 * production address (the old invoicer-three.vercel.app, where pre-account
 * users' data lives) sign-in has to happen on the main domain.
 */
function signInUrl(host: string): string {
  const hostname = host.split(":")[0];
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const onApp = hostname === APP_DOMAIN || hostname.endsWith(`.${APP_DOMAIN}`);
  return local || onApp || process.env.VERCEL_ENV !== "production"
    ? "/sign-in"
    : `https://www.${APP_DOMAIN}/sign-in`;
}

// Public on purpose (see src/proxy.ts): people who used Invoicer before it
// had accounts must be able to get their data out without one.
export default async function ExportPage() {
  const host = (await headers()).get("host") ?? "";
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-5 p-6 text-foreground">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Export your data</h1>
      <p className="text-sm text-muted-foreground">
        Invoicer now keeps invoices in an account instead of in your browser. Anything you created
        before that change is still saved in this browser, and you can download all of it here.
      </p>
      <LegacyExport />
      <Link href={signInUrl(host)} className="text-[13px] underline underline-offset-2 w-fit">
        Sign in
      </Link>
    </main>
  );
}
