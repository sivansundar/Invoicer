import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { SessionProvider } from "@/components/layout/session-provider";

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

  // Threaded through context (rather than re-fetched client-side by
  // UserMenu) because pages under (app)/ each wrap themselves in <Shell>
  // instead of sharing it via this layout — Shell/AppSidebar/UserMenu
  // unmount and remount on every in-app navigation, and a client-side
  // getUser() call on every mount would both flash a loading placeholder
  // and duplicate the auth check this layout already just made.
  return <SessionProvider email={data.user.email}>{children}</SessionProvider>;
}
