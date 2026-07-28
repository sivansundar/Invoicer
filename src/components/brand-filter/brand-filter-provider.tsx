"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "invoicer_brand_filter";

type BrandFilterContextValue = {
  brandId: string | null;
  setBrandId: (id: string | null) => void;
};

const BrandFilterContext = createContext<BrandFilterContextValue | null>(null);

export function BrandFilterProvider({ children }: { children: React.ReactNode }) {
  // The persisted filter is only known on the client, so both the server
  // render and the first client render use "All brands" (null). Reading the
  // stored value happens after mount, inside an effect, so the first client
  // render always matches the server HTML — see theme-provider.tsx / theme-toggle.tsx
  // for the same hydration-mismatch precedent this repo already had to fix.
  const [brandId, setBrandIdState] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setBrandIdState(stored);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setBrandId = (id: string | null) => {
    setBrandIdState(id);
    if (id) {
      window.localStorage.setItem(STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <BrandFilterContext.Provider value={{ brandId, setBrandId }}>
      {children}
    </BrandFilterContext.Provider>
  );
}

export function useBrandFilter() {
  const context = useContext(BrandFilterContext);

  if (!context) {
    throw new Error("useBrandFilter must be used within a BrandFilterProvider");
  }

  return context;
}
