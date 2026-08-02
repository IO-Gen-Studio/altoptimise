import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useOrganisations, type Organisation } from "./data-store";
import { useAuth } from "@/hooks/use-auth";

export type Role = "super_admin" | "admin" | "user";

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
  admin: "Admin",
  user: "User",
};

interface LauncherCtx {
  persona: Persona;
  setPersonaId: (id: string) => void;
  org: Org;
  setOrgId: (id: string) => void;
  orgs: Org[];
  personas: Persona[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  appAccess: string[];
  signedIn: boolean;
}

const Ctx = createContext<LauncherCtx | null>(null);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState<string>("");
  const { organisations } = useOrganisations();
  const { user, profile, isAdmin, isSuperAdmin, role, appAccess } = useAuth();

  const value = useMemo<LauncherCtx>(() => {
    const email = user?.email ?? "";
    const name = profile?.display_name || email.split("@")[0] || "Guest";
    const initials = (name.match(/[A-Za-z0-9]/g) ?? ["?"]).slice(0, 2).join("").toUpperCase();
    const persona: Persona = {
      id: user?.id ?? "guest",
      name,
      email,
      initials,
      role: (role ?? "user") as Role,
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
      isSuperAdmin,
      appAccess,
      signedIn: !!user,
    };
  }, [orgId, organisations, user, profile, isAdmin, isSuperAdmin, role, appAccess]);

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
  icon: "baseload" | "sustainability" | "completeness" | "league" | "water" | "pricing" | "neutral";
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
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-cyan-500/15 to-blue-500/10",
  },
  {
    id: "data-validation",
    slug: "data-validation",
    name: "Data Validation Engine",
    tagline: "Completeness, integrity & meter health",
    description:
      "Runs structural completeness, statistical integrity (spikes/drops vs 4-wk baseline) and stagnation checks before analytics.",
    category: "Validation",
    icon: "completeness",
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-amber-500/15 to-orange-500/10",
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
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-emerald-500/15 to-teal-500/10",
  },
  {
    id: "league-table",
    slug: "league-table",
    name: "Consumption League",
    tagline: "Rank sites by usage, cost & carbon",
    description:
      "League table of every site with aggregated consumption per utility, YoY change, cost, CO₂e, peak demand and out-of-hours share.",
    category: "Benchmarking",
    icon: "league",
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-violet-500/15 to-fuchsia-500/10",
  },
  {
    id: "water-sentinel",
    slug: "water-sentinel",
    name: "Overnight Water Sentinel",
    tagline: "Continuous overnight flow & leak detection",
    description:
      "Isolates water meters and flags continuous overnight baseline flow, estimating leak rate, wasted volume and financial impact.",
    category: "Detection",
    icon: "water",
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-blue-500/15 to-sky-500/10",
  },
  {
    id: "agile-pricing",
    slug: "agile-pricing",
    name: "Agile Pricing & Shift Advisor",
    tagline: "Live Octopus Agile rates, cost overlay & load shifting",
    description:
      "Tracks live and day-ahead Octopus Agile prices for each site's grid region, costs your half-hourly electricity against Agile, Tracker and Flexible, and models savings from shifting load to cheaper windows.",
    category: "Pricing",
    icon: "pricing",
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-amber-500/15 to-yellow-500/10",
  },
  {
    id: "neutral-home",
    slug: "neutral-home",
    name: "Neutral Home",
    tagline: "Reporting for Excel Utilities",
    description:
      "Ingests Envisij headline usage and day/night group exports per site, then reports consumption, cost, carbon, day/night waste and intensity leaderboards with period-on-period comparison.",
    category: "PARTNER REPORTING",
    icon: "neutral",
    allowedRoles: ["super_admin", "admin", "user"],
    accent: "from-slate-500/15 to-emerald-500/10",
  },
];

export function canAccess(app: MiniApp, role: Role, appAccess: string[] = []): boolean {
  if (!app.allowedRoles.includes(role)) return false;
  // Super admin has access to everything
  if (role === "super_admin") return true;
  // Admin and user require explicit app access assignment
  return appAccess.includes(app.slug);
}