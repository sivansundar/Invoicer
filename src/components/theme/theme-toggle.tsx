"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

const emptySubscribe = () => () => {};

// The resolved theme is only known on the client (localStorage / matchMedia),
// so the server always renders "light". useSyncExternalStore lets us ask
// "have we hydrated yet?" without setState-in-an-effect: it returns the
// server snapshot (false) for the first client render to match the SSR HTML,
// then React resyncs to the client snapshot (true) right after hydration.
// Prevents the hydration mismatch without the cascading-render pattern that
// `useEffect(() => setMounted(true), [])` produces.
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const mounted = useIsMounted();

  const isDark = mounted && theme === "dark";
  const label = !mounted
    ? "Toggle theme"
    : isDark
      ? "Switch to light mode"
      : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
