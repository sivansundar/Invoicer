import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface RenderWithProvidersOptions extends RenderOptions {
  /**
   * Supply a `QueryClient` when the test itself needs to reach into it —
   * e.g. spying on `invalidateQueries` to prove a cache-invalidation path
   * actually ran. Omit it and a fresh client is created exactly as before;
   * every existing caller relies on that default. A supplied client is used
   * exactly as given — construct it with `testQueryClientOptions` below
   * (rather than a bare `new QueryClient()`) unless the test genuinely wants
   * react-query's real retry/backoff behaviour.
   */
  queryClient?: QueryClient;
}

/**
 * The options `renderWithProviders` builds its default client from —
 * exported so a test that supplies its own `QueryClient` (see the
 * `queryClient` option above) can opt into the same test-safe defaults
 * instead of react-query's real ones (`retry: 3` with backoff), which would
 * make a test that arms a failure sit through the backoff before seeing it.
 */
export const testQueryClientOptions = {
  queries: {
    // Tests assert on the failure a query surfaces, not on how many
    // attempts it took to get there. Retrying would make a test that
    // arms a failure wait for the backoff before seeing it.
    retry: false,
    // Every test seeds its own fixtures, so nothing should ever be
    // served from a previous render's cache.
    staleTime: 0,
  },
  mutations: { retry: false },
} as const;

/**
 * Renders with the providers `(app)/layout.tsx` supplies in the real app.
 *
 * Any component reading data through the hooks in `src/hooks/` needs a
 * QueryClientProvider above it — without one, `useQuery` throws. Each call
 * gets its own QueryClient by default, so cached data cannot leak between
 * tests — unless the caller opts in to sharing one via the `queryClient`
 * option, e.g. to spy on it from outside the render.
 */
export function renderWithProviders(
  ui: React.ReactNode,
  options?: RenderWithProvidersOptions
): RenderResult {
  const { queryClient: providedClient, ...renderOptions } = options ?? {};

  const queryClient =
    providedClient ?? new QueryClient({ defaultOptions: testQueryClientOptions });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    renderOptions
  );
}
