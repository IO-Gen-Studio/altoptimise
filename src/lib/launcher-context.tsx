import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useOrganisations, type Organisation } from "./data-store";
import { useAuth } from "@/hooks/use-auth";

export type Role = "super_admin" | "data_analyst" | "viewer";

export interface Org {
  id: string;
  name: string;
  location: string;
}

export interface Persona {
  id: string;
  name: string;
  role: Role;
  email: string;
  initials: string;
}

export const ORGS: Org[] = [
  { id: "haven-holidays", name: "Haven Holidays", location: "United Kingdom" },
  { id: "methodist-schools", name: "Methodist Independent School's Trust", location: "London, UK" },
  { id: "io-gen", name: "IO-Gen", location: "Leeds, UK" },
];

export const PERSONAS: Persona[] = [];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  data_analyst: "Data Analyst",
  viewer: "Viewer",
};

interface LauncherCtx {
  persona: Persona;
  setPersonaId: (id: string) => void;
  org: Org;
  setOrgId: (id: string) => void;
  orgs: Org[];
  personas: Persona[];
  isAdmin: boolean;
  signedIn: boolean;
}

const Ctx = createContext<LauncherCtx | null>(null);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState<string>("");
  const { organisations } = useOrganisations();
  const { user, profile, isAdmin } = useAuth();

  const value = useMemo<LauncherCtx>(() => {
    const email = user?.email ?? "";
    const name = profile?.display_name || email.split("@")[0] || "Guest";
    const initials = (name.match(/[A-Za-z0-9]/g) ?? ["?"]).slice(0, 2).join("").toUpperCase();
    const persona: Persona = {
      id: user?.id ?? "guest",
      name,
      email,
      initials,
      role: isAdmin ? "super_admin" : "viewer",
    };
    const orgs: Org[] = organisations.length
      ? organisations.map(toOrg)
      : [];
    const org =
      orgs.find((o) => o.id === orgId) ??
      orgs[0] ?? { id: "none", name: "No organisation", location: "" };
    return {
      persona,
      setPersonaId: () => {},
      org,
      setOrgId,
      orgs,
      personas: [],
      isAdmin,
      signedIn: !!user,
    };
  }, [orgId, organisations, user, profile, isAdmin]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function toOrg(o: Organisation): Org {
  return { id: o.id, name: o.organization_name, location: o.location ?? "" };
}

export function useLauncher() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLauncher must be used within LauncherProvider");
  return ctx;
}

export interface MiniApp {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: "baseload" | "sustainability";
  allowedRoles: Role[];
  accent: string;
}

export const APPS: MiniApp[] = [
  {
    id: "baseload",
    slug: "baseload",
    name: "Baseload Scoring",
    tagline: "Detect anomalies in electricity & gas",
    description:
      "Continuously scans half-hourly electricity and gas data to score baseload health and flag unusual consumption.",
    category: "Analysis",
    icon: "baseload",
    allowedRoles: ["super_admin", "data_analyst"],
    accent: "from-cyan-500/15 to-blue-500/10",
  },
  {
    id: "sustainability",
    slug: "sustainability",
    name: "Sustainability Tracker",
    tagline: "Carbon footprint from all streams",
    description:
      "Calculates Scope 1 and 2 emissions from electricity, gas, water and solar PV to track your carbon trajectory.",
    category: "Monitoring",
    icon: "sustainability",
    allowedRoles: ["super_admin", "data_analyst", "viewer"],
    accent: "from-emerald-500/15 to-teal-500/10",
  },
];

export function canAccess(app: MiniApp, role: Role) {
  return app.allowedRoles.includes(role);
}