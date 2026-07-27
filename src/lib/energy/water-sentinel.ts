import type { Building, ConsumptionRow, Organisation, Schedule } from "@/lib/data-store";
import { resolveProfile, type ResolvedProfile } from "./profile";
import { classifyUtility } from "./league";

export const DEFAULT_WINDOW_START = "23:00";
export const DEFAULT_WINDOW_END = "05:30";
export const DEFAULT_SENSITIVITY_M3 = 0.05;
export const DEFAULT_CONSECUTIVE = 3;
export const DEFAULT_WATER_TARIFF_PENCE = 250; // £2.50 / m3
export const DEFAULT_WASTEWATER_PENCE = 150; // £1.50 / m3

export interface SentinelSettings {
  windowStart: string; // "HH:MM"
  windowEnd: string;   // "HH:MM"
  sensitivityM3: number;
  consecutiveIntervals: number;
  waterPencePerM3: number;
  wastewaterPencePerM3: number;
}

export type LeakStatus =
  | "critical"      // never reaches zero across the overnight window
  | "minor"         // above sensitivity for N consecutive intervals
  | "normal"        // reaches zero flow
  | "incomplete";   // missing / null telemetry — excluded from scoring

export const STATUS_LABEL: Record<LeakStatus, string> = {
  critical: "Critical Persistent Leak",
  minor: "Suspected Minor Leak",
  normal: "Normal / Zero Flow",
  incomplete: "Data Incomplete",
};

export interface NightResult {
  /** ISO date of the evening the night started on */
  date: string;
  minM3: number;
  totalM3: number;
  slots: number;
  missingSlots: number;
  complete: boolean;
  reachedZero: boolean;
  maxConsecutiveAbove: number;
}

export interface MeterLeakResult {
  rawMeterName: string;
  displayName: string;
  buildingId: string | null;
  buildingName: string;
  status: LeakStatus;
  nights: number;
  nightsAnalysed: number;
  minFlowM3PerHour: number;
  avgNightVolumeM3: number;
  totalNightVolumeM3: number;
  leakVolumePerNightM3: number;
  leakVolumePerMonthM3: number;
  totalLeakVolumeM3: number;
  costPerNightGbp: number;
  costPerMonthGbp: number;
  totalCostGbp: number;
  co2Kg: number;
  windowHours: number;
  nightResults: NightResult[];
}

export function hhmmToSlot(t: string): number {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return Math.max(0, Math.min(47, (h || 0) * 2 + ((m || 0) >= 30 ? 1 : 0)));
}

/** Slots belonging to the unoccupied window, split across the evening and the following morning. */
export function windowSlots(settings: SentinelSettings): { evening: number[]; morning: number[] } {
  const start = hhmmToSlot(settings.windowStart);
  const end = hhmmToSlot(settings.windowEnd);
  const evening: number[] = [];
  const morning: number[] = [];
  if (start < end) {
    for (let i = start; i < end; i++) evening.push(i);
  } else {
    for (let i = start; i < 48; i++) evening.push(i);
    for (let i = 0; i < end; i++) morning.push(i);
  }
  return { evening, morning };
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A non-trading day (closed / weekend / holiday) is fully unoccupied. */
export function isNonTradingDay(iso: string, profile: ResolvedProfile): boolean {
  if (profile.holidays?.includes(iso)) return true;
  return !profile.activeDays.includes(utcDay(iso));
}

export function defaultSettings(org?: Organisation): SentinelSettings {
  return {
    windowStart: DEFAULT_WINDOW_START,
    windowEnd: DEFAULT_WINDOW_END,
    sensitivityM3: DEFAULT_SENSITIVITY_M3,
    consecutiveIntervals: DEFAULT_CONSECUTIVE,
    waterPencePerM3: org?.tariff_water_pence_per_m3 ?? DEFAULT_WATER_TARIFF_PENCE,
    wastewaterPencePerM3: DEFAULT_WASTEWATER_PENCE,
  };
}

function scaled(row: ConsumptionRow | undefined, slot: number, factor: number): number | null {
  if (!row) return null;
  const v = row.half_hourly_values[slot];
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v) * factor;
}

