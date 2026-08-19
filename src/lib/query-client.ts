import { QueryClient } from "@tanstack/react-query";

/**
 * Every cache key in the app, in one place.
 *
 * Keys are constants rather than inline arrays at call sites because a
 * typo in an inline key does not fail — it silently creates a second cache
 * entry that nothing ever invalidates, so a mutation appears to succeed
 * while the list it should have updated keeps serving stale rows. Grepping
 * for `queryKeys.brands` finds every reader and every invalidator; grepping
 * for `["brands"]` finds whichever spellings happened to be used.
 */
export const queryKeys = {
  brands: ["brands"] as const,
  clients: ["clients"] as const,
  invoices: ["invoices"] as const,
  templates: ["templates"] as const,
  plan: ["plan"] as const,
  emailQuota: ["email-quota"] as const,
  /** Reminder history for one invoice. */
  reminderSends: (invoiceId: string) => ["reminder-sends", invoiceId] as const,
  /** Reminder history for every invoice, fetched once for the queue. */
  reminderSendsAll: ["reminder-sends-all"] as const,
  /**
   * Signed URLs expire, so this key is per-path and the caller sets a
   * `staleTime` below the expiry. Keyed by object path rather than brand id
   * because the path is content-addressed — two brands sharing an image
   * share the URL, and a replaced logo is a different key rather than a
   * stale entry.
   */
  logoUrl: (path: string) => ["logo-url", path] as const,
};

/**
 * Builds a QueryClient with this app's defaults.
 *
 * A factory rather than a module-scope singleton: on the server a shared
 * client would be reused across concurrent requests, so one user's cached
 * rows could be served into another user's render. `QueryProvider` calls
 * this once per browser session via `useState`, which keeps a single client
 * per tab without ever sharing one between requests.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The data behind these queries is single-user and changes only
        // through this app's own mutations, which invalidate explicitly.
        // Refetching on every window focus would put a request on the wire
        // each time the user tabs back, to learn nothing.
        refetchOnWindowFocus: false,
        // Long enough that navigating between screens reads from cache
        // rather than refetching — the behaviour the synchronous
        // localStorage seam used to give for free, and what stops every
        // route change flashing a skeleton over data we already have.
        staleTime: 60_000,
        retry: 1,
      },
    },
  });
}
