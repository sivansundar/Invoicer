import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

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

// Components render outside ClerkProvider in tests; give them a signed-in user.
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: { fullName: "Test User", primaryEmailAddress: { emailAddress: "test@example.com" } },
  }),
  UserButton: () => null,
}));
