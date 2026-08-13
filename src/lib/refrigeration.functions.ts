import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type {
  RefrigerationCaseRow,
  RefrigerationSettingsRow,
} from "@/lib/refrigeration/types";

const CASE_META =
  "id, organization_id, building_id, case_id, label, description, controller, controller_description, max_safe_temp, efficiency_red, efficiency_amber, status, source_filename, updated_at";

const OrgInput = z.object({ orgId: z.string().uuid() });

export interface RefrigerationOverview {
  cases: RefrigerationCaseRow[];
  settings: RefrigerationSettingsRow | null;
  alarmBuildingIds: string[];
}

export const loadRefrigerationOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgInput.parse(d))
  .handler(async ({ data, context }): Promise<RefrigerationOverview> => {
    const { supabase } = context;
    const [cases, settings, alarms] = await Promise.all([
      supabase
        .from("refrigeration_cases")
        .select(CASE_META)
        .eq("organization_id", data.orgId)
        .order("case_id"),
      supabase
        .from("refrigeration_settings")
        .select("*")
        .eq("organization_id", data.orgId)
        .maybeSingle(),
      supabase
        .from("refrigeration_alarm_logs")
        .select("building_id")
        .eq("organization_id", data.orgId),
    ]);
    if (cases.error) throw new Error(cases.error.message);
    if (settings.error) throw new Error(settings.error.message);
    if (alarms.error) throw new Error(alarms.error.message);
    return {
      cases: (cases.data ?? []) as RefrigerationCaseRow[],
      settings: (settings.data as RefrigerationSettingsRow | null) ?? null,
      alarmBuildingIds: (alarms.data ?? []).map((r) => r.building_id),
    };
  });

const BuildingInput = z.object({
  orgId: z.string().uuid(),
  buildingId: z.string().uuid(),
});

export interface BuildingRefrigeration {
  cases: RefrigerationCaseRow[];
  alarmCsv: string | null;
}

/** Full payload (including raw CSV) for one building's refrigeration cases. */
export const loadBuildingRefrigeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuildingInput.parse(d))
  .handler(async ({ data, context }): Promise<BuildingRefrigeration> => {
    const { supabase } = context;
    const [cases, alarm] = await Promise.all([
      supabase
        .from("refrigeration_cases")
        .select(`${CASE_META}, csv_text`)
        .eq("organization_id", data.orgId)
        .eq("building_id", data.buildingId)
        .order("case_id"),
      supabase
        .from("refrigeration_alarm_logs")
        .select("alarm_csv")
        .eq("organization_id", data.orgId)
        .eq("building_id", data.buildingId)
        .maybeSingle(),
    ]);
    if (cases.error) throw new Error(cases.error.message);
    if (alarm.error) throw new Error(alarm.error.message);
    return {
      cases: (cases.data ?? []) as RefrigerationCaseRow[],
      alarmCsv: (alarm.data?.alarm_csv as string | undefined) ?? null,
    };
  });

const SaveCaseInput = z.object({
  orgId: z.string().uuid(),
  buildingId: z.string().uuid(),
  caseId: z.string().min(1),
  label: z.string().default(""),
  description: z.string().default(""),
  controller: z.string().default(""),
  controllerDescription: z.string().default(""),
  csvText: z.string().min(1),
  sourceFilename: z.string().nullish(),
  mode: z.enum(["merge", "replace"]).default("merge"),
  maxSafeTemp: z.number().nullish(),
  efficiencyRed: z.number().nullish(),
  efficiencyAmber: z.number().nullish(),
});

