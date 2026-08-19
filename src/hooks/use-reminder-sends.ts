"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { getReminderSendsByInvoice } from "@/lib/storage";

const EMPTY = new Map<string, never[]>();

/**
 * Reminder history for every invoice in the org, in one query.
 *
 * One query rather than one per invoice because the follow-ups screen renders
 * the whole queue at once, and per-row fetching there is a request per unpaid
 * invoice on every visit. RLS scopes it to the caller's org, so "every
 * invoice" is never more than one workspace's worth.
 */
export function useReminderSends() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.reminderSendsAll,
    queryFn: getReminderSendsByInvoice,
  });
  return { sendsByInvoice: data ?? (EMPTY as never), loading: isPending };
}
