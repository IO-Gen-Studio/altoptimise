import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Pencil, Plus, Trash2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { UserFormDialog } from "@/components/admin/UserFormDialog";
import { AppShell } from "@/components/launcher/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useOrganisations } from "@/lib/data-store";
import { APPS, ROLE_LABEL, useLauncher } from "@/lib/launcher-context";
import {
  createUser,
  deleteUser as deleteUserFn,
  listUsers,
  updateUser,
  type ManagedUser,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const { persona } = useLauncher();
  const { isSuperAdmin, orgIds: callerOrgIds } = useAuth();
  const { organisations } = useOrganisations();

  const canManage = persona.role === "super_admin" || persona.role === "admin";

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) void refresh();
  }, [canManage]);

  const orgName = useMemo(() => {
    const m = new Map(organisations.map((o) => [o.id, o.organization_name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [organisations]);
  const appName = useMemo(() => {
    const m = new Map(APPS.map((a) => [a.slug, a.name]));
    return (slug: string) => m.get(slug) ?? slug;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!canManage) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">Admin access required</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your role ({ROLE_LABEL[persona.role]}) doesn't include user management.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/">Return to launcher</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <header className="mb-6 flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10">
            <UsersIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground">
              Manage accounts, roles, organisation access and mini-app permissions.
            </p>
          </div>
        </header>

        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                placeholder="Search by name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="md:max-w-sm"
              />
              <div className="md:ml-auto">
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add user
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Organisations</TableHead>
                    <TableHead>App access</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No users found.</TableCell></TableRow>
                  ) : filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.displayName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "super_admin" ? "default" : "secondary"}>
                          {u.role ? ROLE_LABEL[u.role] : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.organisationIds.length === 0
                            ? <span className="text-xs text-muted-foreground">—</span>
                            : u.organisationIds.map((o) => (
                                <Badge key={o} variant="outline" className="text-xs">{orgName(o)}</Badge>
                              ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.role === "super_admin" || u.role === "admin" ? (
                          <Badge variant="outline" className="text-xs">All apps</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.appSlugs.length === 0
                              ? <span className="text-xs text-muted-foreground">—</span>
                              : u.appSlugs.map((s) => (
                                  <Badge key={s} variant="outline" className="text-xs">{appName(s)}</Badge>
                                ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditUser(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteTarget(u)}
                            disabled={u.id === persona.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <UserFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        organisations={organisations.map((o) => ({ id: o.id, name: o.organization_name }))}
        callerIsSuper={isSuperAdmin}
        callerOrgIds={callerOrgIds}
        onSubmit={async (input) => {
          await createUser({
            data: {
              email: input.email,
              password: input.password,
              displayName: input.displayName,
              role: input.role,
              organisationIds: input.organisationIds,
              appSlugs: input.appSlugs,
            },
          });
          toast.success("User created");
          await refresh();
        }}
      />

      <UserFormDialog
        open={!!editUser}
        onOpenChange={(v) => !v && setEditUser(null)}
        mode="edit"
        user={editUser}
        organisations={organisations.map((o) => ({ id: o.id, name: o.organization_name }))}
        callerIsSuper={isSuperAdmin}
        callerOrgIds={callerOrgIds}
        onSubmit={async (input) => {
          if (!editUser) return;
          await updateUser({
            data: {
              userId: editUser.id,
              displayName: input.displayName,
              role: input.role,
              organisationIds: input.organisationIds,
              appSlugs: input.appSlugs,
              password: input.password || undefined,
            },
          });
          toast.success("User updated");
          await refresh();
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.displayName ?? deleteTarget?.email} and all their access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteUserFn({ data: { userId: deleteTarget.id } });
                  toast.success("User deleted");
                  setDeleteTarget(null);
                  await refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}