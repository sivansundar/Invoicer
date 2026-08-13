import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { SessionProvider } from "@/components/layout/session-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Shell } from "@/components/layout/shell";

/**
 * Defence in depth behind proxy.ts. The proxy already redirects anonymous
 * visitors, but a proxy matcher is a pattern and patterns can be wrong;
 * this check is the one that runs in the same place the data does.
 *
 * getUser() rather than getClaims() because this gate should notice a
 * deleted or banned user immediately, and it runs once per navigation
 * rather than on every asset request.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) redirect("/login");

  // Shell lives here rather than inside each page so it mounts once and
  // stays mounted across in-app navigation. When every page wrapped itself,
  // Shell/AppSidebar/UserMenu and both context providers unmounted and
  // remounted on every route change — which also threw away the query cache's
  // subscribers, so each navigation refetched data the cache already held.
  //
  // QueryProvider sits outside Shell because the cache must outlive anything
  // Shell renders, and the session is threaded through context (rather than
  // re-fetched client-side by UserMenu) so the sidebar never duplicates the
  // auth check this layout has already made.
  return (
    <SessionProvider email={data.user.email}>
      <QueryProvider>
        <Shell>{children}</Shell>
      </QueryProvider>
    </SessionProvider>
  );
}
