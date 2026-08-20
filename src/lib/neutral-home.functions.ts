import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CircuitRecord } from "@/lib/neutral-home/analytics";
import type { RoomHourRow } from "@/lib/neutral-home/temp-analytics";

export interface NhSite {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  floor_area_m2: number | null;
  occupancy: number | null;
  notes: string | null;
}

export interface NhPeriod {
  id: string;
  site_id: string;
  organization_id: string;
  label: string;
  period_start: string;
  period_end: string;
  source_headline_filename: string | null;
  source_daynight_filename: string | null;
  source_temperature_filename: string | null;
  created_at: string;
}

export interface NeutralHomeBundle {
  sites: NhSite[];
  periods: NhPeriod[];
  circuits: CircuitRecord[];
  categories: NhCategoryRow[];
  meterCategories: NhMeterCategory[];
  metrics: NhMetric[];
  settings: NhSiteSettings[];
  roomMap: NhRoomMap[];
}

export interface NhRoomMap {
  site_id: string;
  organization_id: string;
  room_name: string;
  circuit_name: string | null;
  auto_matched: boolean;
  confidence: number | null;
}

export interface NhCategoryRow {
  id: string;
  organization_id: string;
  site_id: string;
  code: string;
  label: string;
  hidden: boolean;
  sort_order: number;
}

export interface NhMeterCategory {
  site_id: string;
  organization_id: string;
  circuit_name: string;
  category: string;
}

export interface NhMetric {
  id: string;
  organization_id: string;
  site_id: string;
  name: string;
  source: string;
  unit: string;
  circuit_names: string[];
  lower_is_better: boolean;
  sort_order: number;
}

export interface NhSiteSettings {
  site_id: string;
  organization_id: string;
  comparison_metrics: string[];
  comfort_min_c: number | null;
  comfort_max_c: number | null;
}

const OrgInput = z.object({ orgId: z.string().uuid() });

export const loadNeutralHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgInput.parse(d))
  .handler(async ({ data, context }): Promise<NeutralHomeBundle> => {
    const { supabase } = context;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [sites, periods, cats, meterCats, metrics, settings, roomMap] = await Promise.all([
      supabase
        .from("neutral_home_sites" as any)
        .select("*")
        .eq("organization_id", data.orgId)
        .order("name"),
      supabase
        .from("neutral_home_periods" as any)
        .select("*")
        .eq("organization_id", data.orgId)
        .order("period_start", { ascending: false }),
      supabase
        .from("neutral_home_categories" as any)
        .select("*")
        .eq("organization_id", data.orgId)
        .order("sort_order"),
      supabase
        .from("neutral_home_meter_categories" as any)
        .select("*")
        .eq("organization_id", data.orgId),
      supabase
        .from("neutral_home_metrics" as any)
        .select("*")
        .eq("organization_id", data.orgId)
        .order("sort_order"),
      supabase
        .from("neutral_home_site_settings" as any)
        .select("*")
        .eq("organization_id", data.orgId),
      supabase
        .from("neutral_home_room_map" as any)
        .select("*")
        .eq("organization_id", data.orgId),
    ]);
    if (sites.error) throw new Error(sites.error.message);
    if (periods.error) throw new Error(periods.error.message);
    if (cats.error) throw new Error(cats.error.message);
    if (meterCats.error) throw new Error(meterCats.error.message);
    if (metrics.error) throw new Error(metrics.error.message);
    if (settings.error) throw new Error(settings.error.message);
    if (roomMap.error) throw new Error(roomMap.error.message);

    const circuits: CircuitRecord[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 30; page++) {
      const { data: rows, error } = await supabase
        .from("neutral_home_circuits" as any)
        .select("*")
        .eq("organization_id", data.orgId)
        .order("circuit_name")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = (rows ?? []) as unknown as CircuitRecord[];
      circuits.push(...batch);
      if (batch.length < pageSize) break;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      sites: (sites.data ?? []) as unknown as NhSite[],
      periods: (periods.data ?? []) as unknown as NhPeriod[],
      circuits,
      categories: (cats.data ?? []) as unknown as NhCategoryRow[],
      meterCategories: (meterCats.data ?? []) as unknown as NhMeterCategory[],
      metrics: (metrics.data ?? []) as unknown as NhMetric[],
      settings: (settings.data ?? []) as unknown as NhSiteSettings[],
      roomMap: (roomMap.data ?? []) as unknown as NhRoomMap[],
    };
  });

const SiteInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  address: z.string().max(400).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),
  floor_area_m2: z.number().min(0).nullable().optional(),
  occupancy: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertNhSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SiteInput.parse(d))
  .handler(async ({ data, context }): Promise<NhSite> => {
    const payload = {
      organization_id: data.organization_id,
      name: data.name,
      address: data.address ?? null,
      postcode: data.postcode ?? null,
      floor_area_m2: data.floor_area_m2 ?? null,
      occupancy: data.occupancy ?? null,
      notes: data.notes ?? null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = context.supabase.from("neutral_home_sites" as any);
    const q = data.id
      ? table.update(payload).eq("id", data.id).select().single()
      : table.insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row as unknown as NhSite;
  });

export const deleteNhSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_sites" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CircuitInput = z.object({
  circuit_name: z.string().trim().min(1).max(300),
  category: z.string().max(40),
  is_aggregate: z.boolean(),
  usage_kwh: z.number().nullable(),
  co2_kg: z.number().nullable(),
  blended_p_kwh: z.number().nullable(),
  day_p_kwh: z.number().nullable(),
  night_p_kwh: z.number().nullable(),
  total_cost_p: z.number().nullable(),
  day_kwh: z.number().nullable(),
  day_pct: z.number().nullable(),
  night_kwh: z.number().nullable(),
  night_pct: z.number().nullable(),
  daynight_total_kwh: z.number().nullable(),
  usage_kwh_per_person: z.number().nullable(),
  usage_kwh_per_m2: z.number().nullable(),
  cost_p_per_person: z.number().nullable(),
  cost_p_per_m2: z.number().nullable(),
  co2_kg_per_person: z.number().nullable(),
  co2_kg_per_m2: z.number().nullable(),
});

const RoomHourInput = z.object({
  room_name: z.string().trim().min(1).max(300),
  hour_ts: z.string().min(10).max(40),
  temp_min: z.number().nullable(),
  temp_avg: z.number().nullable(),
  temp_max: z.number().nullable(),
  set_temp_avg: z.number().nullable(),
  on_share: z.number().nullable(),
  reading_count: z.number().int().min(0),
});

const SavePeriodInput = z.object({
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_headline_filename: z.string().max(300).nullable().optional(),
  source_daynight_filename: z.string().max(300).nullable().optional(),
  source_temperature_filename: z.string().max(600).nullable().optional(),
  mode: z.enum(["merge", "replace"]),
  circuits: z.array(CircuitInput).min(1).max(3000),
  /** when true a replace also clears previously stored temperature rows */
  hasTemperature: z.boolean().optional(),
});

export const saveNhPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SavePeriodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data: existing, error: findErr } = await supabase
      .from("neutral_home_periods" as any)
      .select("id")
      .eq("site_id", data.site_id)
      .eq("period_start", data.period_start)
      .eq("period_end", data.period_end)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    let periodId = (existing as { id?: string } | null)?.id ?? null;

    if (periodId) {
      const { error } = await supabase
        .from("neutral_home_periods" as any)
        .update({
          label: data.label,
          source_headline_filename: data.source_headline_filename ?? null,
          source_daynight_filename: data.source_daynight_filename ?? null,
          ...(data.source_temperature_filename
            ? { source_temperature_filename: data.source_temperature_filename }
            : {}),
        })
        .eq("id", periodId);
      if (error) throw new Error(error.message);
      if (data.mode === "replace") {
        const { error: delErr } = await supabase
          .from("neutral_home_circuits" as any)
          .delete()
          .eq("period_id", periodId);
        if (delErr) throw new Error(delErr.message);
        if (data.hasTemperature) {
          const { error: delTemp } = await supabase
            .from("neutral_home_room_hours" as any)
            .delete()
            .eq("period_id", periodId);
          if (delTemp) throw new Error(delTemp.message);
        }
      }
    } else {
      const { data: row, error } = await supabase
        .from("neutral_home_periods" as any)
        .insert({
          organization_id: data.organization_id,
          site_id: data.site_id,
          label: data.label,
          period_start: data.period_start,
          period_end: data.period_end,
          source_headline_filename: data.source_headline_filename ?? null,
          source_daynight_filename: data.source_daynight_filename ?? null,
          source_temperature_filename: data.source_temperature_filename ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      periodId = (row as unknown as { id: string }).id;
    }

    const payload = data.circuits.map((c) => ({
      ...c,
      period_id: periodId,
      organization_id: data.organization_id,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase
        .from("neutral_home_circuits" as any)
        .upsert(payload.slice(i, i + 500), { onConflict: "period_id,circuit_name" });
      if (error) throw new Error(error.message);
    }

    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { periodId: periodId as string, circuits: payload.length };
  });

const AppendRoomHoursInput = z.object({
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  period_id: z.string().uuid(),
  rows: z.array(RoomHourInput).min(1).max(4000),
});

/** Writes one chunk of hourly temperature rows for a period. */
export const appendNhRoomHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AppendRoomHoursInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_room_hours" as any)
      .upsert(
        data.rows.map((r) => ({
          ...r,
          period_id: data.period_id,
          site_id: data.site_id,
          organization_id: data.organization_id,
        })),
        { onConflict: "period_id,room_name,hour_ts" },
      );
    if (error) throw new Error(error.message);
    return { written: data.rows.length };
  });

