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
  address?: string;
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
  meter_display_name?: string | null;
}

export type SchemaLabels = Record<string, string>;

export interface MeterOverride {
  raw_meter_name: string;
  organization_id: string;
  custom_display_name: string | null;
  assigned_building_id: string | null;
  calibrated_meter_factor: number | null;
  updated_at: string;
}

export interface MeterRegistryRow {
  raw_meter_name: string;
  utility_category: string;
  custom_display_name: string | null;
  effective_building_id: string | null;
  effective_building_name: string;
  effective_meter_factor: number;
  csv_meter_factor: number;
  has_override: boolean;
  row_count: number;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export interface Schedule {
  id: string;
  building_id: string;
  name: string;
  day: Weekday;
  from: string; // "HH:mm"
  to: string;   // "HH:mm"
  created_at: string;
}

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
  { id: "haven-holidays", organization_name: "Haven Holidays", location: "United Kingdom", created_at: new Date().toISOString() },
  { id: "methodist-schools", organization_name: "Methodist Independent School's Trust", location: "London, UK", created_at: new Date().toISOString() },
  { id: "io-gen", organization_name: "IO-Gen", location: "Leeds, UK", created_at: new Date().toISOString() },
];

interface State {
  organisations: Organisation[];
  buildings: Building[];
  consumption: ConsumptionRow[];
  schemaLabels: SchemaLabels;
  ingestion: IngestionSettings;
  meterOverrides: MeterOverride[];
  schedules: Schedule[];
}

const STORAGE_KEY = "optimise:store:v1";

function loadState(): State {
  const base: State = {
    organisations: SEED_ORGS,
    buildings: [],
    consumption: [],
    schemaLabels: DEFAULT_LABELS,
    ingestion: { scheduled_time: "10:00", last_synced_at: null, source_url: "" },
    meterOverrides: [],
    schedules: [],
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
      meterOverrides: parsed.meterOverrides ?? [],
      schedules: parsed.schedules ?? [],
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
  upsertMeterOverride: (o: Omit<MeterOverride, "updated_at">) => { reconciledRows: number };
  deleteMeterOverride: (rawName: string, orgId: string) => { reconciledRows: number };
  addSchedules: (entries: Omit<Schedule, "id" | "created_at">[]) => Schedule[];
  updateSchedule: (id: string, patch: Partial<Omit<Schedule, "id" | "created_at" | "building_id">>) => void;
  deleteSchedule: (id: string) => void;
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
    upsertMeterOverride: (o) => {
      let reconciled = 0;
      setState((s) => {
        const others = s.meterOverrides.filter(
          (m) => !(m.raw_meter_name === o.raw_meter_name && m.organization_id === o.organization_id),
        );
        const next: MeterOverride = { ...o, updated_at: new Date().toISOString() };
        const consumption = s.consumption.map((c) => {
          if (c.organization_id !== o.organization_id || c.meter_name !== o.raw_meter_name) return c;
          reconciled++;
          return {
            ...c,
            building_id: next.assigned_building_id ?? c.building_id,
            meter_factor: next.calibrated_meter_factor ?? c.meter_factor,
            meter_display_name: next.custom_display_name,
          };
        });
        return { ...s, meterOverrides: [...others, next], consumption };
      });
      return { reconciledRows: reconciled };
    },
    deleteMeterOverride: (rawName, orgId) => {
      let reconciled = 0;
      setState((s) => {
        const consumption = s.consumption.map((c) => {
          if (c.organization_id !== orgId || c.meter_name !== rawName) return c;
          reconciled++;
          return { ...c, meter_display_name: null };
        });
        return {
          ...s,
          meterOverrides: s.meterOverrides.filter(
            (m) => !(m.raw_meter_name === rawName && m.organization_id === orgId),
          ),
          consumption,
        };
      });
      return { reconciledRows: reconciled };
    },
    addSchedules: (entries) => {
      const created: Schedule[] = entries.map((e) => ({
        ...e,
        id: uid(),
        created_at: new Date().toISOString(),
      }));
      setState((s) => ({ ...s, schedules: [...s.schedules, ...created] }));
      return created;
    },
    updateSchedule: (id, patch) =>
      setState((s) => ({
        ...s,
        schedules: s.schedules.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
      })),
    deleteSchedule: (id) =>
      setState((s) => ({ ...s, schedules: s.schedules.filter((sc) => sc.id !== id) })),
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

export function useMeterOverrides(orgId?: string) {
  const { state, upsertMeterOverride, deleteMeterOverride } = useDataStore();
  const overrides = useMemo(
    () => (orgId ? state.meterOverrides.filter((m) => m.organization_id === orgId) : state.meterOverrides),
    [state.meterOverrides, orgId],
  );
  const getOverride = useCallback(
    (rawName: string) =>
      overrides.find((m) => m.raw_meter_name === rawName) ?? null,
    [overrides],
  );
  return { overrides, upsertMeterOverride, deleteMeterOverride, getOverride };
}

export function useMeterRegistry(orgId?: string): MeterRegistryRow[] {
  const { state } = useDataStore();
  return useMemo(() => {
    if (!orgId) return [];
    const buildings = state.buildings.filter((b) => b.organization_id === orgId);
    const buildingsById = new Map(buildings.map((b) => [b.id, b] as const));
    const overridesByRaw = new Map(
      state.meterOverrides
        .filter((m) => m.organization_id === orgId)
        .map((m) => [m.raw_meter_name, m] as const),
    );
    const groups = new Map<string, { rows: ConsumptionRow[]; category: string; csvFactor: number }>();
    for (const c of state.consumption) {
      if (c.organization_id !== orgId) continue;
      const key = c.meter_name;
      if (!key) continue;
      const existing = groups.get(key);
      if (existing) existing.rows.push(c);
      else groups.set(key, { rows: [c], category: c.variable_category, csvFactor: c.meter_factor });
    }
    const out: MeterRegistryRow[] = [];
    for (const [raw, g] of groups) {
      const o = overridesByRaw.get(raw);
      const effectiveBuildingId = o?.assigned_building_id ?? g.rows[0]?.building_id ?? null;
      const effectiveBuilding = effectiveBuildingId ? buildingsById.get(effectiveBuildingId) : null;
      out.push({
        raw_meter_name: raw,
        utility_category: g.category,
        custom_display_name: o?.custom_display_name ?? null,
        effective_building_id: effectiveBuildingId,
        effective_building_name: effectiveBuilding?.custom_display_name ?? "Unassigned",
        effective_meter_factor: o?.calibrated_meter_factor ?? g.csvFactor,
        csv_meter_factor: g.csvFactor,
        has_override: !!o,
        row_count: g.rows.length,
      });
    }
    return out.sort((a, b) => a.raw_meter_name.localeCompare(b.raw_meter_name));
  }, [state.consumption, state.buildings, state.meterOverrides, orgId]);
}