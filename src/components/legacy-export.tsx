"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { downloadBackup, readLegacyBackup, type Backup } from "@/lib/backup";

function useLegacyBackup(): Backup | null | undefined {
  // undefined while unknown (server render, first paint); null when there is nothing.
  const [backup, setBackup] = useState<Backup | null | undefined>(undefined);
  useEffect(() => {
    const found = readLegacyBackup();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setBackup(found.brands.length + found.invoices.length + found.clients.length > 0 ? found : null);
  }, []);
  return backup;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The /export page: download what this browser holds, no account needed. */
export function LegacyExport() {
  const backup = useLegacyBackup();

  if (backup === undefined) return null;
  if (backup === null) {
    return (
      <p className="text-sm text-muted-foreground">
        No invoices are saved in this browser. If you used Invoicer in a different browser or on a
        different device, open this page there.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        This browser holds {count(backup.invoices.length, "invoice")}, {count(backup.brands.length, "brand")}{" "}
        and {count(backup.clients.length, "client")}.
      </p>
      <Button onClick={() => downloadBackup(backup)} className="w-fit">
        Download my data
      </Button>
      <p className="text-[13px] text-muted-foreground">
        The file stays on your device. Nothing is uploaded, and your data is not removed from this
        browser. Once you have an account, you can bring it in under Reports → Import.
      </p>
    </div>
  );
}

/** On the sign-in page: tells a returning user their old data is still here. */
export function LegacyExportNotice() {
  const backup = useLegacyBackup();
  if (!backup) return null;
  return (
    <p className="max-w-[400px] text-center text-sm text-muted-foreground">
      Used Invoicer before it had accounts? What you created is still saved in this browser.{" "}
      <Link href="/export" className="underline underline-offset-2 text-foreground">
        Download your data
      </Link>
    </p>
  );
}
