import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

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

  return <>{children}</>;
}
