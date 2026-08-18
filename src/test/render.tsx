import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface RenderWithProvidersOptions extends RenderOptions {
  /**
   * Supply a `QueryClient` when the test itself needs to reach into it —
   * e.g. spying on `invalidateQueries` to prove a cache-invalidation path
   * actually ran. Omit it and a fresh client is created exactly as before;
   * every existing caller relies on that default, so it must keep matching
   * this function's own defaults below rather than plain `new
   * QueryClient()`.
   */
  queryClient?: QueryClient;
}

/**
 * Renders with the providers `(app)/layout.tsx` supplies in the real app.
 *
 * Any component reading data through the hooks in `src/hooks/` needs a
 * QueryClientProvider above it — without one, `useQuery` throws. Each call
 * gets its own QueryClient so cached data cannot leak between tests.
 */
export function renderWithProviders(
  ui: React.ReactNode,
  options?: RenderWithProvidersOptions
): RenderResult {
  const { queryClient: providedClient, ...renderOptions } = options ?? {};

  const queryClient =
    providedClient ??
    new QueryClient({
      defaultOptions: {
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
      },
    });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    renderOptions
  );
}