export interface MeterInput {
  rawMeterName: string;
  displayName: string;
  buildingId: string | null;
  buildingName: string;
  factor: number;
  rows: ConsumptionRow[]; // water rows for this meter, any date
  profile: ResolvedProfile;
}

/** Analyse one water meter across [startISO, endISO]. */
export function analyseMeter(
  input: MeterInput,
  settings: SentinelSettings,
  startISO: string,
  endISO: string,
  co2KgPerM3: number,
): MeterLeakResult {
  const byDate = new Map(input.rows.map((r) => [r.interval_date, r] as const));
  const { evening, morning } = windowSlots(settings);
  const nightResults: NightResult[] = [];

  for (let iso = startISO; iso <= endISO; iso = isoAddDays(iso, 1)) {
    const rowA = byDate.get(iso);
    const rowB = byDate.get(isoAddDays(iso, 1));
    if (!rowA && !rowB) continue;

    const fullyClosed = isNonTradingDay(iso, input.profile);
    const slots: Array<{ row: ConsumptionRow | undefined; slot: number }> = fullyClosed
      ? Array.from({ length: 48 }, (_, i) => ({ row: rowA, slot: i })).concat(
          morning.map((s) => ({ row: rowB, slot: s })),
        )
      : evening
          .map((s) => ({ row: rowA, slot: s }))
          .concat(morning.map((s) => ({ row: rowB, slot: s })));

    let min = Number.POSITIVE_INFINITY;
    let total = 0;
    let missing = 0;
    let present = 0;
    let reachedZero = false;
    let run = 0;
    let maxRun = 0;
    for (const { row, slot } of slots) {
      const v = scaled(row, slot, input.factor);
      if (v == null) { missing++; run = 0; continue; }
      present++;
      total += v;
      if (v < min) min = v;
      if (v <= 0) { reachedZero = true; run = 0; }
      else if (v > settings.sensitivityM3) { run++; if (run > maxRun) maxRun = run; }
      else run = 0;
    }
    if (present === 0) continue;
    nightResults.push({
      date: iso,
      minM3: Number.isFinite(min) ? min : 0,
      totalM3: total,
      slots: slots.length,
      missingSlots: missing,
      complete: missing === 0,
      reachedZero,
      maxConsecutiveAbove: maxRun,
    });
  }

  const analysed = nightResults.filter((n) => n.complete);
  const windowHours = (evening.length + morning.length) / 2;

  let status: LeakStatus;
  if (analysed.length === 0) status = "incomplete";
  else if (analysed.every((n) => !n.reachedZero)) status = "critical";
  else if (analysed.some((n) => n.maxConsecutiveAbove >= settings.consecutiveIntervals)) status = "minor";
  else status = "normal";

  const minFlowM3PerHour =
    analysed.length > 0 ? Math.min(...analysed.map((n) => n.minM3)) * 2 : 0;
  const totalNight = analysed.reduce((s, n) => s + n.totalM3, 0);
  const avgNight = analysed.length ? totalNight / analysed.length : 0;

  const leaking = status === "critical" || status === "minor";
  const leakPerNight = leaking ? minFlowM3PerHour * windowHours : 0;
  const totalLeak = leakPerNight * analysed.length;
  const pencePerM3 = settings.waterPencePerM3 + settings.wastewaterPencePerM3;
  const cost = (m3: number) => (m3 * pencePerM3) / 100;

  return {
    rawMeterName: input.rawMeterName,
    displayName: input.displayName,
    buildingId: input.buildingId,
    buildingName: input.buildingName,
    status,
    nights: nightResults.length,
    nightsAnalysed: analysed.length,
    minFlowM3PerHour,
    avgNightVolumeM3: avgNight,
    totalNightVolumeM3: totalNight,
    leakVolumePerNightM3: leakPerNight,
    leakVolumePerMonthM3: leakPerNight * 30,
    totalLeakVolumeM3: totalLeak,
    costPerNightGbp: cost(leakPerNight),
    costPerMonthGbp: cost(leakPerNight * 30),
    totalCostGbp: cost(totalLeak),
    co2Kg: totalLeak * co2KgPerM3,
    windowHours,
    nightResults,
  };
}

