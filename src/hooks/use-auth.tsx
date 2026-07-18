import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  display_name: string | null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<"super_admin" | "admin" | "user" | null>(null);
  const [appAccess, setAppAccess] = useState<string[]>([]);
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      setAppAccess([]);
      setOrgIds([]);
      setProfile(null);
      return;
    }
    // Load role + profile in parallel.
    void (async () => {
      const [{ data: roles }, { data: prof }, { data: access }, { data: memberships }] =
        await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", session.user.id),
          supabase
            .from("profiles")
            .select("id, display_name")
            .eq("id", session.user.id)
            .maybeSingle(),
          supabase.from("user_app_access").select("app_slug").eq("user_id", session.user.id),
          supabase.from("user_organisations").select("organization_id").eq("user_id", session.user.id),
        ]);
      const r = roles?.find((x) => x.role === "super_admin")
        ? "super_admin"
        : roles?.find((x) => x.role === "admin")
        ? "admin"
        : roles?.find((x) => x.role === "user")
        ? "user"
        : null;
      setRole(r);
      setAppAccess((access ?? []).map((a) => a.app_slug));
      setOrgIds((memberships ?? []).map((m) => m.organization_id));
      setProfile((prof as Profile) ?? { id: session.user.id, display_name: null });
    })();
  }, [session]);

  const isAdmin = role === "super_admin" || role === "admin";
  const isSuperAdmin = role === "super_admin";
  return { session, user: session?.user ?? null, ready, isAdmin, isSuperAdmin, role, profile, appAccess, orgIds };
}

export type { User };