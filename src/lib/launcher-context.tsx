import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useOrganisations, type Organisation } from "./data-store";

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
  { id: "factory-a", name: "Factory A", location: "Manchester, UK" },
  { id: "corporate-hq", name: "Corporate HQ", location: "London, UK" },
  { id: "warehouse-north", name: "Warehouse North", location: "Leeds, UK" },
];

export const PERSONAS: Persona[] = [
  { id: "sa", name: "Jed Palma", role: "super_admin", email: "jed@io-gen.com", initials: "JP" },
  { id: "da", name: "Kristel Calilung", role: "data_analyst", email: "kristel@io-gen.com", initials: "KC" },
  { id: "vw", name: "Rustin Cooper", role: "viewer", email: "rustin@io-gen.com", initials: "RC" },
];

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
}

const Ctx = createContext<LauncherCtx | null>(null);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaId] = useState("sa");
  const [orgId, setOrgId] = useState("factory-a");
  const { organisations } = useOrganisations();

  const value = useMemo<LauncherCtx>(() => {
    const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];
    const orgs: Org[] = organisations.length
      ? organisations.map(toOrg)
      : ORGS;
    const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
    return { persona, setPersonaId, org, setOrgId, orgs, personas: PERSONAS };
  }, [personaId, orgId, organisations]);

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