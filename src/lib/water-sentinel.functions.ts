import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SentinelSettingsRow {
  organization_id: string;
  window_start: string;
  window_end: string;
  sensitivity_m3: number;
  consecutive_intervals: number;
  wastewater_pence_per_m3: number;
}

export interface LeakAckRow {
  id: string;
  organization_id: string;
  raw_meter_name: string;
  status: string;
  note: string | null;
  period_start: string | null;
  period_end: string | null;
  acknowledged_by: string | null;
  updated_at: string;
}

export interface WaterSentinelBundle {
  settings: SentinelSettingsRow | null;
  acks: LeakAckRow[];
}

const OrgIdInput = z.object({ orgId: z.string().uuid() });

export const loadWaterSentinel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgIdInput.parse(d))
  .handler(async ({ data, context }): Promise<WaterSentinelBundle> => {
    const { supabase } = context;
    const [settings, acks] = await Promise.all([
      supabase
        .from("water_sentinel_settings")
        .select("*")
        .eq("organization_id", data.orgId)
        .maybeSingle(),
      supabase
        .from("water_leak_acknowledgements")
        .select("*")
        .eq("organization_id", data.orgId),
    ]);
    if (settings.error) throw new Error(settings.error.message);
    if (acks.error) throw new Error(acks.error.message);
    return {
      settings: (settings.data as SentinelSettingsRow | null) ?? null,
      acks: (acks.data ?? []) as LeakAckRow[],
    };
  });

const SettingsInput = z.object({
  orgId: z.string().uuid(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  sensitivityM3: z.number().min(0).max(1000),
  consecutiveIntervals: z.number().int().min(1).max(48),
  wastewaterPencePerM3: z.number().min(0),
  waterPencePerM3: z.number().min(0),
});

export const saveWaterSentinelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsInput.parse(d))
  .handler(async ({ data, context }): Promise<SentinelSettingsRow> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("water_sentinel_settings")
      .upsert(
        {
          organization_id: data.orgId,
          window_start: data.windowStart,
          window_end: data.windowEnd,
          sensitivity_m3: data.sensitivityM3,
          consecutive_intervals: data.consecutiveIntervals,
          wastewater_pence_per_m3: data.wastewaterPencePerM3,
        },
        { onConflict: "organization_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { error: orgError } = await supabase
      .from("organisations")
      .update({ tariff_water_pence_per_m3: data.waterPencePerM3 })
      .eq("id", data.orgId);
    if (orgError) throw new Error(orgError.message);

    return row as SentinelSettingsRow;
  });

const AckInput = z.object({
  orgId: z.string().uuid(),
  rawMeterName: z.string().min(1),
  status: z.enum(["acknowledged", "dismissed", "open"]),
  note: z.string().max(2000).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export const setLeakAcknowledgement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AckInput.parse(d))
  .handler(async ({ data, context }): Promise<LeakAckRow[]> => {
    const { supabase, userId } = context;
    if (data.status === "open") {
      const { error } = await supabase
        .from("water_leak_acknowledgements")
        .delete()
        .eq("organization_id", data.orgId)
        .eq("raw_meter_name", data.rawMeterName);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("water_leak_acknowledgements").upsert(
        {
          organization_id: data.orgId,
          raw_meter_name: data.rawMeterName,
          status: data.status,
          note: data.note ?? null,
          period_start: data.periodStart ?? null,
          period_end: data.periodEnd ?? null,
          acknowledged_by: userId,
        },
        { onConflict: "organization_id,raw_meter_name" },
      );
      if (error) throw new Error(error.message);
    }
    const { data: rows, error: readError } = await supabase
      .from("water_leak_acknowledgements")
      .select("*")
      .eq("organization_id", data.orgId);
    if (readError) throw new Error(readError.message);
    return (rows ?? []) as LeakAckRow[];
  });