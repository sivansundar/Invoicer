"use client";

import { createContext, useContext } from "react";

type SessionContextValue = {
  email: string | undefined;
};

// No provider (e.g. a page rendered directly in a unit test, bypassing
// (app)/layout.tsx) is a valid, common case — default to "no user" rather
// than throwing, so callers don't need to wrap every test render.
const SessionContext = createContext<SessionContextValue>({ email: undefined });

/**
 * Carries the already-fetched signed-in user's email down from
 * (app)/layout.tsx (which calls getUser() once per navigation as part of
 * its auth guard) so client components like UserMenu don't need to
 * re-fetch it themselves.
 */
export function SessionProvider({
  email,
  children,
}: {
  email: string | undefined;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={{ email }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
