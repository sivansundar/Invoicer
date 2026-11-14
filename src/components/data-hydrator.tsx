"use client";

import { useEffect, useState } from "react";
import { hydrate } from "@/lib/storage";
import type { Brand, Client, Invoice } from "@/lib/types";

/** Hands the server-loaded data to the in-memory store before any child reads it. */
export function DataHydrator({
  data,
  children,
}: {
  data: { brands: Brand[]; clients: Client[]; invoices: Invoice[] };
  children: React.ReactNode;
}) {
  // Filled during the first render so children never see an empty store, then
  // announced from an effect, which also picks up data from a later reload.
  useState(() => hydrate(data, false));
  useEffect(() => hydrate(data), [data]);
  return children;
}
