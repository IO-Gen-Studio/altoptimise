import type { NhCategoryRow, NhMetric, NhPeriod } from "@/lib/neutral-home.functions";
import { CATEGORY_LABEL, type CircuitCategory } from "./parse";
import { computeKpis, detailCircuits, type CircuitRecord, type PeriodKpis } from "./analytics";

export interface CategoryOption {
  code: string;
  label: string;
  builtin: boolean;
  /** the stored row, when this category has been customised or user-added */
  row?: NhCategoryRow;
}

/** Built-in categories merged with the per-site rows (renames, additions, hides). */
export function categoryOptions(siteRows: NhCategoryRow[]): CategoryOption[] {
  const byCode = new Map(siteRows.map((r) => [r.code, r]));
  const out: CategoryOption[] = [];
  for (const code of Object.keys(CATEGORY_LABEL) as CircuitCategory[]) {
    const row = byCode.get(code);
    if (row?.hidden) continue;
    out.push({ code, label: row?.label ?? CATEGORY_LABEL[code], builtin: true, row });
  }
  for (const row of siteRows) {
    if (row.code in CATEGORY_LABEL || row.hidden) continue;
    out.push({ code: row.code, label: row.label, builtin: false, row });
  }
  return out;
}

export function categoryLabelMap(siteRows: NhCategoryRow[]): Record<string, string> {
  const map: Record<string, string> = { ...CATEGORY_LABEL };
  for (const r of siteRows) map[r.code] = r.label;
  return map;
}

/** Applies per-site meter category overrides to a circuit list. */
export function applyCategoryOverrides(
  circuits: CircuitRecord[],
  overrides: Map<string, string>,
): CircuitRecord[] {
  if (!overrides.size) return circuits;
  return circuits.map((c) => {
    const next = overrides.get(c.circuit_name);
    return next && next !== c.category
      ? ({ ...c, category: next as CircuitCategory } as CircuitRecord)
      : c;
  });
}

/* ---------------- metrics ---------------- */

export type MetricSource =
  | "usage_kwh"
  | "co2_kg"
  | "total_cost_p"
  | "day_kwh"
  | "night_kwh"
  | "night_share";

export const METRIC_SOURCE_LABEL: Record<MetricSource, string> = {
  usage_kwh: "Consumption (kWh)",
  co2_kg: "Carbon (kg)",
  total_cost_p: "Cost (£)",
  day_kwh: "Day consumption (kWh)",
  night_kwh: "Night consumption (kWh)",
  night_share: "Night share (%)",
};

export const METRIC_SOURCE_UNIT: Record<MetricSource, string> = {
  usage_kwh: "kWh",
  co2_kg: "kg",
  total_cost_p: "£",
  day_kwh: "kWh",
  night_kwh: "kWh",
  night_share: "%",
};

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  system: boolean;
  evaluate: (circuits: CircuitRecord[]) => number;
  /**
   * Rows this metric is built from. Lets the dashboard read the uploaded
   * cost / carbon columns for the exact same circuits instead of deriving them.
   */
  select?: (circuits: CircuitRecord[]) => CircuitRecord[];
  /** Which uploaded column the metric reads. */
  column?: MetricSource;
  /** Fixed-slot metrics evaluate a different column with their own formula. */
  evaluateWith?: (circuits: CircuitRecord[], column: MetricSource) => number;
  /** Set for the five fixed metrics present on every site. */
  slot?: FixedSlot;
}

const kpiOf = (rows: CircuitRecord[]): PeriodKpis => computeKpis(rows);

export const SYSTEM_METRICS: MetricDef[] = [
  {
    key: "sys:totalKwh",
    label: "Total consumption",
    unit: "kWh",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).totalKwh,
    select: detailCircuits,
    column: "usage_kwh",
  },
  {
    key: "sys:dayKwh",
    label: "Day consumption",
    unit: "kWh",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).dayKwh,
    select: detailCircuits,
    column: "day_kwh",
  },
  {
    key: "sys:nightKwh",
    label: "Night consumption",
    unit: "kWh",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).nightKwh,
    select: detailCircuits,
    column: "night_kwh",
  },
  {
    key: "sys:nightPct",
    label: "Night share",
    unit: "%",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).nightPct,
  },
  {
    key: "sys:costGbp",
    label: "Total cost",
    unit: "£",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).totalCostGbp,
  },
  {
    key: "sys:blended",
    label: "Blended cost",
    unit: "p/kWh",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).blendedPPerKwh,
  },
  {
    key: "sys:co2",
    label: "Carbon",
    unit: "kg",
    lowerIsBetter: true,
    system: true,
    evaluate: (r) => kpiOf(r).co2Kg,
  },
];

