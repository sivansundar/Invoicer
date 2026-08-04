import { toast } from "sonner";

/**
 * A full `localStorage` is a `QuotaExceededError` `DOMException` in every
 * browser this app targets (Chromium/WebKit use that name directly; older
 * Firefox uses `NS_ERROR_DOM_QUOTA_REACHED`). Narrowly matched — an
 * unrelated exception (a bug, not a full quota) is deliberately left to
 * propagate rather than folded into the same "storage is full" message.
 */
export function isQuotaExceededError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

/**
 * Every direct `localStorage.setItem` call in this app funnels through here
 * — `storage.ts`'s four collection keys and the plan key, and `migrate.ts`'s
 * one-time v1→v2 write. Both modules need the exact same quota detection and
 * user-facing affordance, and `migrate.ts` cannot import `storage.ts` (the
 * dependency only runs one way: `storage.ts` already imports `migrate.ts`'s
 * `runMigration`), so this is the shared leaf both sides import instead of
 * each keeping its own copy of the same logic to drift out of sync.
 *
 * Without this, a full quota threw `localStorage.setItem` uncaught: every
 * subsequent save would fail the same way, with nothing ever telling the
 * user their change wasn't actually persisted. `toast` (this app's one
 * user-facing failure affordance, already used throughout the component
 * layer) is the only way a `lib` module like this one can surface that.
 */
export function writeLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      toast(
        "Storage is full — this change wasn't saved. Free up space (delete unused invoices, or remove a brand logo) and try again.",
      );
      return false;
    }
    throw err;
  }
}