export const saveRefrigerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveCaseInput.parse(d))
  .handler(async ({ data, context }): Promise<{ created: boolean }> => {
    const { supabase } = context;
    const { mergeCSVTexts } = await import("@/lib/refrigeration/parse");

    const existing = await supabase
      .from("refrigeration_cases")
      .select("id, csv_text")
      .eq("organization_id", data.orgId)
      .eq("building_id", data.buildingId)
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const prev = (existing.data.csv_text as string | null) ?? "";
      const csv =
        data.mode === "merge" && prev ? mergeCSVTexts(prev, data.csvText) : data.csvText;
      type CaseUpdate = Database["public"]["Tables"]["refrigeration_cases"]["Update"];
      const patch: CaseUpdate = {
        csv_text: csv,
        source_filename: data.sourceFilename ?? null,
        updated_at: new Date().toISOString(),
      };
      if (data.label) patch.label = data.label;
      if (data.description) patch.description = data.description;
      if (data.controller) patch.controller = data.controller;
      if (data.controllerDescription) patch.controller_description = data.controllerDescription;
      const { error } = await supabase
        .from("refrigeration_cases")
        .update(patch)
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
      return { created: false };
    }

    const settings = await supabase
      .from("refrigeration_settings")
      .select("*")
      .eq("organization_id", data.orgId)
      .maybeSingle();

    const row = {
      organization_id: data.orgId,
      building_id: data.buildingId,
      case_id: data.caseId,
      label: data.label || data.description || data.caseId,
      description: data.description,
      controller: data.controller,
      controller_description: data.controllerDescription,
      csv_text: data.csvText,
      source_filename: data.sourceFilename ?? null,
      max_safe_temp:
        data.maxSafeTemp ?? settings.data?.default_max_safe_temp ?? 8,
      efficiency_red:
        data.efficiencyRed ?? settings.data?.default_efficiency_red ?? 5,
      efficiency_amber:
        data.efficiencyAmber ?? settings.data?.default_efficiency_amber ?? 2,
    };
    const { error } = await supabase.from("refrigeration_cases").insert(row);
    if (error) throw new Error(error.message);
    return { created: true };
  });

const UpdateCaseInput = z.object({
  id: z.string().uuid(),
  label: z.string().optional(),
  buildingId: z.string().uuid().optional(),
  maxSafeTemp: z.number().optional(),
  efficiencyRed: z.number().optional(),
  efficiencyAmber: z.number().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const updateRefrigerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateCaseInput.parse(d))
  .handler(async ({ data, context }) => {
    type CaseUpdate = Database["public"]["Tables"]["refrigeration_cases"]["Update"];
      const patch: CaseUpdate = { updated_at: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.buildingId !== undefined) patch.building_id = data.buildingId;
    if (data.maxSafeTemp !== undefined) patch.max_safe_temp = data.maxSafeTemp;
    if (data.efficiencyRed !== undefined) patch.efficiency_red = data.efficiencyRed;
    if (data.efficiencyAmber !== undefined) patch.efficiency_amber = data.efficiencyAmber;
    if (data.status !== undefined) patch.status = data.status;
    const { error } = await context.supabase
      .from("refrigeration_cases")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRefrigerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("refrigeration_cases")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AlarmInput = z.object({
  orgId: z.string().uuid(),
  buildingId: z.string().uuid(),
  alarmCsv: z.string().min(1),
  sourceFilename: z.string().nullish(),
});

export const saveRefrigerationAlarmLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AlarmInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("refrigeration_alarm_logs").upsert(
      {
        organization_id: data.orgId,
        building_id: data.buildingId,
        alarm_csv: data.alarmCsv,
        source_filename: data.sourceFilename ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "building_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SettingsInput = z.object({
  orgId: z.string().uuid(),
  defaultMaxSafeTemp: z.number(),
  defaultEfficiencyRed: z.number(),
  defaultEfficiencyAmber: z.number(),
});

export const saveRefrigerationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("refrigeration_settings").upsert(
      {
        organization_id: data.orgId,
        default_max_safe_temp: data.defaultMaxSafeTemp,
        default_efficiency_red: data.defaultEfficiencyRed,
        default_efficiency_amber: data.defaultEfficiencyAmber,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
