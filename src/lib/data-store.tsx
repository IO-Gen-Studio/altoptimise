import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { loadCachedState, saveCachedState, clearCachedState } from "@/lib/cache/idb-cache";

export interface Organisation {
  id: string;
  organization_name: string;
  location?: string;
  created_at: string;
  profile_type?: "office" | "retail" | "evening_peak";
  active_from?: string; // "HH:MM"
  active_to?: string;   // "HH:MM"
  active_days?: number[]; // 0=Sun..6=Sat
  peak_season_months?: number[]; // 1..12
  summer_gas_months?: number[];  // 1..12
  holidays?: string[]; // YYYY-MM-DD
  completeness_missing_pct?: number;
  completeness_flatline_hours?: number;
  tariff_electricity_pence_per_kwh?: number | null;
  tariff_gas_pence_per_kwh?: number | null;
  tariff_water_pence_per_m3?: number | null;
  co2_factor_electricity_kg_per_kwh?: number | null;
  co2_factor_gas_kg_per_kwh?: number | null;
  co2_factor_water_kg_per_m3?: number | null;
}

export interface Building {
  id: string;
  organization_id: string;
  custom_display_name: string;
  csv_matched_name: string;
  address?: string;
  created_at: string;
  schedule_override_enabled?: boolean;
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
  // Snapshot of CSV values captured before the override first mutated
  // consumption rows, so "Reset to CSV defaults" can restore them.
  csv_original_building_id?: string | null;
  csv_original_meter_factor?: number | null;
  updated_at: string;
}

export interface MeterRegistryRow {
  organization_id?: string | null;
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

export const MONTHS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const MONTH_LABEL: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
};

export interface Schedule {
  id: string;
  building_id: string;
  name: string;
  day: Weekday;
  from: string; // "HH:mm"
  to: string;   // "HH:mm"
  months?: number[]; // 1-12; empty/undefined = all months
  created_at: string;
}

export interface IngestionSettings {
  scheduled_time: string; // "HH:mm"
  last_synced_at: string | null;
  source_url: string;
}

export interface IngestionSchedule {
  id: string;
  organization_id: string;
  name: string;
  source_url: string;
  scheduled_time: string; // "HH:mm" UTC
  enabled: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_rows_imported: number | null;
  created_at: string;
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

interface State {
  organisations: Organisation[];
  buildings: Building[];
  consumption: ConsumptionRow[];
  meterRegistry: MeterRegistryRow[];
  schemaLabels: SchemaLabels;
  ingestion: IngestionSettings;
  meterOverrides: MeterOverride[];
  schedules: Schedule[];
}

function emptyState(): State {
  return {
    organisations: [],
    buildings: [],
    consumption: [],
    meterRegistry: [],
    schemaLabels: DEFAULT_LABELS,
    ingestion: { scheduled_time: "10:00", last_synced_at: null, source_url: "" },
    meterOverrides: [],
    schedules: [],
  };
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10);
}

function handleDbError(context: string, error: { message: string; code?: string } | null) {
  if (!error) return;
  const msg =
    error.code === "42501" || /permission|denied|row-level security/i.test(error.message)
      ? "You need admin access to make that change"
      : `${context}: ${error.message}`;
  toast.error(msg);
  console.error(context, error);
}

// --- DB row shape converters ------------------------------------------------

interface DbSchedule {
  id: string;
  building_id: string;
  name: string;
  day: string;
  from_time: string;
  to_time: string;
  months: number[] | null;
  created_at: string;
}
function schedFromDb(r: DbSchedule): Schedule {
  return {
    id: r.id,
    building_id: r.building_id,
    name: r.name,
    day: r.day as Weekday,
    from: r.from_time,
    to: r.to_time,
    months: r.months ?? [],
    created_at: r.created_at,
  };
}
function schedToDb(s: Schedule) {
  return {
    id: s.id,
    building_id: s.building_id,
    name: s.name,
    day: s.day,
    from_time: s.from,
    to_time: s.to,
    months: s.months ?? [],
  };
}

function normNumArray(v: unknown): (number | null)[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (x === null || x === undefined ? null : Number(x)));
}

