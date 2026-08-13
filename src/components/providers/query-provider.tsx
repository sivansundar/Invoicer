"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";

/**
 * Mounted once, in `(app)/layout.tsx`, so the cache outlives navigation
 * between in-app routes.
 *
 * The client is created inside `useState`'s initialiser rather than at
 * module scope: a module-scope client is one object shared by every render
 * on the server, which would leak one user's cached rows into another
 * user's response. `useState` also means it survives re-renders without
 * being rebuilt — constructing it inline in the body would throw the whole
 * cache away on every render of this component.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
