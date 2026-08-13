import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Renders with the providers `(app)/layout.tsx` supplies in the real app.
 *
 * Any component reading data through the hooks in `src/hooks/` needs a
 * QueryClientProvider above it — without one, `useQuery` throws. Each call
 * gets its own QueryClient so cached data cannot leak between tests.
 */
export function renderWithProviders(ui: React.ReactNode, options?: RenderOptions): RenderResult {
  const queryClient = new QueryClient({
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

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
}
