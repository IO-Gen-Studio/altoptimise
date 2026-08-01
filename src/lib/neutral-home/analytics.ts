import type { CircuitCategory } from "./parse";
import { isNonEssential } from "./parse";

export interface CircuitRecord {
  id: string;
  period_id: string;
  circuit_name: string;
  category: CircuitCategory;
  is_aggregate: boolean;
  usage_kwh: number | null;
  co2_kg: number | null;
  blended_p_kwh: number | null;
  day_p_kwh: number | null;
  night_p_kwh: number | null;
  total_cost_p: number | null;
  day_kwh: number | null;
  day_pct: number | null;
  night_kwh: number | null;
  night_pct: number | null;
  daynight_total_kwh: number | null;
  usage_kwh_per_person: number | null;
  usage_kwh_per_m2: number | null;
  cost_p_per_person: number | null;
  cost_p_per_m2: number | null;
  co2_kg_per_person: number | null;
  co2_kg_per_m2: number | null;
}

export interface PeriodKpis {
  totalKwh: number;
  dayKwh: number;
  nightKwh: number;
  dayPct: number;
  nightPct: number;
  totalCostGbp: number;
  co2Kg: number;
  blendedPPerKwh: number;
  dayRate: number | null;
  nightRate: number | null;
  circuitCount: number;
}

const sum = (rows: CircuitRecord[], pick: (r: CircuitRecord) => number | null) =>
  rows.reduce((a, r) => a + (pick(r) ?? 0), 0);

export function detailCircuits(rows: CircuitRecord[]): CircuitRecord[] {
  return rows.filter((r) => !r.is_aggregate);
}

function weightedRate(rows: CircuitRecord[], pick: (r: CircuitRecord) => number | null): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const rate = pick(r);
    const kwh = r.usage_kwh ?? 0;
    if (rate != null && kwh > 0) {
      num += rate * kwh;
      den += kwh;
    }
  }
  return den > 0 ? num / den : null;
}

export function computeKpis(all: CircuitRecord[]): PeriodKpis {
  const rows = detailCircuits(all);
  const totalKwh = sum(rows, (r) => r.usage_kwh);
  const dayKwh = sum(rows, (r) => r.day_kwh);
  const nightKwh = sum(rows, (r) => r.night_kwh);
  const dnTotal = dayKwh + nightKwh;
  const costP = sum(rows, (r) => r.total_cost_p);
  return {
    totalKwh,
    dayKwh,
    nightKwh,
    dayPct: dnTotal > 0 ? (dayKwh / dnTotal) * 100 : 0,
    nightPct: dnTotal > 0 ? (nightKwh / dnTotal) * 100 : 0,
    totalCostGbp: costP / 100,
    co2Kg: sum(rows, (r) => r.co2_kg),
    blendedPPerKwh: totalKwh > 0 ? costP / totalKwh : 0,
    dayRate: weightedRate(rows, (r) => r.day_p_kwh),
    nightRate: weightedRate(rows, (r) => r.night_p_kwh),
    circuitCount: rows.length,
  };
}

export interface VarianceRow {
  metric: string;
  current: number;
  previous: number;
  delta: number;
  pct: number | null;
  unit: string;
  /** true when a decrease is the good outcome */
  lowerIsBetter: boolean;
}

export function compareKpis(curr: PeriodKpis, prev: PeriodKpis): VarianceRow[] {
  const mk = (
    metric: string,
    c: number,
    p: number,
    unit: string,
    lowerIsBetter = true,
  ): VarianceRow => ({
    metric,
    current: c,
    previous: p,
    delta: c - p,
    pct: p !== 0 ? ((c - p) / Math.abs(p)) * 100 : null,
    unit,
    lowerIsBetter,
  });
  return [
    mk("Total consumption", curr.totalKwh, prev.totalKwh, "kWh"),
    mk("Day consumption", curr.dayKwh, prev.dayKwh, "kWh"),
    mk("Night consumption", curr.nightKwh, prev.nightKwh, "kWh"),
    mk("Night share", curr.nightPct, prev.nightPct, "%"),
    mk("Total cost", curr.totalCostGbp, prev.totalCostGbp, "£"),
    mk("Blended cost", curr.blendedPPerKwh, prev.blendedPPerKwh, "p/kWh"),
    mk("Carbon", curr.co2Kg, prev.co2Kg, "kg"),
  ];
}

export const NIGHT_FLAG_THRESHOLD = 20;

export interface NightFlag {
  circuit: CircuitRecord;
  nightShare: number;
  nonEssential: boolean;
}

export function nightFlags(all: CircuitRecord[]): NightFlag[] {
  return detailCircuits(all)
    .map((c) => {
      const total = (c.day_kwh ?? 0) + (c.night_kwh ?? 0);
      const share = total > 0 ? ((c.night_kwh ?? 0) / total) * 100 : 0;
      return { circuit: c, nightShare: share, nonEssential: isNonEssential(c.category) };
    })
    .filter((f) => f.nightShare > NIGHT_FLAG_THRESHOLD && (f.circuit.usage_kwh ?? 0) > 0)
    .sort((a, b) => b.nightShare - a.nightShare);
}

export interface ShiftResult {
  shiftedKwh: number;
  savingGbp: number;
  newBlended: number | null;
}

export function simulateShift(
  kpis: PeriodKpis,
  pct: number,
  dayRate: number | null,
  nightRate: number | null,
): ShiftResult {
  const shiftedKwh = kpis.dayKwh * (pct / 100);
  if (dayRate == null || nightRate == null) {
    return { shiftedKwh, savingGbp: 0, newBlended: null };
  }
  const savingP = shiftedKwh * (dayRate - nightRate);
  const newCostP = kpis.totalCostGbp * 100 - savingP;
  return {
    shiftedKwh,
    savingGbp: savingP / 100,
    newBlended: kpis.totalKwh > 0 ? newCostP / kpis.totalKwh : null,
  };
}

export function mergedCsv(rows: CircuitRecord[]): string {
  const header = [
    "Circuit",
    "Category",
    "Aggregate",
    "Usage kWh",
    "CO2 kg",
    "Blended p/kWh",
    "Day p/kWh",
    "Night p/kWh",
    "Total cost p",
    "Day kWh",
    "Day %",
    "Night kWh",
    "Night %",
    "Day+Night total kWh",
    "kWh/person",
    "kWh/m2",
    "p/person",
    "p/m2",
    "kg/person",
    "kg/m2",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.circuit_name,
      r.category,
      r.is_aggregate ? "yes" : "no",
      r.usage_kwh,
      r.co2_kg,
      r.blended_p_kwh,
      r.day_p_kwh,
      r.night_p_kwh,
      r.total_cost_p,
      r.day_kwh,
      r.day_pct,
      r.night_kwh,
      r.night_pct,
      r.daynight_total_kwh,
      r.usage_kwh_per_person,
      r.usage_kwh_per_m2,
      r.cost_p_per_person,
      r.cost_p_per_m2,
      r.co2_kg_per_person,
      r.co2_kg_per_m2,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}