export const sumOf = (rows: CircuitRecord[], source: MetricSource): number => {
  if (source === "night_share") {
    const d = rows.reduce((a, r) => a + (r.day_kwh ?? 0), 0);
    const n = rows.reduce((a, r) => a + (r.night_kwh ?? 0), 0);
    return d + n > 0 ? (n / (d + n)) * 100 : 0;
  }
  const total = rows.reduce((a, r) => a + ((r[source] as number | null) ?? 0), 0);
  return source === "total_cost_p" ? total / 100 : total;
};

export function userMetricDef(m: NhMetric): MetricDef {
  const names = new Set(m.circuit_names);
  const select = (rows: CircuitRecord[]) =>
    names.size ? rows.filter((r) => names.has(r.circuit_name)) : detailCircuits(rows);
  return {
    key: `user:${m.id}`,
    label: m.name,
    unit: m.unit || METRIC_SOURCE_UNIT[m.source as MetricSource] || "",
    lowerIsBetter: m.lower_is_better,
    system: false,
    select,
    column: m.source as MetricSource,
    evaluate: (rows) => sumOf(select(rows), m.source as MetricSource),
  };
}

/* ---------------- fixed metrics (every site) ---------------- */

export type FixedSlot = "consumption" | "solar" | "export" | "import" | "net";

export interface FixedMetricSlot {
  slot: FixedSlot;
  /** Stored metric name — also the lookup key for the site's circuit mapping. */
  name: string;
  unit: string;
  source: MetricSource;
  lowerIsBetter: boolean;
  /** Derived slots have no circuit mapping of their own. */
  derived?: boolean;
  description: string;
}

export const FIXED_METRICS: FixedMetricSlot[] = [
  {
    slot: "consumption",
    name: "Consumption",
    unit: "kWh",
    source: "usage_kwh",
    lowerIsBetter: true,
    description: "Sum of the circuits mapped as site consumption.",
  },
  {
    slot: "solar",
    name: "Solar Generation",
    unit: "kWh",
    source: "usage_kwh",
    lowerIsBetter: false,
    description: "Sum of the circuits mapped as PV / solar generation.",
  },
  {
    slot: "export",
    name: "Export Energy",
    unit: "kWh",
    source: "usage_kwh",
    lowerIsBetter: false,
    description: "Sum of the circuits mapped as export.",
  },
  {
    slot: "import",
    name: "Import Energy",
    unit: "kWh",
    source: "usage_kwh",
    lowerIsBetter: true,
    description: "Sum of the circuits mapped as import.",
  },
  {
    slot: "net",
    name: "Net Energy",
    unit: "kWh",
    source: "usage_kwh",
    lowerIsBetter: false,
    derived: true,
    description: "Export Energy minus Import Energy — derived from the two mappings above.",
  },
];

const FIXED_BY_NAME = new Map(FIXED_METRICS.map((f) => [f.name.toLowerCase(), f]));

export const fixedSlotOfName = (name: string): FixedMetricSlot | undefined =>
  FIXED_BY_NAME.get(name.trim().toLowerCase());

/** The stored row that carries a fixed slot's circuit mapping for this site. */
export const fixedMetricRow = (
  siteMetrics: NhMetric[],
  slot: FixedSlot,
): NhMetric | undefined => {
  const def = FIXED_METRICS.find((f) => f.slot === slot);
  if (!def) return undefined;
  return siteMetrics.find((m) => m.name.trim().toLowerCase() === def.name.toLowerCase());
};

const pick = (names: string[]) => {
  const set = new Set(names);
  return (rows: CircuitRecord[]) => (set.size ? rows.filter((r) => set.has(r.circuit_name)) : []);
};

