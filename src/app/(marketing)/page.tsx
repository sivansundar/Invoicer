import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">Invoicer</h1>
      <p className="text-sm text-muted-foreground">
        Invoices, clients and brands — without the spreadsheet.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Sign in
      </Link>
    </main>
  );
}