export interface BuildMeterInputsArgs {
  orgId: string;
  consumption: ConsumptionRow[];
  buildings: Building[];
  schedules: Schedule[];
  org?: Organisation;
  registry: Array<{
    raw_meter_name: string;
    custom_display_name?: string | null;
    utility_category?: string;
    effective_building_id: string | null;
    effective_building_name: string;
    effective_meter_factor: number;
  }>;
}

/** Isolate water meters for an org and prepare their analysis inputs. */
export function buildWaterMeterInputs(args: BuildMeterInputsArgs): MeterInput[] {
  const { orgId, consumption, buildings, schedules, org, registry } = args;
  const rowsByMeter = new Map<string, ConsumptionRow[]>();
  for (const r of consumption) {
    if (r.organization_id !== orgId) continue;
    if (classifyUtility(r.variable_category) !== "water") continue;
    const list = rowsByMeter.get(r.meter_name);
    if (list) list.push(r);
    else rowsByMeter.set(r.meter_name, [r]);
  }

  const buildingsById = new Map(buildings.map((b) => [b.id, b] as const));
  const inputs: MeterInput[] = [];
  for (const [rawMeterName, rows] of rowsByMeter) {
    const reg = registry.find((m) => m.raw_meter_name === rawMeterName);
    const buildingId = reg?.effective_building_id ?? rows[0]?.building_id ?? null;
    const building = buildingId ? buildingsById.get(buildingId) : undefined;
    const profile = resolveProfile(
      org,
      building,
      schedules.filter((s) => s.building_id === (building?.id ?? "")),
    );
    inputs.push({
      rawMeterName,
      displayName: reg?.custom_display_name || rows[0]?.meter_display_name || rawMeterName,
      buildingId,
      buildingName: building?.custom_display_name ?? reg?.effective_building_name ?? "Unassigned",
      factor: reg?.effective_meter_factor ?? rows[0]?.meter_factor ?? 1,
      rows,
      profile,
    });
  }
  return inputs.sort((a, b) =>
    a.buildingName.localeCompare(b.buildingName) || a.displayName.localeCompare(b.displayName));
}

export interface IntervalPoint {
  label: string;
  date: string;
  slot: number;
  value: number | null;
  overnight: boolean;
  aboveBaseline: number | null;
}

/** Half-hourly series for the last N days of a meter, tagged with the unoccupied window. */
export function meterIntervalSeries(
  input: MeterInput,
  settings: SentinelSettings,
  endISO: string,
  days: number,
  baseline: number,
): IntervalPoint[] {
  const byDate = new Map(input.rows.map((r) => [r.interval_date, r] as const));
  const out: IntervalPoint[] = [];
  const startISO = isoAddDays(endISO, -(days - 1));
  const { evening, morning } = windowSlots(settings);
  const eveningSet = new Set(evening);
  const morningSet = new Set(morning);
  for (let iso = startISO; iso <= endISO; iso = isoAddDays(iso, 1)) {
    const row = byDate.get(iso);
    const closed = isNonTradingDay(iso, input.profile);
    for (let slot = 0; slot < 48; slot++) {
      const v = scaled(row, slot, input.factor);
      const overnight = closed || eveningSet.has(slot) || morningSet.has(slot);
      out.push({
        label: `${iso.slice(5)} ${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 === 0 ? "00" : "30"}`,
        date: iso,
        slot,
        value: v,
        overnight,
        aboveBaseline: overnight && v != null && v > baseline ? v : null,
      });
    }
  }
  return out;
}