export function fixedMetricDefs(siteMetrics: NhMetric[]): MetricDef[] {
  return FIXED_METRICS.map((f) => {
    if (f.slot === "net") {
      const exp = pick(fixedMetricRow(siteMetrics, "export")?.circuit_names ?? []);
      const imp = pick(fixedMetricRow(siteMetrics, "import")?.circuit_names ?? []);
      const evaluateWith = (rows: CircuitRecord[], column: MetricSource) =>
        sumOf(exp(rows), column) - sumOf(imp(rows), column);
      return {
        key: `fixed:${f.slot}`,
        label: f.name,
        unit: f.unit,
        lowerIsBetter: f.lowerIsBetter,
        system: true,
        slot: f.slot,
        column: f.source,
        select: (rows: CircuitRecord[]) => [...exp(rows), ...imp(rows)],
        evaluate: (rows: CircuitRecord[]) => evaluateWith(rows, f.source),
        evaluateWith,
      } satisfies MetricDef;
    }
    const row = fixedMetricRow(siteMetrics, f.slot);
    const source = (row?.source as MetricSource) ?? f.source;
    const select = pick(row?.circuit_names ?? []);
    return {
      key: `fixed:${f.slot}`,
      label: f.name,
      unit: row?.unit || f.unit,
      lowerIsBetter: row?.lower_is_better ?? f.lowerIsBetter,
      system: true,
      slot: f.slot,
      column: source,
      select,
      evaluate: (rows: CircuitRecord[]) => sumOf(select(rows), source),
    } satisfies MetricDef;
  });
}

/** Rows the user created themselves (fixed-slot rows are managed separately). */
export const userMetricRows = (siteMetrics: NhMetric[]): NhMetric[] =>
  siteMetrics.filter((m) => !fixedSlotOfName(m.name));

export function allMetricDefs(siteMetrics: NhMetric[]): MetricDef[] {
  return [
    ...fixedMetricDefs(siteMetrics),
    ...SYSTEM_METRICS,
    ...userMetricRows(siteMetrics).map(userMetricDef),
  ];
}

/** Migrates saved selections that pointed at the old user-metric rows. */
export function normalizeMetricKeys(keys: string[], siteMetrics: NhMetric[]): string[] {
  const byId = new Map(
    siteMetrics
      .map((m) => [m.id, fixedSlotOfName(m.name)?.slot] as const)
      .filter(([, slot]) => !!slot) as [string, FixedSlot][],
  );
  const out: string[] = [];
  for (const k of keys) {
    const slot = k.startsWith("user:") ? byId.get(k.slice(5)) : undefined;
    const next = slot ? `fixed:${slot}` : k;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

export interface ComparisonCell {
  value: number;
  delta: number;
  pct: number | null;
  good: boolean;
}

export interface ComparisonRow {
  key: string;
  label: string;
  unit: string;
  current: number;
  lastYear: ComparisonCell | null;
  baseline: ComparisonCell | null;
}

function cell(
  def: MetricDef,
  current: number,
  rows: CircuitRecord[] | null,
): ComparisonCell | null {
  if (!rows || !rows.length) return null;
  const value = def.evaluate(rows);
  const delta = current - value;
  return {
    value,
    delta,
    pct: value !== 0 ? (delta / Math.abs(value)) * 100 : null,
    good: def.lowerIsBetter ? delta <= 0 : delta >= 0,
  };
}

export function buildComparison(
  defs: MetricDef[],
  current: CircuitRecord[],
  lastYear: CircuitRecord[] | null,
  baseline: CircuitRecord[] | null,
): ComparisonRow[] {
  return defs.map((def) => {
    const value = def.evaluate(current);
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      current: value,
      lastYear: cell(def, value, lastYear),
      baseline: cell(def, value, baseline),
    };
  });
}

/* ---------------- period helpers ---------------- */

/** Same calendar month/period one year earlier, when it exists. */
export function findLastYearPeriod(
  period: NhPeriod | undefined,
  periods: NhPeriod[],
): NhPeriod | undefined {
  if (!period) return undefined;
  const start = new Date(`${period.period_start}T00:00:00Z`);
  const targetYear = start.getUTCFullYear() - 1;
  const targetMonth = start.getUTCMonth();
  return periods.find((p) => {
    if (p.id === period.id) return false;
    const s = new Date(`${p.period_start}T00:00:00Z`);
    return s.getUTCFullYear() === targetYear && s.getUTCMonth() === targetMonth;
  });
}
