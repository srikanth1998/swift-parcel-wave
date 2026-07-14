import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ...(typeof search.ref === "string" ? { ref: search.ref } : {}),
  }),
  head: () => ({ meta: [{ title: "Sign in — FEABazaar" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const initialReferralCode = search.ref?.trim().toUpperCase() ?? "";
  const [mode, setMode] = useState<"sign_in" | "sign_up">(
    initialReferralCode ? "sign_up" : "sign_in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "sign_up") {
        const normalizedReferralCode = referralCode.trim().toUpperCase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              ...(normalizedReferralCode ? { referral_code: normalizedReferralCode } : {}),
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created. Check your email to confirm your account.");
          setMode("sign_in");
          return;
        }
        toast.success("Account created. You can start shopping.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err) {
      // A signup rejected by the database (e.g. the referral-code validation
      // trigger) surfaces from GoTrue as an opaque "Database error saving new
      // user" / empty-body error. Map it to something actionable.
      const raw = err instanceof Error ? err.message : "";
      const opaque = !raw || raw === "{}" || /database error/i.test(raw);
      if (mode === "sign_up" && opaque && referralCode.trim()) {
        toast.error("Sign-up failed. Please double-check your referral code — it may be invalid.");
      } else if (opaque) {
        toast.error("Something went wrong. Please try again.");
      } else {
        toast.error(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8">
        <h1 className="font-display text-2xl font-semibold text-center">
          {mode === "sign_in" ? "Welcome back" : "Create an account"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "sign_in"
            ? "Sign in to your FEABazaar account"
            : "Sign up to track your orders"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "sign_up" && (
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          {mode === "sign_up" && (
            <div>
              <Label htmlFor="referralCode">Referral code</Label>
              <Input
                id="referralCode"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Optional"
                autoCapitalize="characters"
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : mode === "sign_in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "sign_in" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
          >
            {mode === "sign_in" ? "Create an account" : "Sign in"}
          </button>
        </div>
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Or{" "}
          <Link to="/shop" className="text-primary hover:underline">
            continue as a guest
          </Link>
        </div>
      </div>
    </div>
  );
}
