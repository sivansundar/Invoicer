"use client";

import { useState } from "react";
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
  useState(() => hydrate(data));
  return children;
}
