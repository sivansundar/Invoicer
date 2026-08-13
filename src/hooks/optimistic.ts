import type { QueryClient } from "@tanstack/react-query";

/**
 * Optimistic cache updates for the list-shaped queries in `src/hooks/`.
 *
 * Editing used to feel instant because reads were synchronous — a write went
 * to localStorage and the next render already had it. Against a network that
 * round trip is visible, and every screen would flicker through the old value
 * on its way to the new one. These apply the change to the cache first and
 * reconcile afterwards.
 *
 * The rollback is the part that matters. A mutation that shows success and
 * then leaves the wrong data on screen after a failure is worse than no
 * optimism at all: the user believes their invoice saved. Every builder here
 * snapshots the list before touching it and puts that snapshot back on error.
 */

interface OptimisticHandlers<TVariables> {
  onMutate: (variables: TVariables) => Promise<{ previous: unknown }>;
  onError: (error: unknown, variables: TVariables, context?: { previous: unknown }) => void;
  onSettled: () => Promise<void>;
}

function build<TItem, TVariables>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  apply: (list: TItem[], variables: TVariables) => TItem[]
): OptimisticHandlers<TVariables> {
  return {
    async onMutate(variables) {
      // Without this, a refetch already in flight can land after the
      // optimistic write and overwrite it with pre-mutation data — the
      // update appears to apply and then silently reverts.
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<TItem[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<TItem[]>(queryKey, apply(previous, variables));
      }
      return { previous };
    },

    onError(_error, _variables, context) {
      // `undefined` is a meaningful snapshot — it means nothing was cached
      // when the mutation started — but restoring it would wipe whatever
      // arrived since. Only a real previous list is put back.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },

    async onSettled() {
      // On success as well as failure: the server may have changed more than
      // the optimistic edit did (an `updated_at`, a normalised value), and
      // the cache should end up holding what was actually stored.
      await queryClient.invalidateQueries({ queryKey });
    },
  };
}

/** Replaces the matching item, or appends it when it is new. */
export function optimisticUpsert<TItem extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): OptimisticHandlers<TItem> {
  return build<TItem, TItem>(queryClient, queryKey, (list, item) => {
    const index = list.findIndex((existing) => existing.id === item.id);
    if (index < 0) return [...list, item];
    const next = list.slice();
    next[index] = item;
    return next;
  });
}

/** Drops the item with this id. */
export function optimisticRemove<TItem extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): OptimisticHandlers<string> {
  return build<TItem, string>(queryClient, queryKey, (list, id) =>
    list.filter((item) => item.id !== id)
  );
}
