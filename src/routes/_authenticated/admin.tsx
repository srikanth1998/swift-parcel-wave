import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Layout route gating every /admin/* page on a back-office role.
 *
 * The parent _authenticated route only checks that *someone* is signed in, so
 * without this any customer could load the back office and see it fail from the
 * inside. Mirrors the role check _distributor/route.tsx already does for
 * distributor users. The server functions each enforce roles too — this is the
 * routing layer catching it first, not a replacement for that.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) throw redirect({ to: "/auth" });

    const [{ data: isAdmin }, { data: isStaff }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userData.user.id, _role: "staff" }),
    ]);

    if (!isAdmin && !isStaff) throw redirect({ to: "/" });

    return { user: userData.user };
  },
  component: () => <Outlet />,
});