function registryFromDb(r: Record<string, unknown>): MeterRegistryRow {
  return {
    organization_id: (r.organization_id as string | null) ?? null,
    raw_meter_name: String(r.raw_meter_name ?? ""),
    utility_category: String(r.utility_category ?? ""),
    custom_display_name: (r.custom_display_name as string | null) ?? null,
    effective_building_id: (r.effective_building_id as string | null) ?? null,
    effective_building_name: String(r.effective_building_name ?? "Unassigned"),
    effective_meter_factor: Number(r.effective_meter_factor ?? 1),
    csv_meter_factor: Number(r.csv_meter_factor ?? 1),
    has_override: Boolean(r.has_override),
    row_count: Number(r.row_count ?? 0),
  };
}

async function fetchAll(): Promise<State> {
  const [orgs, bldgs, ovs, sch, lbls, ing, registry] = await Promise.all([
    supabase.from("organisations").select("*").order("created_at"),
    supabase.from("buildings").select("*").order("created_at"),
    supabase.from("meter_overrides").select("*"),
    supabase.from("schedules").select("*"),
    supabase.from("schema_labels").select("*"),
    supabase.from("ingestion_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("meter_registry").select("*").order("raw_meter_name"),
  ]);
  const s = emptyState();
  if (orgs.data) s.organisations = orgs.data as Organisation[];
  if (bldgs.data) s.buildings = bldgs.data as Building[];
  if (registry.data) s.meterRegistry = (registry.data as Record<string, unknown>[]).map(registryFromDb).filter((r) => r.raw_meter_name);
  if (ovs.data)
    s.meterOverrides = ovs.data.map((r: Record<string, unknown>) => ({
      raw_meter_name: r.raw_meter_name as string,
      organization_id: r.organization_id as string,
      custom_display_name: (r.custom_display_name as string | null) ?? null,
      assigned_building_id: (r.assigned_building_id as string | null) ?? null,
      calibrated_meter_factor:
        r.calibrated_meter_factor === null || r.calibrated_meter_factor === undefined
          ? null
          : Number(r.calibrated_meter_factor),
      csv_original_building_id: (r.csv_original_building_id as string | null) ?? null,
      csv_original_meter_factor:
        r.csv_original_meter_factor === null || r.csv_original_meter_factor === undefined
          ? undefined
          : Number(r.csv_original_meter_factor),
      updated_at: r.updated_at as string,
    }));
  if (sch.data) s.schedules = (sch.data as DbSchedule[]).map(schedFromDb);
  if (lbls.data) {
    const map: SchemaLabels = { ...DEFAULT_LABELS };
    for (const row of lbls.data as { key: string; label: string }[]) map[row.key] = row.label;
    s.schemaLabels = map;
  }
  if (ing.data) {
    s.ingestion = {
      scheduled_time: (ing.data.scheduled_time as string) ?? "10:00",
      last_synced_at: (ing.data.last_synced_at as string | null) ?? null,
      source_url: (ing.data.source_url as string) ?? "",
    };
  }
  return s;
}

async function fetchConsumption(onPage?: (rows: ConsumptionRow[], pageIndex: number) => void): Promise<ConsumptionRow[]> {
    const PAGE = 1000;
    let lastId: string | null = null;
    const all: Record<string, unknown>[] = [];
    let pageIndex = 0;
    while (true) {
      let query = supabase
        .from("consumption_rows")
        .select("*")
        .order("id")
        .limit(PAGE);
      if (lastId) query = query.gt("id", lastId);
      const { data, error } = await query;
      if (error) { console.error("consumption fetch", error); break; }
      if (!data || data.length === 0) break;
      const pageRows = data as Record<string, unknown>[];
      all.push(...pageRows);
      pageIndex += 1;
      onPage?.(pageRows.map(rowFromDb), pageIndex);
      lastId = String((pageRows[pageRows.length - 1] as Record<string, unknown>).id);
    }
  return all.map(rowFromDb);
}

function rowFromDb(r: Record<string, unknown>): ConsumptionRow {
  return {
    ...(r as unknown as ConsumptionRow),
    meter_factor: Number(r.meter_factor ?? 1),
    half_hourly_values: normNumArray(r.half_hourly_values),
  };
}

interface StoreCtx {
  state: State;
  addOrganisation: (name: string, location?: string) => Organisation;
  updateOrganisation: (id: string, patch: Partial<Organisation>) => void;
  deleteOrganisation: (id: string) => void;
  addBuilding: (b: Omit<Building, "id" | "created_at">) => Building;
  updateBuilding: (id: string, patch: Partial<Building>) => void;
  deleteBuilding: (id: string) => void;
  bulkInsertConsumption: (rows: Omit<ConsumptionRow, "id">[]) => Promise<number>;
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
  const [state, setState] = useState<State>(() => emptyState());
  const consumptionLoadVersion = useRef(0);

  const refreshMetadata = useCallback(async () => {
    try {
      const next = await fetchAll();
      setState((s) => ({ ...next, consumption: s.consumption }));
    } catch (e) {
      console.error("data-store refresh failed", e);
    }
  }, []);

  const refresh = useCallback(async () => {
    const version = consumptionLoadVersion.current + 1;
    consumptionLoadVersion.current = version;
    await refreshMetadata();

    // Consumption is large (48-value arrays × tens of thousands of rows). Keep
    // existing rows visible during refreshes, then stream pages in so apps do
    // not appear to lose all data while the full dataset is still loading.
    const accumulated: ConsumptionRow[] = [];
    void fetchConsumption((pageRows, pageIndex) => {
      if (consumptionLoadVersion.current !== version) return;
      accumulated.push(...pageRows);
      if (pageIndex === 1 || pageIndex % 10 === 0) {
        setState((s) => ({ ...s, consumption: accumulated.slice() }));
      }
    }).then((rows) => {
      if (consumptionLoadVersion.current === version) {
        setState((s) => ({ ...s, consumption: rows }));
      }
    });
  }, [refreshMetadata]);

  // Load on mount + whenever auth state changes.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) void refresh();
      else setState(emptyState());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void refresh();
      if (event === "SIGNED_OUT") setState(emptyState());
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

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
      void supabase
        .from("organisations")
        .insert({ id: org.id, organization_name: name, location: location ?? null })
        .then(({ error }) => {
          if (error) {
            handleDbError("Create organisation", error);
            void refresh();
          }
        });
      return org;
    },
    updateOrganisation: (id, patch) =>
    {
      setState((s) => ({
        ...s,
        organisations: s.organisations.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      }));
      const { id: _ignore, created_at: _ignore2, ...updates } = patch as Partial<Organisation>;
      void supabase.from("organisations").update(updates).eq("id", id).then(({ error }) => {
        if (error) { handleDbError("Update organisation", error); void refresh(); }
      });
    },
    deleteOrganisation: (id) =>
    {
      setState((s) => ({
        ...s,
        organisations: s.organisations.filter((o) => o.id !== id),
        buildings: s.buildings.filter((b) => b.organization_id !== id),
        consumption: s.consumption.filter((c) => c.organization_id !== id),
      }));
      void supabase.from("organisations").delete().eq("id", id).then(({ error }) => {
        if (error) { handleDbError("Delete organisation", error); void refresh(); }
      });
    },
    addBuilding: (b) => {
      const building: Building = { ...b, id: uid(), created_at: new Date().toISOString() };
      setState((s) => ({ ...s, buildings: [...s.buildings, building] }));
      void supabase.from("buildings").insert({
        id: building.id,
        organization_id: building.organization_id,
        custom_display_name: building.custom_display_name,
        csv_matched_name: building.csv_matched_name ?? "",
        address: building.address ?? null,
      }).then(({ error }) => {
        if (error) { handleDbError("Create building", error); void refresh(); }
      });
      return building;
    },
    updateBuilding: (id, patch) =>
    {
      setState((s) => ({
        ...s,
        buildings: s.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }));
      const { id: _i, created_at: _c, organization_id: _o, ...updates } = patch as Partial<Building>;
      void supabase.from("buildings").update(updates).eq("id", id).then(({ error }) => {
        if (error) { handleDbError("Update building", error); void refresh(); }
      });
    },
    deleteBuilding: (id) =>
    {
      setState((s) => ({ ...s, buildings: s.buildings.filter((b) => b.id !== id) }));
      void supabase.from("buildings").delete().eq("id", id).then(({ error }) => {
        if (error) { handleDbError("Delete building", error); void refresh(); }
      });
    },
    bulkInsertConsumption: async (rows) => {
      const withIds = rows.map((r) => ({ ...r, id: uid() }));
      setState((s) => ({ ...s, consumption: [...s.consumption, ...withIds] }));
      // Insert in batches to keep payloads manageable.
      const CHUNK = 500;
      for (let i = 0; i < withIds.length; i += CHUNK) {
        const batch = withIds.slice(i, i + CHUNK);
        const { error } = await supabase.from("consumption_rows").insert(batch as never);
        if (error) {
          handleDbError("Import consumption", error);
          void refresh();
          throw new Error(error.message);
        }
      }
      void refreshMetadata();
      return withIds.length;
    },
    setSchemaLabel: (key, label) => {
      setState((s) => ({ ...s, schemaLabels: { ...s.schemaLabels, [key]: label } }));
      void supabase.from("schema_labels").upsert({ key, label }).then(({ error }) => {
        if (error) { handleDbError("Save label", error); void refresh(); }
      });
    },
    setIngestion: (patch) => {
      setState((s) => ({ ...s, ingestion: { ...s.ingestion, ...patch } }));
      void supabase.from("ingestion_settings").update(patch as never).eq("id", 1).then(({ error }) => {
        if (error) { handleDbError("Save ingestion settings", error); void refresh(); }
      });
    },
    markSynced: () => {
      const now = new Date().toISOString();
      setState((s) => ({ ...s, ingestion: { ...s.ingestion, last_synced_at: now } }));
      void supabase.from("ingestion_settings").update({ last_synced_at: now }).eq("id", 1).then(({ error }) => {
        if (error) { handleDbError("Save sync time", error); void refresh(); }
      });
    },
    upsertMeterOverride: (o) => {
      let reconciled = 0;
      setState((s) => {
        const existing = s.meterOverrides.find(
          (m) => m.raw_meter_name === o.raw_meter_name && m.organization_id === o.organization_id,
        );
        const others = s.meterOverrides.filter(
          (m) => !(m.raw_meter_name === o.raw_meter_name && m.organization_id === o.organization_id),
        );
        // Capture original CSV values from the first matching consumption row
        // (or reuse an existing snapshot) so we can restore them on reset.
        const firstRow = s.consumption.find(
          (c) => c.organization_id === o.organization_id && c.meter_name === o.raw_meter_name,
        );
        const registryRow = s.meterRegistry.find(
          (m) => m.organization_id === o.organization_id && m.raw_meter_name === o.raw_meter_name,
        );
        const csv_original_building_id =
          existing?.csv_original_building_id !== undefined
            ? existing.csv_original_building_id
            : firstRow?.building_id ?? registryRow?.effective_building_id ?? null;
        const csv_original_meter_factor =
          existing?.csv_original_meter_factor !== undefined
            ? existing.csv_original_meter_factor
            : firstRow?.meter_factor ?? registryRow?.csv_meter_factor ?? 1;
        const next: MeterOverride = {
          ...o,
          csv_original_building_id,
          csv_original_meter_factor,
          updated_at: new Date().toISOString(),
        };
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
        // Persist override + reconciled consumption rows in the background.
        void (async () => {
          const { error: e1 } = await supabase.from("meter_overrides").upsert({
            raw_meter_name: next.raw_meter_name,
            organization_id: next.organization_id,
            custom_display_name: next.custom_display_name,
            assigned_building_id: next.assigned_building_id,
            calibrated_meter_factor: next.calibrated_meter_factor,
            csv_original_building_id: next.csv_original_building_id ?? null,
            csv_original_meter_factor: next.csv_original_meter_factor ?? null,
          });
          if (e1) { handleDbError("Save meter override", e1); void refresh(); return; }
          const patch: Record<string, unknown> = { meter_display_name: next.custom_display_name };
          if (next.assigned_building_id !== null && next.assigned_building_id !== undefined)
            patch.building_id = next.assigned_building_id;
          if (next.calibrated_meter_factor !== null && next.calibrated_meter_factor !== undefined)
            patch.meter_factor = next.calibrated_meter_factor;
          const { error: e2 } = await supabase
            .from("consumption_rows")
            .update(patch as never)
            .eq("organization_id", next.organization_id)
            .eq("meter_name", next.raw_meter_name);
          if (e2) { handleDbError("Reconcile meter rows", e2); void refresh(); }
        })();
        return { ...s, meterOverrides: [...others, next], consumption };
      });
      return { reconciledRows: reconciled };
    },
    deleteMeterOverride: (rawName, orgId) => {
      let reconciled = 0;
      let originalBuildingId: string | null = null;
      let originalFactor: number | undefined;
      let hadOverride = false;
      setState((s) => {
        const existing = s.meterOverrides.find(
          (m) => m.raw_meter_name === rawName && m.organization_id === orgId,
        );
        hadOverride = !!existing;
        originalBuildingId = existing?.csv_original_building_id ?? null;
        originalFactor = existing?.csv_original_meter_factor ?? undefined;
        const consumption = s.consumption.map((c) => {
          if (c.organization_id !== orgId || c.meter_name !== rawName) return c;
          reconciled++;
          return {
            ...c,
            building_id: existing ? originalBuildingId : c.building_id,
            meter_factor:
              existing && typeof originalFactor === "number" ? originalFactor : c.meter_factor,
            meter_display_name: null,
          };
        });
        return {
          ...s,
          meterOverrides: s.meterOverrides.filter(
            (m) => !(m.raw_meter_name === rawName && m.organization_id === orgId),
          ),
          consumption,
        };
      });
      void (async () => {
        const { error: e1 } = await supabase
          .from("meter_overrides")
          .delete()
          .eq("raw_meter_name", rawName)
          .eq("organization_id", orgId);
        if (e1) { handleDbError("Reset meter override", e1); void refresh(); return; }
        if (hadOverride) {
          const patch: Record<string, unknown> = {
            meter_display_name: null,
            building_id: originalBuildingId,
          };
          if (typeof originalFactor === "number") patch.meter_factor = originalFactor;
          const { error: e2 } = await supabase
            .from("consumption_rows")
            .update(patch as never)
            .eq("organization_id", orgId)
            .eq("meter_name", rawName);
          if (e2) { handleDbError("Restore meter rows", e2); void refresh(); }
        }
      })();
      return { reconciledRows: reconciled };
    },
    addSchedules: (entries) => {
      const created: Schedule[] = entries.map((e) => ({
        ...e,
        id: uid(),
        created_at: new Date().toISOString(),
      }));
      setState((s) => ({ ...s, schedules: [...s.schedules, ...created] }));
      void supabase.from("schedules").insert(created.map(schedToDb)).then(({ error }) => {
        if (error) { handleDbError("Save schedule", error); void refresh(); }
      });
      return created;
    },
    updateSchedule: (id, patch) =>
    {
      setState((s) => ({
        ...s,
        schedules: s.schedules.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
      }));
      const dbPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.day !== undefined) dbPatch.day = patch.day;
      if (patch.from !== undefined) dbPatch.from_time = patch.from;
      if (patch.to !== undefined) dbPatch.to_time = patch.to;
      if (patch.months !== undefined) dbPatch.months = patch.months ?? [];
      void supabase.from("schedules").update(dbPatch as never).eq("id", id).then(({ error }) => {
        if (error) { handleDbError("Update schedule", error); void refresh(); }
      });
    },
    deleteSchedule: (id) =>
    {
      setState((s) => ({ ...s, schedules: s.schedules.filter((sc) => sc.id !== id) }));
      void supabase.from("schedules").delete().eq("id", id).then(({ error }) => {
        if (error) { handleDbError("Delete schedule", error); void refresh(); }
      });
    },
  }), [state, refresh, refreshMetadata]);

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
    const cacheRows = state.meterRegistry.filter((m) => m.organization_id === orgId && m.raw_meter_name);
    const rowsByRaw = new Map<string, MeterRegistryRow>();
    for (const base of cacheRows) {
      const o = overridesByRaw.get(base.raw_meter_name);
      const csvFactor =
        o && typeof o.csv_original_meter_factor === "number"
          ? o.csv_original_meter_factor
          : base.csv_meter_factor;
      const effectiveBuildingId = o?.assigned_building_id ?? base.effective_building_id ?? null;
      const effectiveBuilding = effectiveBuildingId ? buildingsById.get(effectiveBuildingId) : null;
      rowsByRaw.set(base.raw_meter_name, {
        ...base,
        custom_display_name: o?.custom_display_name ?? base.custom_display_name,
        effective_building_id: effectiveBuildingId,
        effective_building_name: effectiveBuilding?.custom_display_name ?? base.effective_building_name ?? "Unassigned",
        effective_meter_factor: o?.calibrated_meter_factor ?? base.effective_meter_factor ?? csvFactor,
        csv_meter_factor: csvFactor,
        has_override: !!o,
      });
    }

    // The backend registry cache is authoritative once it exists. Falling back
    // to a browser-side scan of every half-hourly row is only safe for an empty
    // cache; otherwise large uploads make the UI repeatedly stall and appear to
    // drop data while pages stream in.
    if (cacheRows.length === 0) {
      const groups = new Map<string, { rows: ConsumptionRow[]; category: string; csvFactor: number }>();
      for (const c of state.consumption) {
        if (c.organization_id !== orgId) continue;
        const key = c.meter_name;
        if (!key) continue;
        const existing = groups.get(key);
        if (existing) existing.rows.push(c);
        else groups.set(key, { rows: [c], category: c.variable_category, csvFactor: c.meter_factor });
      }
      for (const [raw, g] of groups) {
        const o = overridesByRaw.get(raw);
        const effectiveBuildingId = o?.assigned_building_id ?? g.rows[0]?.building_id ?? null;
        const effectiveBuilding = effectiveBuildingId ? buildingsById.get(effectiveBuildingId) : null;
        // If an override exists, the consumption rows carry the override factor,
        // so pull the true CSV default from the override's snapshot.
        const csvFactor =
          o && typeof o.csv_original_meter_factor === "number"
            ? o.csv_original_meter_factor
            : g.csvFactor;
        rowsByRaw.set(raw, {
          organization_id: orgId,
          raw_meter_name: raw,
          utility_category: g.category,
          custom_display_name: o?.custom_display_name ?? null,
          effective_building_id: effectiveBuildingId,
          effective_building_name: effectiveBuilding?.custom_display_name ?? "Unassigned",
          effective_meter_factor: o?.calibrated_meter_factor ?? csvFactor,
          csv_meter_factor: csvFactor,
          has_override: !!o,
          row_count: g.rows.length,
        });
      }
    }
    return [...rowsByRaw.values()].sort((a, b) => a.raw_meter_name.localeCompare(b.raw_meter_name));
  }, [state.meterRegistry, state.consumption, state.buildings, state.meterOverrides, orgId]);
}

