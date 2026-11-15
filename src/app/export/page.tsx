import Link from "next/link";
import { LegacyExport } from "@/components/legacy-export";

export const metadata = { title: "Export your data · Invoicer" };

// Public on purpose (see src/proxy.ts): people who used Invoicer before it
// had accounts must be able to get their data out without one.
export default function ExportPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-5 p-6 text-foreground">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Export your data</h1>
      <p className="text-sm text-muted-foreground">
        Invoicer now keeps invoices in an account instead of in your browser. Anything you created
        before that change is still saved in this browser, and you can download all of it here.
      </p>
      <LegacyExport />
      <Link href="/sign-in" className="text-[13px] underline underline-offset-2 w-fit">
        Sign in
      </Link>
    </main>
  );
}
