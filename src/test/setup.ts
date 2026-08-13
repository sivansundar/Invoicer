import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// src/lib/supabase/client.ts throws synchronously without
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, which
// aren't set in the unit test environment. Any client component under
// (app)/ can reach it (e.g. UserMenu's sign-out), so mock it globally
// rather than rediscovering the same boilerplate in every test file that
// happens to render one. A test that wants to assert on auth behaviour can
// still override this with its own vi.mock("@/lib/supabase/client", ...).
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }),
}));

// jsdom does not implement matchMedia. `useIsMobile` (src/hooks/use-mobile.ts)
// calls it in an effect, so any test that renders the sidebar — i.e. anything
// mounting Shell — throws without this. Reports "not mobile", which is the
// desktop layout the assertions in those tests are written against.
Object.defineProperty(window, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
  writable: true,
  configurable: true,
});

const storage = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  },
  configurable: true,
});
