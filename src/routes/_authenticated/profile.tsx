import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, MapPin, Pencil, Plus, Star, Trash2, UserRound } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createMyAddress,
  deleteMyAddress,
  getMyProfile,
  listMyAddresses,
  setDefaultAddress,
  updateMyAddress,
  updateMyProfile,
  type AddressInput,
} from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My account — FEABazaar" }] }),
  component: ProfilePage,
});

type Address = Awaited<ReturnType<typeof listMyAddresses>>[number];

const emptyAddress: AddressInput = {
  label: "",
  fullName: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  instructions: "",
  isDefault: false,
};

function ProfilePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const { data: addresses = [] } = useQuery({
    queryKey: ["my-addresses"],
    queryFn: () => listMyAddresses(),
  });

  const [details, setDetails] = useState({ fullName: "", phone: "" });
  useEffect(() => {
    if (profile) setDetails({ fullName: profile.fullName, phone: profile.phone });
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: () => updateMyProfile({ data: details }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState<AddressInput>(emptyAddress);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyAddress,
      fullName: profile?.fullName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      isDefault: addresses.length === 0,
    });
    setDialogOpen(true);
  };
  const openEdit = (a: Address) => {
    setEditing(a);
    setForm({
      label: a.label ?? "",
      fullName: a.full_name,
      email: a.email,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? "",
      city: a.city,
      state: a.state,
      zip: a.zip,
      instructions: a.instructions ?? "",
      isDefault: a.is_default,
    });
    setDialogOpen(true);
  };

  const saveAddr = useMutation({
    mutationFn: async () => {
      if (editing) return updateMyAddress({ data: { ...form, id: editing.id } });
      return createMyAddress({ data: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-addresses"] });
      setDialogOpen(false);
      toast.success(editing ? "Address updated" : "Address added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const removeAddr = useMutation({
    mutationFn: (id: string) => deleteMyAddress({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-addresses"] });
      toast.success("Address removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) => setDefaultAddress({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-addresses"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">My account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your details and delivery addresses.
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Profile details</h2>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveProfile.mutate();
          }}
        >
          <div>
            <Label>Email</Label>
            <Input value={profile?.email ?? ""} readOnly disabled className="mt-1 bg-muted" />
          </div>
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={details.fullName}
              onChange={(e) => setDetails({ ...details, fullName: e.target.value })}
              maxLength={100}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={details.phone}
              onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              maxLength={30}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Referral code</Label>
            <Input value={profile?.referralCode ?? ""} readOnly disabled className="mt-1 bg-muted" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Delivery addresses</h2>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Add address
          </Button>
        </div>

        {addresses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No saved addresses yet. Add one to speed up checkout.
          </p>
        ) : (
          <ul className="space-y-3">
            {addresses.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.label || a.full_name}</span>
                      {a.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {a.full_name} · {a.phone}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.zip}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!a.is_default && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => makeDefault.mutate(a.id)}
                        disabled={makeDefault.isPending}
                      >
                        <Star className="mr-1 h-4 w-4" /> Set default
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                      <Pencil className="mr-1 h-4 w-4" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm("Remove this address?")) removeAddr.mutate(a.id);
                      }}
                      disabled={removeAddr.isPending}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit address" : "Add address"}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveAddr.mutate();
            }}
          >
            <div>
              <Label htmlFor="al">Label (optional)</Label>
              <Input
                id="al"
                value={form.label ?? ""}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Home, Office…"
                maxLength={40}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Full name</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                  maxLength={100}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  maxLength={30}
                />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Address line 1</Label>
              <Input
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Address line 2 (optional)</Label>
              <Input
                value={form.line2 ?? ""}
                onChange={(e) => setForm({ ...form, line2: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>PIN</Label>
                <Input
                  value={form.zip}
                  onChange={(e) => setForm({ ...form, zip: e.target.value })}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  pattern="\d{6}"
                />
              </div>
            </div>
            <div>
              <Label>Delivery instructions (optional)</Label>
              <Textarea
                value={form.instructions ?? ""}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                maxLength={500}
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Set as default address
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveAddr.isPending}>
                {saveAddr.isPending ? "Saving…" : "Save address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}