export interface MeterSeries {
  rows: ConsumptionRow[];
  firstSeen: string | null;
  lastSeen: string | null;
  dailyTotals: { date: string; total: number | null }[];
  hhAverage: { slot: number; label: string; avg: number }[];
  weekdayHeatmap: number[][]; // [weekday 0..6][slot 0..47] average kWh
  totalWindowKwh: number;
}

export function useMeterSeries(
  rawMeterName: string | null,
  startISO: string,
  endISO: string,
): MeterSeries {
  const { state } = useDataStore();
  return useMemo(() => {
    const empty: MeterSeries = {
      rows: [], firstSeen: null, lastSeen: null,
      dailyTotals: [], hhAverage: [], weekdayHeatmap: Array.from({ length: 7 }, () => new Array(48).fill(0)),
      totalWindowKwh: 0,
    };
    if (!rawMeterName) return empty;
    const all = state.consumption.filter((c) => c.meter_name === rawMeterName);
    if (!all.length) return empty;
    const sortedDates = all.map((r) => r.interval_date).sort();
    const firstSeen = sortedDates[0];
    const lastSeen = sortedDates[sortedDates.length - 1];
    const windowRows = all.filter((r) => r.interval_date >= startISO && r.interval_date <= endISO);

    // Daily totals
    const dailyMap = new Map<string, number | null>();
    for (const r of windowRows) {
      const sum = r.half_hourly_values.reduce<number | null>((acc, v) => {
        if (v == null) return acc;
        return (acc ?? 0) + v;
      }, null);
      const scaled = sum == null ? null : sum * (r.meter_factor || 1);
      const prev = dailyMap.get(r.interval_date);
      if (prev == null) dailyMap.set(r.interval_date, scaled);
      else dailyMap.set(r.interval_date, (prev ?? 0) + (scaled ?? 0));
    }
    // Walk window day-by-day to include gaps
    const dailyTotals: { date: string; total: number | null }[] = [];
    if (startISO && endISO && startISO <= endISO) {
      const [ys, ms, ds] = startISO.split("-").map(Number);
      const [ye, me, de] = endISO.split("-").map(Number);
      const cur = new Date(Date.UTC(ys, ms - 1, ds));
      const stop = new Date(Date.UTC(ye, me - 1, de));
      while (cur <= stop) {
        const iso = cur.toISOString().slice(0, 10);
        dailyTotals.push({ date: iso, total: dailyMap.has(iso) ? dailyMap.get(iso) ?? null : null });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    // HH average across window
    const slotSum = new Array(48).fill(0);
    const slotCnt = new Array(48).fill(0);
    for (const r of windowRows) {
      const f = r.meter_factor || 1;
      for (let i = 0; i < 48; i++) {
        const v = r.half_hourly_values[i];
        if (v == null) continue;
        slotSum[i] += v * f;
        slotCnt[i] += 1;
      }
    }
    const hhAverage = Array.from({ length: 48 }, (_, i) => {
      const h = Math.floor(i / 2);
      const mm = i % 2 === 0 ? "00" : "30";
      return {
        slot: i,
        label: `${String(h).padStart(2, "0")}:${mm}`,
        avg: slotCnt[i] ? slotSum[i] / slotCnt[i] : 0,
      };
    });

    // Weekday heatmap
    const wSum = Array.from({ length: 7 }, () => new Array(48).fill(0));
    const wCnt = Array.from({ length: 7 }, () => new Array(48).fill(0));
    for (const r of windowRows) {
      const [y, m, d] = r.interval_date.split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const f = r.meter_factor || 1;
      for (let i = 0; i < 48; i++) {
        const v = r.half_hourly_values[i];
        if (v == null) continue;
        wSum[dow][i] += v * f;
        wCnt[dow][i] += 1;
      }
    }
    const weekdayHeatmap = wSum.map((row, d) => row.map((s, i) => (wCnt[d][i] ? s / wCnt[d][i] : 0)));

    const totalWindowKwh = dailyTotals.reduce((acc, dt) => acc + (dt.total ?? 0), 0);

    return { rows: windowRows, firstSeen, lastSeen, dailyTotals, hhAverage, weekdayHeatmap, totalWindowKwh };
  }, [state.consumption, rawMeterName, startISO, endISO]);
}

const DAY_ORDER: Record<Weekday, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

export function useSchedules(buildingId?: string) {
  const { state, addSchedules, updateSchedule, deleteSchedule } = useDataStore();
  const schedules = useMemo(() => {
    const list = buildingId
      ? state.schedules.filter((s) => s.building_id === buildingId)
      : state.schedules;
    return [...list].sort(
      (a, b) => DAY_ORDER[a.day] - DAY_ORDER[b.day] || a.from.localeCompare(b.from),
    );
  }, [state.schedules, buildingId]);
  return { schedules, addSchedules, updateSchedule, deleteSchedule };
}