export const loadNhRoomHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ periodId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RoomHourRow[]> => {
    const out: RoomHourRow[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 80; page++) {
      const { data: rows, error } = await context.supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("neutral_home_room_hours" as any)
        .select("period_id,room_name,hour_ts,temp_min,temp_avg,temp_max,set_temp_avg,on_share,reading_count")
        .eq("period_id", data.periodId)
        .order("hour_ts")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = (rows ?? []) as unknown as RoomHourRow[];
      out.push(...batch);
      if (batch.length < pageSize) break;
    }
    return out;
  });

const RoomMapInput = z.object({
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  entries: z
    .array(
      z.object({
        room_name: z.string().trim().min(1).max(300),
        /** null clears the mapping */
        circuit_name: z.string().trim().min(1).max(300).nullable(),
        auto_matched: z.boolean().optional(),
        confidence: z.number().nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export const setNhRoomMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoomMapInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = () => context.supabase.from("neutral_home_room_map" as any);
    // Every known room keeps a row (circuit_name null = unmapped), so the map
    // doubles as the room registry for the site.
    for (let i = 0; i < data.entries.length; i += 500) {
      const { error } = await table().upsert(
        data.entries.slice(i, i + 500).map((e) => ({
          site_id: data.site_id,
          organization_id: data.organization_id,
          room_name: e.room_name,
          circuit_name: e.circuit_name,
          auto_matched: e.auto_matched ?? false,
          confidence: e.confidence ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "site_id,room_name" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteNhPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_periods" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Per-site configuration: categories, meter mapping, user metrics     */
/* ------------------------------------------------------------------ */

const CategoryInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  code: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  hidden: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const upsertNhCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CategoryInput.parse(d))
  .handler(async ({ data, context }): Promise<NhCategoryRow> => {
    const payload = {
      organization_id: data.organization_id,
      site_id: data.site_id,
      code: data.code,
      label: data.label,
      hidden: data.hidden ?? false,
      sort_order: data.sort_order ?? 100,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_categories" as any)
      .upsert(payload, { onConflict: "site_id,code" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as NhCategoryRow;
  });

export const deleteNhCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_categories" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MeterCategoryInput = z.object({
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  circuit_name: z.string().trim().min(1).max(300),
  /** null clears the override and falls back to the auto-detected category */
  category: z.string().trim().max(60).nullable(),
});

export const setNhMeterCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MeterCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = context.supabase.from("neutral_home_meter_categories" as any);
    if (!data.category) {
      const { error } = await table
        .delete()
        .eq("site_id", data.site_id)
        .eq("circuit_name", data.circuit_name);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await table.upsert(
      {
        organization_id: data.organization_id,
        site_id: data.site_id,
        circuit_name: data.circuit_name,
        category: data.category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,circuit_name" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MetricInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  source: z.enum([
    "usage_kwh",
    "co2_kg",
    "total_cost_p",
    "day_kwh",
    "night_kwh",
    "night_share",
  ]),
  unit: z.string().trim().max(20),
  circuit_names: z.array(z.string().trim().min(1).max(300)).max(2000),
  lower_is_better: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const upsertNhMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MetricInput.parse(d))
  .handler(async ({ data, context }): Promise<NhMetric> => {
    const payload = {
      organization_id: data.organization_id,
      site_id: data.site_id,
      name: data.name,
      source: data.source,
      unit: data.unit,
      circuit_names: data.circuit_names,
      lower_is_better: data.lower_is_better ?? true,
      sort_order: data.sort_order ?? 100,
      updated_at: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = context.supabase.from("neutral_home_metrics" as any);
    const q = data.id
      ? table.update(payload).eq("id", data.id).select().single()
      : table.insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row as unknown as NhMetric;
  });

export const deleteNhMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_metrics" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SiteSettingsInput = z.object({
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  comparison_metrics: z.array(z.string().min(1).max(80)).max(60),
  comfort_min_c: z.number().min(-20).max(50).optional(),
  comfort_max_c: z.number().min(-20).max(50).optional(),
});

export const saveNhSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SiteSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("neutral_home_site_settings" as any)
      .upsert(
        {
          site_id: data.site_id,
          organization_id: data.organization_id,
          comparison_metrics: data.comparison_metrics,
          ...(data.comfort_min_c == null ? {} : { comfort_min_c: data.comfort_min_c }),
          ...(data.comfort_max_c == null ? {} : { comfort_max_c: data.comfort_max_c }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });