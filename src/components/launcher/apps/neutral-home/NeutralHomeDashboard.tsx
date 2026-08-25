import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Gauge,
  Leaf,
  Moon,
  PoundSterling,
  Sun,
  SunMedium,
  Triangle,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { syncNhWeather } from "@/lib/neutral-home.functions";
import {
  DEFAULT_HDD_BASE,
  kwhPerHdd,
  periodHdd,
  type WeatherDay,
} from "@/lib/neutral-home/weather";

import type { NeutralHomeBundle } from "@/lib/neutral-home.functions";
import {
  compareKpis,
  computeKpis,
  detailCircuits,
  mergedCsv,
  nightFlags,
  NIGHT_FLAG_THRESHOLD,
  type CircuitRecord,
} from "@/lib/neutral-home/analytics";
import { NeutralHomeTemperature } from "./NeutralHomeTemperature";
import { NeutralHomeZones } from "./NeutralHomeZones";
import { classMap, kindOf, zoneOf } from "@/lib/neutral-home/zones";
import { DEFAULT_BAND } from "@/lib/neutral-home/temp-analytics";
import {
  allMetricDefs,
  applyCategoryOverrides,
  buildComparison,
  categoryLabelMap,
  disciplineDefs,
  findLastYearPeriod,
  fixedMetricDefs,
  normalizeMetricKeys,
  splitSelection,
  sumOf,
  type ComparisonCell,
  type ComparisonRow,
  type FixedSlot,
  type MetricDef,

} from "@/lib/neutral-home/config";



type SortKey = "name" | "category" | "usage_kwh" | "co2_kg" | "cost_gbp" | "day_kwh" | "night_kwh";

type SortDir = "asc" | "desc";

interface LeagueRow {
  key: string;
  name: string;
  category: string;
  categoryLabel: string;
  usage_kwh: number;
  co2_kg: number;
  cost_gbp: number;
  day_kwh: number;
  night_kwh: number;
  isAggregate: boolean;
  meters?: number;
  members?: { name: string; usage_kwh: number; cost_gbp: number; co2_kg: number }[];
}

type Basis = "kwh" | "cost" | "carbon";

/**
 * Keep the site's configured metrics exactly as-is and read the uploaded cost
 * (£) or carbon (kg) column for the very same circuits — nothing is derived.
 * Metrics that aren't kWh-based (or have no circuit selection) pass through.
 */
function convertDefs(defs: MetricDef[], basis: Basis): MetricDef[] {
  if (basis === "kwh") return defs;
  const column = basis === "cost" ? ("total_cost_p" as const) : ("co2_kg" as const);
  const unit = basis === "cost" ? "£" : "kg";
  return defs.map((d) => {
    if (d.unit !== "kWh") return d;
    if (d.evaluateWith) {
      const withCol = d.evaluateWith;
      return { ...d, unit, evaluate: (rows: CircuitRecord[]) => withCol(rows, column) };
    }
    if (!d.select) return d;
    const select = d.select;
    return {
      ...d,
      unit,
      evaluate: (rows: CircuitRecord[]) => sumOf(select(rows), column),
    };
  });
}

const SITE_STORAGE_KEY = "neutral-home:last-site";

const num = (v: number, dp = 0) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Change cell: up/down triangle instead of +/-, coloured by good/bad outcome. */
function ChangeCell({
  cell,
  unit,
}: {
  cell: { delta: number; pct: number | null; good: boolean } | null;
  unit: string;
}) {
  if (!cell) return <td className="py-2 text-right text-muted-foreground">—</td>;
  const up = cell.delta >= 0;
  return (
    <td
      className={cn("py-2 text-right font-medium", cell.good ? "text-emerald-600" : "text-red-600")}
    >
      <span className="inline-flex items-center justify-end gap-1">
        <Triangle
          className={cn("h-3 w-3", up ? "" : "rotate-180")}
          fill="currentColor"
          strokeWidth={0}
          aria-hidden
        />
        {num(Math.abs(cell.delta), 2)} {unit}
        {cell.pct == null ? "" : ` (${num(Math.abs(cell.pct), 1)}%)`}
      </span>
    </td>
  );
}

/** Grouping heading inside the performance metrics table. */
function SectionRow({ title, span }: { title: string; span: number }) {
  return (
    <tr className="border-t bg-muted/40">
      <td
        colSpan={span}
        className="py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </td>
    </tr>
  );
}

function MetricRow({
  row,
  showLastYear,
  showBaseline,
}: {
  row: ComparisonRow;
  showLastYear: boolean;
  showBaseline: boolean;
}) {
  return (
    <tr className="border-t">
      <td className="py-2">{row.label}</td>
      <td className="py-2 text-right">
        {num(row.current, 2)} {row.unit}
      </td>
      {showLastYear ? (
        <>
          <td className="py-2 text-right text-muted-foreground">
            {row.lastYear ? `${num(row.lastYear.value, 2)} ${row.unit}` : "—"}
          </td>
          <ChangeCell cell={row.lastYear} unit={row.unit} />
        </>
      ) : null}
      {showBaseline ? (
        <>
          <td className="py-2 text-right text-muted-foreground">
            {row.baseline ? `${num(row.baseline.value, 2)} ${row.unit}` : "—"}
          </td>
          <ChangeCell cell={row.baseline} unit={row.unit} />
        </>
      ) : null}
    </tr>
  );
}


/* ---------------- headline KPI cards ---------------- */

/** [label when the metric went down, label when it went up] */
const SAVING_WORDS: [string, string] = ["Saving", "Overspend"];
const GENERATION_WORDS: [string, string] = ["Generated Less", "Generated More"];
const NET_WORDS: [string, string] = ["Reduction", "Increase"];
const HDD_WORDS: [string, string] = ["More efficient", "Less efficient"];

interface CmpLine {
  title: string;
  up: boolean;
  good: boolean;
  text: string;
  verdict: string;
}

function cmpLine(
  title: string,
  cell: ComparisonCell | null,
  fmt: (n: number) => string,
  words: [string, string],
): CmpLine | null {
  if (!cell) return null;
  const up = cell.delta >= 0;
  return {
    title,
    up,
    good: cell.good,
    text: `${fmt(Math.abs(cell.delta))}${cell.pct == null ? "" : ` (${num(Math.abs(cell.pct), 1)}%)`}`,
    verdict: words[up ? 1 : 0]!,
  };
}

/** Headline card: value plus one comparison line per available reference period. */
function KpiCompare({
  label,
  icon: Icon,
  value,
  sub,
  lines,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  sub?: string;
  lines: (CmpLine | null)[];
}) {
  const shown = lines.filter((l): l is CmpLine => l != null);
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
        <div className="mt-3 flex flex-col gap-1">
          {shown.length ? (
            shown.map((l) => (
              <div key={l.title} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{l.title}</span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 font-medium",
                    l.good ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  <Triangle
                    className={cn("h-3 w-3", l.up ? "" : "rotate-180")}
                    fill="currentColor"
                    strokeWidth={0}
                    aria-hidden
                  />
                  {l.text}
                  <span className="font-normal">{l.verdict}</span>
                </span>
              </div>

            ))
          ) : (
            <div className="text-xs text-muted-foreground">No comparison period data</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


export function NeutralHomeDashboard({
  bundle,
  onExporter,
}: {
  bundle: NeutralHomeBundle;
  onExporter?: (fn: (() => void) | null) => void;
}) {
  const [siteId, setSiteId] = useState<string>("");

  // Remember the last viewed site across refreshes and navigation.
  useEffect(() => {
    if (!bundle.sites.length) return;
    const stored =
      typeof window === "undefined" ? null : window.localStorage.getItem(SITE_STORAGE_KEY);
    setSiteId((curr) => {
      if (curr && bundle.sites.some((s) => s.id === curr)) return curr;
      if (stored && bundle.sites.some((s) => s.id === stored)) return stored;
      return bundle.sites[0]!.id;
    });
  }, [bundle.sites]);

  const pickSite = (v: string) => {
    setSiteId(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SITE_STORAGE_KEY, v);
    setPeriodId("");
    setComparePeriodId("");
    setBaselinePeriodId("");
  };

  const sitePeriods = useMemo(
    () => bundle.periods.filter((p) => p.site_id === siteId),
    [bundle.periods, siteId],
  );
  const [periodId, setPeriodId] = useState<string>("");
  const [comparePeriodId, setComparePeriodId] = useState<string>("");
  const [baselinePeriodId, setBaselinePeriodId] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("usage_kwh");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAggregates, setShowAggregates] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [groupByZone, setGroupByZone] = useState(false);
  const [basis, setBasis] = useState<Basis>("kwh");

  const period = sitePeriods.find((p) => p.id === periodId) ?? sitePeriods[0];

  const site = bundle.sites.find((s) => s.id === siteId);
  const hddBase = site?.hdd_base_c ?? DEFAULT_HDD_BASE;
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);
  const [weatherNote, setWeatherNote] = useState<string | null>(null);

  // Cache + load outside air temperature / degree days for the active period.
  useEffect(() => {
    if (!site || !period) {
      setWeatherDays([]);
      return;
    }
    let cancelled = false;
    setWeatherNote(null);
    syncNhWeather({
      data: {
        organization_id: site.organization_id,
        site_id: site.id,
        from: period.period_start,
        to: period.period_end,
      },
    })
      .then((r) => {
        if (cancelled) return;
        setWeatherDays(r.days);
        setWeatherNote(r.error ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setWeatherDays([]);
          setWeatherNote("Weather data unavailable right now.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [site?.id, site?.organization_id, site?.hdd_base_c, period?.id, period?.period_start, period?.period_end]);

  const autoLastYear = useMemo(
    () => findLastYearPeriod(period, sitePeriods),
    [period, sitePeriods],
  );

  // Auto-select the same month last year whenever the current period changes.
  useEffect(() => {
    setComparePeriodId("");
  }, [period?.id]);

  const comparePeriod =
    sitePeriods.find((p) => p.id === comparePeriodId) ??
    autoLastYear ??
    sitePeriods.filter((p) => p.id !== period?.id)[0];

  const baselinePeriod = sitePeriods.find((p) => p.id === baselinePeriodId);

  const siteCategories = useMemo(
    () => bundle.categories.filter((c) => c.site_id === siteId),
    [bundle.categories, siteId],
  );
  const labels = useMemo(() => categoryLabelMap(siteCategories), [siteCategories]);
  const classes = useMemo(
    () => classMap(bundle.meterCategories, siteId),
    [bundle.meterCategories, siteId],
  );
  const overrides = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of bundle.meterCategories)
      if (o.site_id === siteId && o.category) m.set(o.circuit_name, o.category);
    return m;
  }, [bundle.meterCategories, siteId]);

  const circuitsFor = (id: string | undefined) =>
    id
      ? applyCategoryOverrides(
          bundle.circuits.filter((c) => c.period_id === id),
          overrides,
        )
      : [];

  const circuits = useMemo(() => circuitsFor(period?.id), [bundle.circuits, period, overrides]);
  const compareCircuits = useMemo(
    () => circuitsFor(comparePeriod?.id),
    [bundle.circuits, comparePeriod, overrides],
  );
  const baselineCircuits = useMemo(
    () => circuitsFor(baselinePeriod?.id),
    [bundle.circuits, baselinePeriod, overrides],
  );

  const kpis = useMemo(() => computeKpis(circuits), [circuits]);
  const compareKpi = useMemo(() => computeKpis(compareCircuits), [compareCircuits]);
  const variance = useMemo(() => compareKpis(kpis, compareKpi), [kpis, compareKpi]);
  const flags = useMemo(() => nightFlags(circuits), [circuits]);

  const siteMetrics = useMemo(
    () => bundle.metrics.filter((m) => m.site_id === siteId),
    [bundle.metrics, siteId],
  );
  const metricDefs = useMemo(() => allMetricDefs(siteMetrics), [siteMetrics]);
  const settings = useMemo(
    () => bundle.settings.find((x) => x.site_id === siteId),
    [bundle.settings, siteId],
  );
  const selectedKeys = useMemo(() => {
    const s = bundle.settings.find((x) => x.site_id === siteId);
    return s?.comparison_metrics?.length
      ? normalizeMetricKeys(s.comparison_metrics, siteMetrics)
      : null;
  }, [bundle.settings, siteId, siteMetrics]);
  const selection = useMemo(
    () => (selectedKeys ? splitSelection(selectedKeys) : null),
    [selectedKeys],
  );
  const shownDefs = useMemo(
    () =>
      selection
        ? metricDefs.filter((d) => selection.metrics.includes(d.key))
        : metricDefs.filter((d) => d.system),
    [metricDefs, selection],
  );
  const disciplineShownDefs = useMemo(
    () =>
      selection?.disciplines.length
        ? disciplineDefs(selection.disciplines, labels, (c) => kindOf(classes, c) === "zone")
        : [],
    [selection, labels, classes],
  );
  const comparisonRows = useMemo(
    () =>
      buildComparison(
        shownDefs,
        circuits,
        compareCircuits.length ? compareCircuits : null,
        baselineCircuits.length ? baselineCircuits : null,
      ),
    [shownDefs, circuits, compareCircuits, baselineCircuits],
  );

  const basisRows = useMemo(() => {
    return buildComparison(
      convertDefs(shownDefs, basis),
      circuits,
      compareCircuits.length ? compareCircuits : null,
      baselineCircuits.length ? baselineCircuits : null,
    );
  }, [basis, shownDefs, circuits, compareCircuits, baselineCircuits]);

  const disciplineRows = useMemo(() => {
    if (!disciplineShownDefs.length) return [];
    return buildComparison(
      convertDefs(disciplineShownDefs, basis),
      circuits,
      compareCircuits.length ? compareCircuits : null,
      baselineCircuits.length ? baselineCircuits : null,
    );
  }, [basis, disciplineShownDefs, circuits, compareCircuits, baselineCircuits]);


  const filtered = useMemo(() => detailCircuits(circuits), [circuits]);

  /* ---- headline KPI cards: fixed metrics vs. last year and baseline ---- */

  const fixedDefs = useMemo(() => fixedMetricDefs(siteMetrics), [siteMetrics]);

  const kpiCards = useMemo(() => {
    const ly = compareCircuits.length ? compareCircuits : null;
    const bl = baselineCircuits.length ? baselineCircuits : null;
    const row = (slot: FixedSlot, b: Basis): ComparisonRow | null => {
      const defs = fixedDefs.filter((d) => d.slot === slot);
      if (!defs.length) return null;
      return buildComparison(convertDefs(defs, b), circuits, ly, bl)[0] ?? null;
    };
    return {
      consCost: row("consumption", "cost"),
      consCarbon: row("consumption", "carbon"),
      consKwh: row("consumption", "kwh"),
      solar: row("solar", "kwh"),
      net: row("net", "kwh"),
      imp: row("import", "kwh"),
    };
  }, [fixedDefs, circuits, compareCircuits, baselineCircuits]);

  // Weather for the reference periods so kWh/HDD can be compared like-for-like.
  const [compareWeatherDays, setCompareWeatherDays] = useState<WeatherDay[]>([]);
  const [baselineWeatherDays, setBaselineWeatherDays] = useState<WeatherDay[]>([]);

  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    const load = (
      p: { period_start: string; period_end: string } | undefined,
      set: (d: WeatherDay[]) => void,
    ) => {
      if (!p) {
        set([]);
        return;
      }
      syncNhWeather({
        data: {
          organization_id: site.organization_id,
          site_id: site.id,
          from: p.period_start,
          to: p.period_end,
        },
      })
        .then((r) => {
          if (!cancelled) set(r.days);
        })
        .catch(() => {
          if (!cancelled) set([]);
        });
    };
    load(comparePeriod, setCompareWeatherDays);
    load(baselinePeriod, setBaselineWeatherDays);
    return () => {
      cancelled = true;
    };
  }, [
    site?.id,
    site?.organization_id,
    site?.hdd_base_c,
    comparePeriod?.id,
    comparePeriod?.period_start,
    comparePeriod?.period_end,
    baselinePeriod?.id,
    baselinePeriod?.period_start,
    baselinePeriod?.period_end,
  ]);

  const hddCard = useMemo(() => {
    const hddNow = periodHdd(weatherDays);
    const value = kwhPerHdd(kpiCards.consKwh?.current ?? 0, hddNow);
    const line = (days: WeatherDay[], prevKwh: number | undefined, title: string) => {
      if (prevKwh == null || value == null) return null;
      const prev = kwhPerHdd(prevKwh, periodHdd(days));
      if (prev == null) return null;
      const delta = value - prev;
      return cmpLine(
        title,
        {
          value: prev,
          delta,
          pct: prev !== 0 ? (delta / Math.abs(prev)) * 100 : null,
          good: delta <= 0,
        },
        (v) => num(v, 1),
        HDD_WORDS,
      );
    };
    const prevHdd = periodHdd(compareWeatherDays);
    const sub =
      value == null
        ? `No degree days — outside air stayed above the ${num(hddBase, 1)}°C base`
        : prevHdd > 0
          ? `${num(hddNow, 1)} HDD · ${
              hddNow < prevHdd
                ? "Warmer this year"
                : hddNow > prevHdd
                  ? "Colder this year"
                  : "Same degree days"
            }`
          : `${num(hddNow, 1)} HDD (base ${num(hddBase, 1)}°C)`;
    return {
      value,
      sub,
      line: line(
        compareWeatherDays,
        kpiCards.consKwh?.lastYear?.value,
        `vs. ${comparePeriod?.label ?? "last year"}`,
      ),
      baselineLine: baselinePeriod
        ? line(
            baselineWeatherDays,
            kpiCards.consKwh?.baseline?.value,
            `vs. baseline ${baselinePeriod.label}`,
          )
        : null,
    };
  }, [
    weatherDays,
    compareWeatherDays,
    baselineWeatherDays,
    kpiCards,
    hddBase,
    comparePeriod?.label,
    baselinePeriod,
  ]);


  const pvKwh = useMemo(() => {
    const pv = circuits.filter((c) => c.category === "pv");
    const detail = pv.filter((c) => !c.is_aggregate);
    const use = detail.length ? detail : pv;
    return use.reduce((a, c) => a + Math.abs(c.usage_kwh ?? 0), 0);
  }, [circuits]);

  const pvComparePct = useMemo(() => {
    const pv = compareCircuits.filter((c) => c.category === "pv");
    const detail = pv.filter((c) => !c.is_aggregate);
    const use = detail.length ? detail : pv;
    const prev = use.reduce((a, c) => a + Math.abs(c.usage_kwh ?? 0), 0);
    if (prev <= 0) return null;
    const pct = ((pvKwh - prev) / prev) * 100;
    return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, good: pct >= 0 };
  }, [compareCircuits, pvKwh]);

  const chartData = useMemo(
    () =>
      [...filtered]
        .filter((c) => (c.day_kwh ?? 0) + (c.night_kwh ?? 0) > 0)
        .sort(
          (a, b) => (b.day_kwh ?? 0) + (b.night_kwh ?? 0) - ((a.day_kwh ?? 0) + (a.night_kwh ?? 0)),
        )
        .slice(0, 18)
        .map((c) => ({
          name: c.circuit_name.length > 28 ? `${c.circuit_name.slice(0, 27)}…` : c.circuit_name,
          Day: Number((c.day_kwh ?? 0).toFixed(2)),
          Night: Number((c.night_kwh ?? 0).toFixed(2)),
        })),
    [filtered],
  );

  const leaderboard = useMemo<LeagueRow[]>(() => {
    const base = (showAggregates ? circuits : detailCircuits(circuits)).filter(
      (c) => kindOf(classes, c.circuit_name) !== "zone",
    );
    let rows: LeagueRow[] = base.map((c) => ({
      key: c.id,
      name: c.circuit_name,
      category: c.category,
      categoryLabel: labels[c.category] ?? c.category,
      usage_kwh: c.usage_kwh ?? 0,
      co2_kg: c.co2_kg ?? 0,
      cost_gbp: (c.total_cost_p ?? 0) / 100,
      day_kwh: c.day_kwh ?? 0,
      night_kwh: c.night_kwh ?? 0,
      isAggregate: c.is_aggregate,
    }));

    if (groupByZone) {
      const map = new Map<string, LeagueRow>();
      for (const r of rows) {
        const zone = zoneOf(classes, r.name) ?? "Unassigned";
        const member = {
          name: r.name,
          usage_kwh: r.usage_kwh,
          cost_gbp: r.cost_gbp,
          co2_kg: r.co2_kg,
        };
        const existing = map.get(zone);
        if (existing) {
          existing.usage_kwh += r.usage_kwh;
          existing.co2_kg += r.co2_kg;
          existing.cost_gbp += r.cost_gbp;
          existing.day_kwh += r.day_kwh;
          existing.night_kwh += r.night_kwh;
          existing.meters = (existing.meters ?? 0) + 1;
          existing.members!.push(member);
        } else {
          map.set(zone, {
            ...r,
            key: `zone:${zone}`,
            name: zone,
            category: zone,
            categoryLabel: zone,
            isAggregate: false,
            meters: 1,
            members: [member],
          });
        }
      }
      rows = Array.from(map.values());
    } else if (groupByCategory) {
      const map = new Map<string, LeagueRow>();
      for (const r of rows) {
        const existing = map.get(r.category);
        const member = {
          name: r.name,
          usage_kwh: r.usage_kwh,
          cost_gbp: r.cost_gbp,
          co2_kg: r.co2_kg,
        };
        if (existing) {
          existing.usage_kwh += r.usage_kwh;
          existing.co2_kg += r.co2_kg;
          existing.cost_gbp += r.cost_gbp;
          existing.day_kwh += r.day_kwh;
          existing.night_kwh += r.night_kwh;
          existing.meters = (existing.meters ?? 0) + 1;
          existing.members!.push(member);
        } else {
          map.set(r.category, {
            ...r,
            key: r.category,
            name: r.categoryLabel,
            isAggregate: false,
            meters: 1,
            members: [member],
          });
        }
      }
      rows = Array.from(map.values());
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) =>
      sortKey === "name" || sortKey === "category"
        ? (sortKey === "name"
            ? a.name.localeCompare(b.name)
            : a.categoryLabel.localeCompare(b.categoryLabel)) * dir
        : (a[sortKey] - b[sortKey]) * dir,
    );
  }, [circuits, showAggregates, groupByCategory, groupByZone, classes, sortKey, sortDir, labels]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "category" ? "asc" : "desc");
    }
  };

  const exportCsv = useCallback(() => {
    const csv = mergedCsv(circuits);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neutral-home-${period?.label.replace(/\s+/g, "-") ?? "period"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [circuits, period?.label]);

  useEffect(() => {
    onExporter?.(circuits.length ? exportCsv : null);
    return () => onExporter?.(null);
  }, [onExporter, exportCsv, circuits.length]);

  if (!bundle.sites.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Create a site in the Settings tab, then upload its Envisij reports.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {period ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <KpiCompare
            label="Total Consumption"
            icon={PoundSterling}
            value={kpiCards.consCost ? `£${num(kpiCards.consCost.current, 2)}` : "—"}
            sub={kpiCards.consKwh ? `${num(kpiCards.consKwh.current)} kWh consumption` : undefined}
            lines={[
              cmpLine(
                `vs. ${comparePeriod?.label ?? "last year"}`,
                kpiCards.consCost?.lastYear ?? null,
                (v) => `£${num(v, 2)}`,
                SAVING_WORDS,
              ),
              cmpLine(
                `vs. baseline ${baselinePeriod?.label ?? ""}`.trim(),
                kpiCards.consCost?.baseline ?? null,
                (v) => `£${num(v, 2)}`,
                SAVING_WORDS,
              ),
            ]}
          />
          <KpiCompare
            label="Carbon Emissions"
            icon={Leaf}
            value={kpiCards.consCarbon ? `${num(kpiCards.consCarbon.current / 1000, 2)} tCO₂e` : "—"}
            sub={kpiCards.consCarbon ? `${num(kpiCards.consCarbon.current)} kg` : undefined}
            lines={[
              cmpLine(
                `vs. ${comparePeriod?.label ?? "last year"}`,
                kpiCards.consCarbon?.lastYear ?? null,
                (v) => `${num(v / 1000, 2)} tCO₂e`,
                SAVING_WORDS,
              ),
              cmpLine(
                `vs. baseline ${baselinePeriod?.label ?? ""}`.trim(),
                kpiCards.consCarbon?.baseline ?? null,
                (v) => `${num(v / 1000, 2)} tCO₂e`,
                SAVING_WORDS,
              ),
            ]}
          />
          <KpiCompare
            label="PV Generation"
            icon={SunMedium}
            value={kpiCards.solar ? `${num(kpiCards.solar.current)} kWh` : "—"}
            sub={
              kpiCards.solar && kpiCards.solar.current > 0
                ? "Solar Generation metric"
                : "No solar circuits mapped for this period"
            }
            lines={[
              cmpLine(
                `vs. ${comparePeriod?.label ?? "last year"}`,
                kpiCards.solar?.lastYear ?? null,
                (v) => `${num(v)} kWh`,
                GENERATION_WORDS,
              ),
              cmpLine(
                `vs. baseline ${baselinePeriod?.label ?? ""}`.trim(),
                kpiCards.solar?.baseline ?? null,
                (v) => `${num(v)} kWh`,
                GENERATION_WORDS,
              ),
            ]}
          />
          <KpiCompare
            label="kWh / HDD"
            icon={Gauge}
            value={hddCard.value == null ? "n/a" : num(hddCard.value, 1)}
            sub={hddCard.sub}
            lines={[hddCard.line, hddCard.baselineLine]}
          />
          <KpiCompare
            label="Net Energy"
            icon={Zap}
            value={
              kpiCards.net?.lastYear?.pct == null
                ? "—"
                : `${kpiCards.net.lastYear.pct >= 0 ? "+" : "−"}${num(Math.abs(kpiCards.net.lastYear.pct), 1)}%`
            }
            sub={
              kpiCards.imp
                ? `Import ${num(kpiCards.imp.current)} kWh · Net ${num(kpiCards.net?.current ?? 0)} kWh`
                : undefined
            }
            lines={[
              cmpLine(
                `vs. ${comparePeriod?.label ?? "last year"}`,
                kpiCards.net?.lastYear ?? null,
                (v) => `${num(v)} kWh`,
                NET_WORDS,
              ),
              cmpLine(
                `vs. baseline ${baselinePeriod?.label ?? ""}`.trim(),
                kpiCards.net?.baseline ?? null,
                (v) => `${num(v)} kWh`,
                NET_WORDS,
              ),
            ]}
          />
          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Day / Night Split</span>
                <Sun className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">
                {num(kpis.dayPct, 1)}% / {num(kpis.nightPct, 1)}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Day vs. night share of usage</div>
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-amber-500" style={{ width: `${kpis.dayPct}%` }} />
                <div className="bg-indigo-500" style={{ width: `${kpis.nightPct}%` }} />
              </div>
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">Day</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-600">
                    <Sun className="h-3 w-3" aria-hidden />
                    {num(kpis.dayKwh)} kWh
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">Night</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-indigo-600">
                    <Moon className="h-3 w-3" aria-hidden />
                    {num(kpis.nightKwh)} kWh
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      ) : null}



      <Card className="order-first">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Site</Label>
            <Select value={siteId} onValueChange={pickSite}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bundle.sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Period</Label>
            <Select
              value={period?.id ?? ""}
              onValueChange={setPeriodId}
              disabled={!sitePeriods.length}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="No periods" />
              </SelectTrigger>
              <SelectContent>
                {sitePeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">
              vs. Last Year
              {autoLastYear && (comparePeriodId === "" || comparePeriodId === autoLastYear.id) ? (
                <span className="ml-1 text-[10px] text-muted-foreground">(auto)</span>
              ) : null}
            </Label>
            <Select
              value={comparePeriod?.id ?? ""}
              onValueChange={setComparePeriodId}
              disabled={sitePeriods.length < 2}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="No comparison" />
              </SelectTrigger>
              <SelectContent>
                {sitePeriods
                  .filter((p) => p.id !== period?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Baseline</Label>
            <Select
              value={baselinePeriodId || "none"}
              onValueChange={(v) => setBaselinePeriodId(v === "none" ? "" : v)}
              disabled={sitePeriods.length < 2}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="No baseline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No baseline</SelectItem>
                {sitePeriods
                  .filter((p) => p.id !== period?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!period ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No periods uploaded for this site yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {(comparisonRows.length || disciplineRows.length) &&
          (compareCircuits.length || baselineCircuits.length) ? (

            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
                  <div>
                    <h2 className="pb-1 text-base font-semibold tracking-tight">
                      Performance Metrics
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {period.label}
                      {compareCircuits.length ? ` · vs. Last Year: ${comparePeriod?.label}` : ""}
                      {baselineCircuits.length ? ` · Baseline: ${baselinePeriod?.label}` : ""}
                    </p>
                  </div>
                  <Tabs value={basis} onValueChange={(v) => setBasis(v as Basis)}>
                    <TabsList>
                      <TabsTrigger value="kwh">kWh</TabsTrigger>
                      <TabsTrigger value="cost">Cost</TabsTrigger>
                      <TabsTrigger value="carbon">Carbon</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Metric</th>
                        <th className="py-2 text-right font-medium">{period.label}</th>
                        {compareCircuits.length ? (
                          <>
                            <th className="py-2 text-right font-medium">vs. Last Year</th>
                            <th className="py-2 text-right font-medium">Change</th>
                          </>
                        ) : null}
                        {baselineCircuits.length ? (
                          <>
                            <th className="py-2 text-right font-medium">Baseline</th>
                            <th className="py-2 text-right font-medium">Change</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      <SectionRow
                        title="Energy Performance"
                        span={
                          2 + (compareCircuits.length ? 2 : 0) + (baselineCircuits.length ? 2 : 0)
                        }
                      />
                      {basisRows.map((r) => (
                        <MetricRow
                          key={r.key}
                          row={r}
                          showLastYear={!!compareCircuits.length}
                          showBaseline={!!baselineCircuits.length}
                        />
                      ))}
                      {disciplineRows.length ? (
                        <>
                          <SectionRow
                            title="Main Consumers by Discipline"
                            span={
                              2 +
                              (compareCircuits.length ? 2 : 0) +
                              (baselineCircuits.length ? 2 : 0)
                            }
                          />
                          {disciplineRows.map((r) => (
                            <MetricRow
                              key={r.key}
                              row={r}
                              showLastYear={!!compareCircuits.length}
                              showBaseline={!!baselineCircuits.length}
                            />
                          ))}
                        </>
                      ) : null}
                    </tbody>

                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-5">
              <h2 className="pb-1 text-base font-semibold tracking-tight">
                Day / Night Load & Waste
              </h2>
              <p className="pb-4 text-sm text-muted-foreground">
                Top circuits by total usage. Night share above {NIGHT_FLAG_THRESHOLD}% is flagged
                below.
              </p>
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Legend />
                    <Bar dataKey="Day" stackId="a" fill="hsl(38 92% 50%)" />
                    <Bar dataKey="Night" stackId="a" fill="hsl(243 75% 59%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {flags.length ? (
                <div className="mt-4 space-y-2">
                  {flags.slice(0, 8).map((f) => (
                    <div
                      key={f.circuit.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm",
                        f.nonEssential ? "border-amber-500/40 bg-amber-500/5" : "",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={cn(
                            "h-4 w-4",
                            f.nonEssential ? "text-amber-600" : "text-muted-foreground",
                          )}
                        />
                        <span className="font-medium">{f.circuit.circuit_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {labels[f.circuit.category] ?? f.circuit.category}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        {num(f.nightShare, 1)}% at night · {num(f.circuit.night_kwh ?? 0)} kWh
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No circuits exceed the night-share threshold.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    Efficiency League Table
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Breakdown of all imported datapoints, including totals.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="nh-aggs"
                      checked={showAggregates}
                      onCheckedChange={setShowAggregates}
                    />
                    <Label htmlFor="nh-aggs" className="text-xs">
                      Include totals & incomers
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="nh-group"
                      checked={groupByCategory}
                      onCheckedChange={setGroupByCategory}
                    />
                    <Label htmlFor="nh-group" className="text-xs">
                      Group by Sub-category
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="nh-zone-group" checked={groupByZone} onCheckedChange={setGroupByZone} />
                    <Label htmlFor="nh-zone-group" className="text-xs">
                      Group by Zone
                    </Label>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <SortTh
                        label={groupByZone ? "Zone" : groupByCategory ? "Sub-category" : "Circuit"}
                        col="name"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                        align="left"
                      />
                      {groupByCategory || groupByZone ? null : (
                        <SortTh
                          label="Sub-category"
                          col="category"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          align="left"
                        />
                      )}
                      <SortTh
                        label="Usage (kWh)"
                        col="usage_kwh"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortTh
                        label="CO₂ (kg)"
                        col="co2_kg"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortTh
                        label="Cost (£)"
                        col="cost_gbp"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortTh
                        label="Day (kWh)"
                        col="day_kwh"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortTh
                        label="Night (kWh)"
                        col="night_kwh"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((r) => (
                      <tr key={r.key} className="border-t">
                        <td className="py-2 pr-3">
                          {r.name}
                          {r.isAggregate ? (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              total
                            </Badge>
                          ) : null}
                          {groupByCategory || groupByZone ? (
                            <HoverCard openDelay={80}>
                              <HoverCardTrigger asChild>
                                <Badge variant="outline" className="ml-2 cursor-help text-[10px]">
                                  {r.meters} meters
                                </Badge>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80 p-0" align="start">
                                <div className="border-b px-3 py-2 text-xs font-medium">
                                  {r.name} · {r.meters} meters
                                </div>
                                <div className="max-h-64 overflow-y-auto p-1">
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {[...(r.members ?? [])]
                                        .sort((a, b) => b.usage_kwh - a.usage_kwh)
                                        .map((m) => (
                                          <tr key={m.name}>
                                            <td className="px-2 py-1">{m.name}</td>
                                            <td className="px-2 py-1 text-right tabular-nums">
                                              {num(m.usage_kwh, 1)} kWh
                                            </td>
                                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                                              £{num(m.cost_gbp, 2)}
                                            </td>
                                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                                              {num(m.co2_kg, 1)} kg
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          ) : null}
                        </td>
                        {groupByCategory ? null : (
                          <td className="py-2 text-xs text-muted-foreground">{r.categoryLabel}</td>
                        )}
                        <td className="py-2 text-right">{num(r.usage_kwh, 1)}</td>
                        <td className="py-2 text-right">{num(r.co2_kg, 1)}</td>
                        <td className="py-2 text-right">{num(r.cost_gbp, 2)}</td>
                        <td className="py-2 text-right">{r.day_kwh ? num(r.day_kwh, 1) : "—"}</td>
                        <td
                          className={cn(
                            "py-2 text-right",
                            r.day_kwh + r.night_kwh > 0 &&
                              (r.night_kwh / (r.day_kwh + r.night_kwh)) * 100 > NIGHT_FLAG_THRESHOLD
                              ? "font-medium text-amber-600"
                              : "",
                          )}
                        >
                          {r.night_kwh ? num(r.night_kwh, 1) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {period.source_temperature_filename ? (
            <NeutralHomeTemperature
              periodId={period.id}
              periodLabel={period.label}
              siteId={siteId}
              band={{
                min: settings?.comfort_min_c ?? DEFAULT_BAND.min,
                max: settings?.comfort_max_c ?? DEFAULT_BAND.max,
              }}
              roomMap={bundle.roomMap}
              circuits={circuits}
              classes={classes}
            />
          ) : null}

          <NeutralHomeZones
            circuits={circuits}
            classes={classes}
            roomMap={bundle.roomMap}
            siteId={siteId}
            band={{
              min: settings?.comfort_min_c ?? DEFAULT_BAND.min,
              max: settings?.comfort_max_c ?? DEFAULT_BAND.max,
            }}
            temperaturePeriodId={period.source_temperature_filename ? period.id : null}
            weatherDays={weatherDays}
            hddBase={hddBase}
            weatherNote={weatherNote}
          />
        </>
      )}
    </div>
  );
}

function variancePct(
  rows: ReturnType<typeof compareKpis>,
  metric: string,
): { text: string; good: boolean } | null {
  const row = rows.find((r) => r.metric === metric);
  if (!row || row.pct == null || row.previous === 0) return null;
  return {
    text: `${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(1)}%`,
    good: row.lowerIsBetter ? row.delta <= 0 : row.delta >= 0,
  };
}

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "right",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th className={cn("py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" ? "justify-end" : "",
          active ? "text-foreground" : "",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { text: string; good: boolean } | null;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{sub ?? ""}</span>
          {badge ? (
            <span
              className={cn(
                "flex items-center gap-1 font-medium",
                badge.good ? "text-emerald-600" : "text-red-600",
              )}
            >
              {badge.good ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {badge.text}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
