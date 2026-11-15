"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBrands } from "@/hooks/use-brands";
import { validateImportedBackup } from "@/lib/import-validation";
import { runMigration, saveBrand, saveClient, saveInvoice } from "@/lib/storage";

const DONE_KEY = "invoicer_uploaded";

function readLocal(key: string): unknown[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * One-time move of the data this browser saved before accounts existed.
 * Shown only while the account is empty and the browser still holds invoices
 * or brands. The browser copy is left untouched as a backup.
 */
export function LocalDataUpload() {
  const { brands } = useBrands();
  const [found, setFound] = useState<{ brands: number; invoices: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DONE_KEY)) return;
    const counts = {
      brands: readLocal("invoicer_brands").length,
      invoices: readLocal("invoicer_invoices").length,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (counts.brands + counts.invoices > 0) setFound(counts);
  }, []);

  if (!found || (brands.length > 0 && !busy)) return null;

  const upload = async () => {
    setBusy(true);
    // Idempotent; makes sure old-format records are upgraded before they leave.
    runMigration();
    const backup = validateImportedBackup({
      brands: readLocal("invoicer_brands"),
      clients: readLocal("invoicer_clients"),
      invoices: readLocal("invoicer_invoices"),
    });
    // Always ok: the argument is an object. Narrowing only.
    if (!backup.ok) return setBusy(false);

    let failed = backup.brands.skipped + backup.clients.skipped + backup.invoices.skipped;
    // Brands first: an invoice is only accepted into a brand that exists.
    for (const b of backup.brands.valid) if (!(await saveBrand(b))) failed++;
    for (const c of backup.clients.valid) if (!(await saveClient(c))) failed++;
    for (const i of backup.invoices.valid) if (!(await saveInvoice(i))) failed++;

    setBusy(false);
    if (failed === 0) {
      localStorage.setItem(DONE_KEY, "1");
      setFound(null);
      toast("Your invoices are now in your account");
    } else {
      toast(
        `${failed} record${failed === 1 ? "" : "s"} couldn't be uploaded. They are still saved in this browser.`
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted px-6 py-3 text-sm">
      <span className="flex-1">
        This browser holds {found.invoices} invoice{found.invoices === 1 ? "" : "s"} and{" "}
        {found.brands} brand{found.brands === 1 ? "" : "s"} from before you had an account.
      </span>
      <Button size="sm" onClick={upload} disabled={busy}>
        {busy ? "Uploading…" : "Upload to my account"}
      </Button>
    </div>
  );
}
