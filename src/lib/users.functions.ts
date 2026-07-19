import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ManagedRole = "super_admin" | "admin" | "user";

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string | null;
  role: ManagedRole | null;
  organisationIds: string[];
  appSlugs: string[];
  createdAt: string | null;
}

async function assertManager(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}) {
  const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  if (!isSuper && !isAdmin) throw new Error("Forbidden");
  return { isSuper: !!isSuper, isAdmin: !!isAdmin };
}

async function getCallerOrgIds(supabase: import("@supabase/supabase-js").SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("user_organisations")
    .select("organization_id")
    .eq("user_id", userId);
  return (data ?? []).map((r: { organization_id: string }) => r.organization_id);
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    const { isSuper } = await assertManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roles }, { data: orgs }, { data: apps }, authList] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("user_organisations").select("user_id, organization_id"),
        supabaseAdmin.from("user_app_access").select("user_id, app_slug"),
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      ]);

    const emailMap = new Map<string, { email: string; createdAt: string | null }>();
    for (const u of authList.data?.users ?? []) {
      emailMap.set(u.id, { email: u.email ?? "", createdAt: u.created_at ?? null });
    }
    const roleMap = new Map<string, ManagedRole>();
    for (const r of (roles ?? []) as Array<{ user_id: string; role: ManagedRole }>) {
      const existing = roleMap.get(r.user_id);
      const rank = (x: ManagedRole) => (x === "super_admin" ? 3 : x === "admin" ? 2 : 1);
      if (!existing || rank(r.role) > rank(existing)) roleMap.set(r.user_id, r.role);
    }
    const orgMap = new Map<string, string[]>();
    for (const o of (orgs ?? []) as Array<{ user_id: string; organization_id: string }>) {
      if (!orgMap.has(o.user_id)) orgMap.set(o.user_id, []);
      orgMap.get(o.user_id)!.push(o.organization_id);
    }
    const appMap = new Map<string, string[]>();
    for (const a of (apps ?? []) as Array<{ user_id: string; app_slug: string }>) {
      if (!appMap.has(a.user_id)) appMap.set(a.user_id, []);
      appMap.get(a.user_id)!.push(a.app_slug);
    }

    let list: ManagedUser[] = ((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => ({
      id: p.id,
      email: emailMap.get(p.id)?.email ?? "",
      displayName: p.display_name,
      role: roleMap.get(p.id) ?? null,
      organisationIds: orgMap.get(p.id) ?? [],
      appSlugs: appMap.get(p.id) ?? [],
      createdAt: emailMap.get(p.id)?.createdAt ?? null,
    }));

    if (!isSuper) {
      const callerOrgs = new Set(await getCallerOrgIds(context.supabase, context.userId));
      list = list.filter((u) => u.id === context.userId || u.organisationIds.some((o) => callerOrgs.has(o)));
    }
    return list.sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email));
  });

const roleEnum = z.enum(["super_admin", "admin", "user"]);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().trim().min(1).max(100),
  role: roleEnum,
  organisationIds: z.array(z.string().uuid()),
  appSlugs: z.array(z.string()),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isSuper } = await assertManager(context);
    if (data.role === "super_admin" && !isSuper) throw new Error("Only super admins can create super admins");

    let allowedOrgIds = data.organisationIds;
    if (!isSuper) {
      const callerOrgs = new Set(await getCallerOrgIds(context.supabase, context.userId));
      allowedOrgIds = allowedOrgIds.filter((o) => callerOrgs.has(o));
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Failed to create user");
    const userId = created.data.user.id;

    // handle_new_user trigger inserts profile + default role. Overwrite them.
    await supabaseAdmin.from("profiles").upsert({ id: userId, display_name: data.displayName });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    if (allowedOrgIds.length) {
      await supabaseAdmin
        .from("user_organisations")
        .insert(allowedOrgIds.map((organization_id) => ({ user_id: userId, organization_id })));
    }
    if (data.role === "user" && data.appSlugs.length) {
      await supabaseAdmin
        .from("user_app_access")
        .insert(data.appSlugs.map((app_slug) => ({ user_id: userId, app_slug })));
    }
    return { id: userId };
  });

const updateSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(100).optional(),
  role: roleEnum.optional(),
  organisationIds: z.array(z.string().uuid()).optional(),
  appSlugs: z.array(z.string()).optional(),
  password: z.string().min(12).optional().or(z.literal("")),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isSuper } = await assertManager(context);
    if (data.role === "super_admin" && !isSuper) throw new Error("Only super admins can assign super admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!isSuper) {
      // Admin can only edit users whose orgs overlap with theirs
      const [callerOrgs, { data: targetOrgs }] = await Promise.all([
        getCallerOrgIds(context.supabase, context.userId),
        supabaseAdmin.from("user_organisations").select("organization_id").eq("user_id", data.userId),
      ]);
      const callerSet = new Set(callerOrgs);
      const targetSet = new Set((targetOrgs ?? []).map((r: { organization_id: string }) => r.organization_id));
      const overlap = [...targetSet].some((o) => callerSet.has(o));
      if (!overlap && data.userId !== context.userId)
        throw new Error("Not permitted to edit this user");

      // Prevent admin from touching a super_admin
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", data.userId);
      if ((targetRoles ?? []).some((r: { role: string }) => r.role === "super_admin"))
        throw new Error("Cannot edit a super admin");
    }

    if (data.displayName !== undefined) {
      await supabaseAdmin.from("profiles").upsert({ id: data.userId, display_name: data.displayName });
    }
    if (data.password && data.password.length >= 12) {
      const r = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
      if (r.error) throw new Error(r.error.message);
    }
    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    }
    if (data.organisationIds) {
      let orgIds = data.organisationIds;
      if (!isSuper) {
        const callerOrgs = new Set(await getCallerOrgIds(context.supabase, context.userId));
        // Preserve existing orgs the admin can't see; only mutate their own scope
        const { data: existing } = await supabaseAdmin
          .from("user_organisations").select("organization_id").eq("user_id", data.userId);
        const existingIds = (existing ?? []).map((r: { organization_id: string }) => r.organization_id);
        const outsideAdmin = existingIds.filter((o) => !callerOrgs.has(o));
        orgIds = [...new Set([...outsideAdmin, ...orgIds.filter((o) => callerOrgs.has(o))])];
      }
      await supabaseAdmin.from("user_organisations").delete().eq("user_id", data.userId);
      if (orgIds.length) {
        await supabaseAdmin
          .from("user_organisations")
          .insert(orgIds.map((organization_id) => ({ user_id: data.userId, organization_id })));
      }
    }
    if (data.appSlugs) {
      await supabaseAdmin.from("user_app_access").delete().eq("user_id", data.userId);
      // Only meaningful when role is 'user'
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", data.userId);
      const isPlainUser = (roleRows ?? []).every((r: { role: string }) => r.role === "user");
      if (isPlainUser && data.appSlugs.length) {
        await supabaseAdmin
          .from("user_app_access")
          .insert(data.appSlugs.map((app_slug) => ({ user_id: data.userId, app_slug })));
      }
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isSuper } = await assertManager(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!isSuper) {
      const [callerOrgs, { data: targetOrgs }, { data: targetRoles }] = await Promise.all([
        getCallerOrgIds(context.supabase, context.userId),
        supabaseAdmin.from("user_organisations").select("organization_id").eq("user_id", data.userId),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      ]);
      if ((targetRoles ?? []).some((r: { role: string }) => r.role === "super_admin"))
        throw new Error("Cannot delete a super admin");
      const callerSet = new Set(callerOrgs);
      const overlap = (targetOrgs ?? []).some((r: { organization_id: string }) => callerSet.has(r.organization_id));
      if (!overlap) throw new Error("Not permitted to delete this user");
    }

    const r = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });