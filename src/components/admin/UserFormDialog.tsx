import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPS, type Role } from "@/lib/launcher-context";
import type { ManagedUser } from "@/lib/users.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  user?: ManagedUser | null;
  organisations: { id: string; name: string }[];
  callerIsSuper: boolean;
  callerOrgIds: string[];
  onSubmit: (input: {
    email: string;
    displayName: string;
    role: Role;
    organisationIds: string[];
    appSlugs: string[];
    password: string;
  }) => Promise<void>;
}

function generatePassword(length = 16) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i] % set.length];
  const chars = [pick(upper, 0), pick(lower, 1), pick(digits, 2), pick(symbols, 3)];
  for (let i = 4; i < length; i++) chars.push(all[bytes[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(bytes[i % length] % (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function UserFormDialog({
  open, onOpenChange, mode, user, organisations, callerIsSuper, callerOrgIds, onSubmit,
}: Props) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [appSlugs, setAppSlugs] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && user) {
      setEmail(user.email);
      setDisplayName(user.displayName ?? "");
      setRole((user.role ?? "user") as Role);
      setOrgIds(user.organisationIds);
      setAppSlugs(user.appSlugs);
      setPassword("");
    } else {
      setEmail("");
      setDisplayName("");
      setRole("user");
      setOrgIds([]);
      setAppSlugs([]);
      setPassword(generatePassword());
    }
    setShowPassword(false);
  }, [open, mode, user]);

  const visibleOrgs = useMemo(
    () => (callerIsSuper ? organisations : organisations.filter((o) => callerOrgIds.includes(o.id))),
    [organisations, callerIsSuper, callerOrgIds],
  );

  const submit = async () => {
    if (!displayName.trim()) return toast.error("Display name is required");
    if (mode === "create") {
      if (!email.includes("@")) return toast.error("Valid email is required");
      if (password.length < 12) return toast.error("Password must be at least 12 characters");
    }
    if (password && password.length < 12)
      return toast.error("Password must be at least 12 characters");

    setSubmitting(true);
    try {
      await onSubmit({ email, displayName: displayName.trim(), role, organisationIds: orgIds, appSlugs, password });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    toast.success("Password copied");
  };

  const appAccessDisabled = role !== "user";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : "Edit user"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new account and assign access."
              : "Update roles and access assignments."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={mode === "edit"}
            />
          </div>

          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {callerIsSuper && <SelectItem value="super_admin">Super Admin</SelectItem>}
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Organisations</Label>
            <ScrollArea className="h-32 rounded-md border p-2">
              <div className="space-y-1.5">
                {visibleOrgs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No organisations available.</p>
                ) : (
                  visibleOrgs.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={orgIds.includes(o.id)}
                        onCheckedChange={(v) =>
                          setOrgIds((prev) => (v ? [...prev, o.id] : prev.filter((x) => x !== o.id)))
                        }
                      />
                      {o.name}
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="grid gap-2">
            <Label>App access</Label>
            {appAccessDisabled ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {role === "super_admin" ? "Super admins" : "Admins"} have access to all mini-apps.
              </p>
            ) : (
              <div className="space-y-1.5 rounded-md border p-2">
                {APPS.map((a) => (
                  <label key={a.slug} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={appSlugs.includes(a.slug)}
                      onCheckedChange={(v) =>
                        setAppSlugs((prev) => (v ? [...prev, a.slug] : prev.filter((x) => x !== a.slug)))
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">
              Password
              {mode === "edit" && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Leave blank to keep current password
                </span>
              )}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "edit" ? "••••••••" : ""}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} aria-label="Generate password">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={copyPassword} aria-label="Copy password" disabled={!password}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}