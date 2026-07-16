// Server-only ingestion runner. Fetches a CSV export URL, parses it,
// pivots to daily half-hourly rows, and inserts via the admin client.
import Papa from "papaparse";

import { TIMESTAMP_RE, STRUCTURAL_FIELDS } from "@/lib/csv-parser";

interface ParsedCsv {
  headers: string[];
  timestampColumns: string[];
  rows: Record<string, string>[];
}

function parseTimestamp(col: string): { date: string; hh: string; mm: string } | null {
  const m = TIMESTAMP_RE.exec(col);
  if (!m) return null;
  let y: string, mo: string, d: string;
  if (m[1]) { y = m[1]; mo = m[2]; d = m[3]; }
  else { d = m[4].padStart(2, "0"); mo = m[5].padStart(2, "0"); y = m[6]; }
  return { date: `${y}-${mo}-${d}`, hh: m[7].padStart(2, "0"), mm: m[8] };
}

function slotIndex(hh: string, mm: string): number {
  return parseInt(hh, 10) * 2 + (mm === "30" ? 1 : 0);
}

function parseCsvString(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  const timestampColumns = headers.filter((h) => TIMESTAMP_RE.test(h));
  return { headers, timestampColumns, rows: result.data };
}

interface Building { id: string; csv_matched_name: string }
interface Override {
  raw_meter_name: string;
  assigned_building_id: string | null;
  calibrated_meter_factor: number | null;
  custom_display_name: string | null;
}

function pivot(parsed: ParsedCsv, orgId: string, buildings: Building[], overrides: Override[]) {
  const out: Record<string, unknown>[] = [];
  const matchMap = new Map(buildings.map((b) => [b.csv_matched_name, b.id]));
  const overrideMap = new Map(overrides.map((o) => [o.raw_meter_name, o]));

  for (const row of parsed.rows) {
    const orgUnit = row["OrganizationalUnits.Name"] ?? "";
    const rawMeter = row["Meters.Name"] ?? "";
    const override = overrideMap.get(rawMeter) ?? null;
    const csvFactor = Number(row["Meters.Meterfactor"] ?? "1") || 1;
    const buildingId = override?.assigned_building_id ?? matchMap.get(orgUnit) ?? null;
    const meterFactor = override?.calibrated_meter_factor ?? csvFactor;
    const meterDisplayName = override?.custom_display_name ?? null;

    const perDate = new Map<string, (number | null)[]>();
    for (const col of parsed.timestampColumns) {
      const t = parseTimestamp(col);
      if (!t) continue;
      if (!perDate.has(t.date)) perDate.set(t.date, new Array(48).fill(null));
      const raw = row[col];
      const val = raw === "" || raw == null ? null : Number(raw);
      perDate.get(t.date)![slotIndex(t.hh, t.mm)] = Number.isFinite(val as number) ? (val as number) : null;
    }

    for (const [date, values] of perDate) {
      out.push({
        organization_id: orgId,
        building_id: buildingId,
        original_org_unit_name: orgUnit,
        meter_name: rawMeter,
        meter_factor: meterFactor,
        variable_code: row["Variables.Code"] ?? "",
        variable_name: row["Variables.Name"] ?? "",
        variable_category: row["Variables.Category"] ?? "",
        interval_date: date,
        half_hourly_values: values,
        meter_display_name: meterDisplayName,
      });
    }
  }
  return out;
}

export interface RunResult { rowsImported: number; unmatchedUnits: string[] }

export async function runIngestionSchedule(scheduleId: string): Promise<RunResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: sched, error: sErr } = await supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("ingestion_schedules" as any)
    .select("*")
    .eq("id", scheduleId)
    .single();
  if (sErr || !sched) throw new Error(sErr?.message || "Schedule not found");
  const schedule = sched as unknown as {
    id: string; organization_id: string; source_url: string; enabled: boolean;
  };
  if (!schedule.enabled) throw new Error("Schedule is disabled");

  const markFailure = async (message: string) => {
    await supabaseAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("ingestion_schedules" as any)
      .update({ last_status: "error", last_error: message.slice(0, 500), last_synced_at: new Date().toISOString() })
      .eq("id", schedule.id);
  };

  let csvText: string;
  try {
    const res = await fetch(schedule.source_url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csvText = await res.text();
  } catch (e) {
    const msg = `Download failed: ${(e as Error).message}`;
    await markFailure(msg);
    throw new Error(msg);
  }

  const parsed = parseCsvString(csvText);
  if (parsed.timestampColumns.length === 0) {
    await markFailure("No timestamp columns found in downloaded CSV");
    throw new Error("No timestamp columns found");
  }

  const [{ data: buildings }, { data: overrides }] = await Promise.all([
    supabaseAdmin.from("buildings").select("id, csv_matched_name").eq("organization_id", schedule.organization_id),
    supabaseAdmin.from("meter_overrides").select("*").eq("organization_id", schedule.organization_id),
  ]);

  const rows = pivot(
    parsed,
    schedule.organization_id,
    (buildings ?? []) as Building[],
    (overrides ?? []) as Override[],
  );

  // Replace existing rows only for the exact (meter, date) pairs present in
  // the new payload — never wipe meters that happen to be missing from this
  // download. Group deletes per meter to keep the org idempotent without
  // touching unrelated meters' historical data.
  const perMeterDates = new Map<string, Set<string>>();
  for (const r of rows) {
    const meter = r.meter_name as string;
    const date = r.interval_date as string;
    if (!perMeterDates.has(meter)) perMeterDates.set(meter, new Set());
    perMeterDates.get(meter)!.add(date);
  }
  for (const [meter, dateSet] of perMeterDates) {
    const { error: delErr } = await supabaseAdmin
      .from("consumption_rows")
      .delete()
      .eq("organization_id", schedule.organization_id)
      .eq("meter_name", meter)
      .in("interval_date", Array.from(dateSet));
    if (delErr) { await markFailure(`Cleanup failed: ${delErr.message}`); throw new Error(delErr.message); }
  }

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from("consumption_rows").insert(batch as never);
    if (error) { await markFailure(`Insert failed: ${error.message}`); throw new Error(error.message); }
  }

  const unitSet = new Set(parsed.rows.map((r) => r["OrganizationalUnits.Name"]).filter(Boolean));
  const matched = new Set((buildings ?? []).map((b) => (b as Building).csv_matched_name));
  const unmatchedUnits = Array.from(unitSet).filter((u) => !matched.has(u));

  await supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("ingestion_schedules" as any)
    .update({
      last_status: "success",
      last_error: null,
      last_synced_at: new Date().toISOString(),
      last_rows_imported: rows.length,
    })
    .eq("id", schedule.id);

  // Touch STRUCTURAL_FIELDS reference so it's kept as an intentional import.
  void STRUCTURAL_FIELDS;
  return { rowsImported: rows.length, unmatchedUnits };
}