import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Organisation {
  id: string;
  organization_name: string;
  location?: string;
  created_at: string;
}

export interface Building {
  id: string;
  organization_id: string;
  custom_display_name: string;
  csv_matched_name: string;
  created_at: string;
}

export interface ConsumptionRow {
  id: string;
  organization_id: string;
  building_id: string | null;
  original_org_unit_name: string;
  meter_name: string;
  meter_factor: number;
  variable_code: string;
  variable_name: string;
  variable_category: string;
  interval_date: string; // YYYY-MM-DD
  half_hourly_values: (number | null)[]; // 48 slots
}

export type SchemaLabels = Record<string, string>;

export interface IngestionSettings {
  scheduled_time: string; // "HH:mm"
  last_synced_at: string | null;
  source_url: string;
}

export const SCHEMA_FIELDS = [
  "OrganizationalUnits.Name",
  "Meters.Name",
  "Meters.Meterfactor",
  "Variables.Code",
  "Variables.Name",
  "Variables.Category",
] as const;

const DEFAULT_LABELS: SchemaLabels = {
  "OrganizationalUnits.Name": "Site / Unit",
  "Meters.Name": "Meter",
  "Meters.Meterfactor": "Meter Factor",
  "Variables.Code": "Variable Code",
  "Variables.Name": "Variable",
  "Variables.Category": "Utility Type",
};

const SEED_ORGS: Organisation[] = [
  { id: "factory-a", organization_name: "Factory A", location: "Manchester, UK", created_at: new Date().toISOString() },
  { id: "corporate-hq", organization_name: "Corporate HQ", location: "London, UK", created_at: new Date().toISOString() },
  { id: "warehouse-north", organization_name: "Warehouse North", location: "Leeds, UK", created_at: new Date().toISOString() },
];

interface State {
  organisations: Organisation[];
  buildings: Building[];
  consumption: ConsumptionRow[];
  schemaLabels: SchemaLabels;
  ingestion: IngestionSettings;
}

const STORAGE_KEY = "optimise:store:v1";

function loadState(): State {
  const base: State = {
    organisations: SEED_ORGS,
    buildings: [],
    consumption: [],
    schemaLabels: DEFAULT_LABELS,
    ingestion: { scheduled_time: "10:00", last_synced_at: null, source_url: "" },
  };
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      organisations: parsed.organisations?.length ? parsed.organisations : base.organisations,
      buildings: parsed.buildings ?? [],
      consumption: parsed.consumption ?? [],
      schemaLabels: { ...base.schemaLabels, ...(parsed.schemaLabels ?? {}) },
      ingestion: { ...base.ingestion, ...(parsed.ingestion ?? {}) },
    };
  } catch {
    return base;
  }
}

function saveState(s: State) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface StoreCtx {
  state: State;
  addOrganisation: (name: string, location?: string) => Organisation;
  updateOrganisation: (id: string, patch: Partial<Organisation>) => void;
  deleteOrganisation: (id: string) => void;
  addBuilding: (b: Omit<Building, "id" | "created_at">) => Building;
  updateBuilding: (id: string, patch: Partial<Building>) => void;
  deleteBuilding: (id: string) => void;
  bulkInsertConsumption: (rows: Omit<ConsumptionRow, "id">[]) => number;
  setSchemaLabel: (key: string, label: string) => void;
  setIngestion: (patch: Partial<IngestionSettings>) => void;
  markSynced: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => loadState());

  // Hydrate on client after mount (SSR safety)
  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const api = useMemo<StoreCtx>(() => ({
    state,
    addOrganisation: (name, location) => {
      const org: Organisation = {
        id: uid(),
        organization_name: name,
        location,
        created_at: new Date().toISOString(),
      };
      setState((s) => ({ ...s, organisations: [...s.organisations, org] }));
      return org;
    },
    updateOrganisation: (id, patch) =>
      setState((s) => ({
        ...s,
        organisations: s.organisations.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      })),
    deleteOrganisation: (id) =>
      setState((s) => ({
        ...s,
        organisations: s.organisations.filter((o) => o.id !== id),
        buildings: s.buildings.filter((b) => b.organization_id !== id),
        consumption: s.consumption.filter((c) => c.organization_id !== id),
      })),
    addBuilding: (b) => {
      const building: Building = { ...b, id: uid(), created_at: new Date().toISOString() };
      setState((s) => ({ ...s, buildings: [...s.buildings, building] }));
      return building;
    },
    updateBuilding: (id, patch) =>
      setState((s) => ({
        ...s,
        buildings: s.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
    deleteBuilding: (id) =>
      setState((s) => ({ ...s, buildings: s.buildings.filter((b) => b.id !== id) })),
    bulkInsertConsumption: (rows) => {
      const withIds = rows.map((r) => ({ ...r, id: uid() }));
      setState((s) => ({ ...s, consumption: [...s.consumption, ...withIds] }));
      return withIds.length;
    },
    setSchemaLabel: (key, label) =>
      setState((s) => ({ ...s, schemaLabels: { ...s.schemaLabels, [key]: label } })),
    setIngestion: (patch) =>
      setState((s) => ({ ...s, ingestion: { ...s.ingestion, ...patch } })),
    markSynced: () =>
      setState((s) => ({ ...s, ingestion: { ...s.ingestion, last_synced_at: new Date().toISOString() } })),
  }), [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDataStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDataStore must be used within DataStoreProvider");
  return ctx;
}

export function useOrganisations() {
  const { state, addOrganisation, updateOrganisation, deleteOrganisation } = useDataStore();
  return { organisations: state.organisations, addOrganisation, updateOrganisation, deleteOrganisation };
}

export function useBuildings(orgId?: string) {
  const { state, addBuilding, updateBuilding, deleteBuilding } = useDataStore();
  const buildings = useMemo(
    () => (orgId ? state.buildings.filter((b) => b.organization_id === orgId) : state.buildings),
    [state.buildings, orgId],
  );
  return { buildings, addBuilding, updateBuilding, deleteBuilding };
}

export function useSchemaLabels() {
  const { state, setSchemaLabel } = useDataStore();
  const labelFor = useCallback((key: string) => state.schemaLabels[key] ?? key, [state.schemaLabels]);
  return { schemaLabels: state.schemaLabels, labelFor, setSchemaLabel };
}

export function useIngestionSettings() {
  const { state, setIngestion, markSynced } = useDataStore();
  return { ingestion: state.ingestion, setIngestion, markSynced };
}

export function useConsumption() {
  const { state, bulkInsertConsumption } = useDataStore();
  return { consumption: state.consumption, bulkInsertConsumption };
}