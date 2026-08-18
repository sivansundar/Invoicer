"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { buildBackup } from "./import-export";

/**
 * Downloads a full backup as JSON.
 *
 * Lifted out of `import-export.tsx` so the site header's Export button and the
 * Reports screen run the same code rather than two copies of the same
 * Blob-and-anchor dance that could drift on filename or error handling.
 *
 * `pending` exists because `buildBackup()` reads every table: on a large
 * account the click has no visible effect for long enough to invite a second
 * one, which would build and download the file twice.
 */
export function useExportBackup(): { exportBackup: () => void; pending: boolean } {
  const [pending, setPending] = useState(false);

  const exportBackup = useCallback(() => {
    if (pending) return;
    setPending(true);

    void (async () => {
      try {
        const backup = await buildBackup();
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `invoicer-backup-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch (error: unknown) {
        toast(
          error instanceof Error
            ? `Export failed — ${error.message}`
            : "Export failed. Nothing was downloaded."
        );
      } finally {
        setPending(false);
      }
    })();
  }, [pending]);

  return { exportBackup, pending };
}
