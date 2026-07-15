import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_distributor")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) throw redirect({ to: "/auth" });

    // get_my_distributor_id() is a SECURITY DEFINER RPC scoped to the
    // caller's own user_roles row — returns null if they don't hold the
    // distributor role, in which case this section isn't for them.
    const { data: distributorId, error: rpcError } = await supabase.rpc("get_my_distributor_id");
    if (rpcError || !distributorId) throw redirect({ to: "/" });

    return { user: userData.user, distributorId };
  },
  component: () => <Outlet />,
});
