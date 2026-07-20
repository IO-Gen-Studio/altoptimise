import type { Building, ConsumptionRow, Organisation } from "@/lib/data-store";
import { isActiveSlot, type ResolvedProfile } from "./profile";
import { utilityKind } from "./completeness";

export type Utility = "electricity" | "gas" | "water" | "solar";

export interface DateRange {
  start: Date;
  end: Date;
  startISO: string;
  endISO: string;
}

/** Default UK carbon factors (kg CO2e per unit) */
export const DEFAULT_CO2 = {
  electricity: 0.207, // kg/kWh
  gas: 0.183,         // kg/kWh
  water: 0.344,       // kg/m3
  solar: 0,
} as const;

/** Default UK tariff floors (pence per unit) — used only if org has no tariff set */
export const DEFAULT_TARIFF = {
  electricity: 28, // p/kWh
  gas: 8,
  water: 200,      // p/m3
  solar: 0,
} as const;

export function classifyUtility(category: string): Utility | null {
  const c = (category || "").toLowerCase();
  if (c.includes("solar") || c.includes("pv")) return "solar";
  const k = utilityKind(category);
  if (k === "electricity" || k === "gas" || k === "water") return k;
  return null;
}

/** Sum a single ConsumptionRow's HH intervals × meter factor */
export function rowTotal(row: ConsumptionRow): number {
  const f = row.meter_factor || 1;
  let s = 0;
  for (let i = 0; i < 48; i++) {
    const v = row.half_hourly_values[i];
    if (v != null) s += v * f;
  }
  return s;
}

/** Filter rows within [startISO, endISO] inclusive */
export function rowsInRange(rows: ConsumptionRow[], range: DateRange): ConsumptionRow[] {
  return rows.filter((r) => r.interval_date >= range.startISO && r.interval_date <= range.endISO);
}

// --- Time-range presets -----------------------------------------------------

export type Preset =
  | "ytd" | "mtd" | "last30" | "last12m" | "prev_year" | "custom";

export const PRESET_LABEL: Record<Preset, string> = {
  ytd: "Year to date",
  mtd: "Month to date",
  last30: "Last 30 days",
  last12m: "Last 12 months",
  prev_year: "Previous calendar year",
  custom: "Custom range",
};

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function utcDate(y: number, m: number, d: number) { return new Date(Date.UTC(y, m - 1, d)); }

/** Given an anchor "today" (UTC), build the range for a preset */
export function presetRange(preset: Preset, today: Date, custom?: { start: string; end: string }): DateRange {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  if (preset === "ytd") {
    const start = utcDate(y, 1, 1);
    return { start, end: today, startISO: iso(start), endISO: iso(today) };
  }
  if (preset === "mtd") {
    const start = utcDate(y, m, 1);
    return { start, end: today, startISO: iso(start), endISO: iso(today) };
  }
  if (preset === "last30") {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 29);
    return { start, end: today, startISO: iso(start), endISO: iso(today) };
  }
  if (preset === "last12m") {
    const start = new Date(today);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    start.setUTCDate(start.getUTCDate() + 1);
    return { start, end: today, startISO: iso(start), endISO: iso(today) };
  }
  if (preset === "prev_year") {
    const start = utcDate(y - 1, 1, 1);
    const end = utcDate(y - 1, 12, 31);
    return { start, end, startISO: iso(start), endISO: iso(end) };
  }
  // custom
  if (custom && /^\d{4}-\d{2}-\d{2}$/.test(custom.start) && /^\d{4}-\d{2}-\d{2}$/.test(custom.end)) {
    const [sy, sm, sd] = custom.start.split("-").map(Number);
    const [ey, em, ed] = custom.end.split("-").map(Number);
    const start = utcDate(sy, sm, sd);
    const end = utcDate(ey, em, ed);
    return { start, end, startISO: custom.start, endISO: custom.end };
  }
  // fallback = YTD
  return presetRange("ytd", today);
}

/** Shift a range back exactly 1 year for YoY comparison (calendar align) */
export function prevYearRange(r: DateRange): DateRange {
  const s = new Date(r.start); s.setUTCFullYear(s.getUTCFullYear() - 1);
  const e = new Date(r.end);   e.setUTCFullYear(e.getUTCFullYear() - 1);
  return { start: s, end: e, startISO: iso(s), endISO: iso(e) };
}

// --- Aggregation -----------------------------------------------------------

export interface SiteAggregate {
  buildingId: string | null;
  buildingName: string;
  totalKwh: number;
  peakKw: number;
  loadFactor: number; // 0..1
  outOfHoursPct: number; // 0..100
  meterCount: number;
  presentSlots: number;
  expectedSlots: number;
  coveragePct: number; // 0..100
  monthlyTotals: number[]; // 12 slots, indexed by month (0..11) for the range year
}

export interface YoYDelta { deltaPct: number; deltaKwh: number; prevKwh: number }

function extendMonthly(a: number[], b: number[]): number[] {
  const out = a.slice();
  for (let i = 0; i < 12; i++) out[i] = (out[i] || 0) + (b[i] || 0);
  return out;
}

/** Aggregate rows filtered to a single utility + org into per-building totals */
export function aggregateBySite(
  rows: ConsumptionRow[],
  buildings: Building[],
  range: DateRange,
  profileFor: (buildingId: string | null) => ResolvedProfile,
): SiteAggregate[] {
  const inRange = rowsInRange(rows, range);
  const byBldg = new Map<string | null, ConsumptionRow[]>();
  for (const r of inRange) {
    const bid = r.building_id;
    const arr = byBldg.get(bid) ?? [];
    arr.push(r);
    byBldg.set(bid, arr);
  }

  const bldgName = new Map<string, string>(buildings.map((b) => [b.id, b.custom_display_name]));
  const days = daysInRange(range);
  const expectedSlotsPerMeter = days * 48;

  const out: SiteAggregate[] = [];
  for (const [bid, list] of byBldg) {
    const meters = new Set<string>();
    let total = 0;
    let peakKw = 0;
    let activeKwh = 0;
    let inactiveKwh = 0;
    let present = 0;
    const monthly: number[] = new Array(12).fill(0);
    const profile = profileFor(bid);

    for (const r of list) {
      meters.add(r.meter_name);
      const f = r.meter_factor || 1;
      const [y, m, d] = r.interval_date.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const mi = m - 1;
      for (let i = 0; i < 48; i++) {
        const v = r.half_hourly_values[i];
        if (v == null) continue;
        const kwh = v * f;
        total += kwh;
        monthly[mi] += kwh;
        present++;
        // Peak kW = max HH kWh * 2 (since HH = 30-min slot)
        const kw = kwh * 2;
        if (kw > peakKw) peakKw = kw;
        if (isActiveSlot(profile, date, i)) activeKwh += kwh;
        else inactiveKwh += kwh;
      }
    }
    const meterCount = meters.size;
    const expected = expectedSlotsPerMeter * Math.max(1, meterCount);
    const durationHours = days * 24;
    const avgKw = durationHours > 0 ? total / durationHours : 0;
    const loadFactor = peakKw > 0 ? avgKw / peakKw : 0;
    const oohPct = total > 0 ? (inactiveKwh / total) * 100 : 0;
    void activeKwh;

    out.push({
      buildingId: bid,
      buildingName: bid ? bldgName.get(bid) ?? "Unassigned" : "Unassigned",
      totalKwh: total,
      peakKw,
      loadFactor,
      outOfHoursPct: oohPct,
      meterCount,
      presentSlots: present,
      expectedSlots: expected,
      coveragePct: expected > 0 ? Math.min(100, (present / expected) * 100) : 0,
      monthlyTotals: monthly,
    });
  }
  // Sort descending by total kWh by default
  out.sort((a, b) => b.totalKwh - a.totalKwh);
  return out;
}

export function mergeAggregates(a: SiteAggregate, b: SiteAggregate): SiteAggregate {
  const total = a.totalKwh + b.totalKwh;
  const peakKw = Math.max(a.peakKw, b.peakKw);
  const meterCount = a.meterCount + b.meterCount;
  const activeShareA = 100 - a.outOfHoursPct;
  const activeShareB = 100 - b.outOfHoursPct;
  const activeKwh = (a.totalKwh * activeShareA + b.totalKwh * activeShareB) / 100;
  const inactive = total - activeKwh;
  const durationHours = a.expectedSlots > 0 ? (a.expectedSlots / Math.max(1, a.meterCount)) / 2 : 0;
  const avgKw = durationHours > 0 ? total / durationHours : 0;
  return {
    buildingId: a.buildingId,
    buildingName: a.buildingName,
    totalKwh: total,
    peakKw,
    loadFactor: peakKw > 0 ? avgKw / peakKw : 0,
    outOfHoursPct: total > 0 ? (inactive / total) * 100 : 0,
    meterCount,
    presentSlots: a.presentSlots + b.presentSlots,
    expectedSlots: a.expectedSlots + b.expectedSlots,
    coveragePct: 0,
    monthlyTotals: extendMonthly(a.monthlyTotals, b.monthlyTotals),
  };
}

export function computeYoY(current: number, prev: number): YoYDelta {
  if (prev <= 0) return { deltaPct: 0, deltaKwh: current - prev, prevKwh: prev };
  return { deltaPct: ((current - prev) / prev) * 100, deltaKwh: current - prev, prevKwh: prev };
}

// --- Cost & CO2 ------------------------------------------------------------

export function orgTariff(org: Organisation | undefined, utility: Utility): number {
  if (!org) return DEFAULT_TARIFF[utility];
  if (utility === "electricity") return org.tariff_electricity_pence_per_kwh ?? DEFAULT_TARIFF.electricity;
  if (utility === "gas") return org.tariff_gas_pence_per_kwh ?? DEFAULT_TARIFF.gas;
  if (utility === "water") return org.tariff_water_pence_per_m3 ?? DEFAULT_TARIFF.water;
  return 0;
}

export function orgCo2Factor(org: Organisation | undefined, utility: Utility): number {
  if (!org) return DEFAULT_CO2[utility];
  if (utility === "electricity") return org.co2_factor_electricity_kg_per_kwh ?? DEFAULT_CO2.electricity;
  if (utility === "gas") return org.co2_factor_gas_kg_per_kwh ?? DEFAULT_CO2.gas;
  if (utility === "water") return org.co2_factor_water_kg_per_m3 ?? DEFAULT_CO2.water;
  return 0;
}

export function estimateCostGbp(kwhOrM3: number, tariffPence: number): number {
  return (kwhOrM3 * tariffPence) / 100;
}

export function estimateCo2Kg(kwhOrM3: number, factor: number): number {
  return kwhOrM3 * factor;
}

function daysInRange(r: DateRange): number {
  return Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000) + 1;
}

/** Unit label for a utility (for KPI cards) */
export function unitLabel(utility: Utility): string {
  return utility === "water" ? "m³" : "kWh";
}