import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/update-password")({
  // The recovery token arrives in the URL fragment, which only exists in the
  // browser — there is nothing for the server to render.
  ssr: false,
  head: () => ({ meta: [{ title: "Set a new password — FEABazaar" }] }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  // null = still checking, false = no recovery session (link expired/reused)
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    // supabase-js consumes the recovery fragment on load and emits
    // PASSWORD_RECOVERY. Check for an existing session too, in case that
    // happened before this component mounted.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      setReady((current) => current ?? Boolean(data.session));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setLoading(false);
    }
  };

  if (ready === null) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-muted-foreground">…</div>;
  }

  if (ready === false) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-2xl font-semibold">This link has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Password reset links can only be used once, and expire after a short while.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/auth">Request a new link</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8">
        <h1 className="font-display text-2xl font-semibold text-center">Set a new password</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Choose a password you haven't used before.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              required
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              required
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
