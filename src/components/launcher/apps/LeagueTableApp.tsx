import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Coins, Flame, Leaf, PoundSterling, Trophy, TrendingDown, TrendingUp, Zap, Sun, Droplet, Gauge } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Line, LineChart, Legend,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import type { ConsumptionRow } from "@/lib/data-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBuildings, useConsumption, useDataStore, useOrganisations,
} from "@/lib/data-store";
import { resolveProfile } from "@/lib/energy/profile";
import { useLauncher } from "@/lib/launcher-context";
import {
  aggregateBySite, classifyUtility, computeYoY, estimateCo2Kg, estimateCostGbp,
  orgCo2Factor, orgTariff, PRESET_LABEL, presetRange, prevYearRange,
  unitLabel, type Preset, type SiteAggregate, type Utility,
} from "@/lib/energy/league";
import { cn } from "@/lib/utils";

type SortKey = "total" | "yoy" | "cost" | "co2" | "peak" | "loadFactor" | "outOfHours" | "coverage" | "name";
type Dir = "asc" | "desc";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const UTILITY_META: Record<Utility, { label: string; icon: typeof Zap; color: string; chart: string; chartPrev: string }> = {
  electricity: { label: "Electricity", icon: Zap, color: "text-violet-500", chart: "#8b5cf6", chartPrev: "#c4b5fd" },
  gas: { label: "Gas", icon: Flame, color: "text-orange-500", chart: "#f97316", chartPrev: "#fdba74" },
  water: { label: "Water", icon: Droplet, color: "text-blue-500", chart: "#3b82f6", chartPrev: "#93c5fd" },
  solar: { label: "Solar", icon: Sun, color: "text-yellow-500", chart: "#eab308", chartPrev: "#fde68a" },
};

export function LeagueTableApp() {
  const { org } = useLauncher();
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);
  const { consumption } = useConsumption();
  const { state } = useDataStore();
  const orgFull = organisations.find((o) => o.id === org.id);

  const orgRows = useMemo(
    () => consumption.filter((r) => r.organization_id === org.id),
    [consumption, org.id],
  );

  // Anchor "today" = latest interval date across the org's consumption (UTC).
  const today = useMemo(() => {
    const latest = orgRows.reduce<string>((a, r) => (r.interval_date > a ? r.interval_date : a), "");
    if (!latest) return new Date();
    const [y, m, d] = latest.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }, [orgRows]);

  // Utilities actually present in this org
  const availableUtilities = useMemo(() => {
    const set = new Set<Utility>();
    for (const r of orgRows) {
      const u = classifyUtility(r.variable_category);
      if (u) set.add(u);
    }
    return (["electricity", "gas", "water", "solar"] as Utility[]).filter((u) => set.has(u));
  }, [orgRows]);

  const [utility, setUtility] = useState<Utility>("electricity");
  const activeUtility: Utility = availableUtilities.includes(utility)
    ? utility
    : (availableUtilities[0] ?? "electricity");

  const [preset, setPreset] = useState<Preset>("ytd");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [dir, setDir] = useState<Dir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const range = useMemo(
    () => presetRange(preset, today, { start: customStart, end: customEnd }),
    [preset, today, customStart, customEnd],
  );
  const prevRange = useMemo(() => prevYearRange(range), [range]);

  // Filter to utility-specific rows
  const utilRows = useMemo(
    () => orgRows.filter((r) => classifyUtility(r.variable_category) === activeUtility),
    [orgRows, activeUtility],
  );

  const profileFor = (buildingId: string | null) => {
    const b = buildingId ? buildings.find((x) => x.id === buildingId) : undefined;
    const bs = buildingId ? state.schedules.filter((s) => s.building_id === buildingId) : [];
    return resolveProfile(orgFull, b, bs);
  };

  const currentAgg = useMemo(
    () => aggregateBySite(utilRows, buildings, range, profileFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [utilRows, buildings, range, orgFull, state.schedules],
  );
  const prevAgg = useMemo(
    () => aggregateBySite(utilRows, buildings, prevRange, profileFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [utilRows, buildings, prevRange, orgFull, state.schedules],
  );
  const prevByBldg = useMemo(() => {
    const m = new Map<string, SiteAggregate>();
    for (const a of prevAgg) if (a.buildingId) m.set(a.buildingId, a);
    return m;
  }, [prevAgg]);

  const tariff = orgTariff(orgFull, activeUtility);
  const co2Factor = orgCo2Factor(orgFull, activeUtility);

  // Enrich rows with derived columns
  const rows = useMemo(() => {
    return currentAgg.map((a) => {
      const prevKwh = a.buildingId ? prevByBldg.get(a.buildingId)?.totalKwh ?? 0 : 0;
      const yoy = computeYoY(a.totalKwh, prevKwh);
      const costGbp = estimateCostGbp(a.totalKwh, tariff);
      const co2Kg = estimateCo2Kg(a.totalKwh, co2Factor);
      return { ...a, prevKwh, yoyPct: yoy.deltaPct, yoyKwh: yoy.deltaKwh, costGbp, co2Kg };
    });
  }, [currentAgg, prevByBldg, tariff, co2Factor]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.buildingName.toLowerCase().includes(q)) : rows;
    const mul = dir === "asc" ? 1 : -1;
    const sorters: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      total: (a, b) => (a.totalKwh - b.totalKwh) * mul,
      yoy: (a, b) => (a.yoyPct - b.yoyPct) * mul,
      cost: (a, b) => (a.costGbp - b.costGbp) * mul,
      co2: (a, b) => (a.co2Kg - b.co2Kg) * mul,
      peak: (a, b) => (a.peakKw - b.peakKw) * mul,
      loadFactor: (a, b) => (a.loadFactor - b.loadFactor) * mul,
      outOfHours: (a, b) => (a.outOfHoursPct - b.outOfHoursPct) * mul,
      coverage: (a, b) => (a.coveragePct - b.coveragePct) * mul,
      name: (a, b) => a.buildingName.localeCompare(b.buildingName) * mul,
    };
    return [...list].sort(sorters[sortKey]);
  }, [rows, search, sortKey, dir]);

  // KPI totals
  const totals = useMemo(() => {
    const t = filtered.reduce((acc, r) => ({
      kwh: acc.kwh + r.totalKwh,
      prev: acc.prev + r.prevKwh,
      cost: acc.cost + r.costGbp,
      co2: acc.co2 + r.co2Kg,
      present: acc.present + r.presentSlots,
      expected: acc.expected + r.expectedSlots,
    }), { kwh: 0, prev: 0, cost: 0, co2: 0, present: 0, expected: 0 });
    const yoy = computeYoY(t.kwh, t.prev);
    const coverage = t.expected > 0 ? (t.present / t.expected) * 100 : 0;
    return { ...t, yoy, coverage };
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setDir(k === "name" || k === "outOfHours" ? "asc" : "desc"); }
  };

  const unit = unitLabel(activeUtility);
  const UtilIcon = UTILITY_META[activeUtility].icon;
  const utilColor = UTILITY_META[activeUtility].color;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
            <Trophy className="h-3.5 w-3.5" /> League Table
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Consumption League</h2>
          <p className="text-sm text-muted-foreground">
            Ranking {filtered.length} site{filtered.length === 1 ? "" : "s"} across {org.name} · {range.startISO} → {range.endISO}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Utility</label>
            <Tabs value={activeUtility} onValueChange={(v) => setUtility(v as Utility)}>
              <TabsList>
                {(availableUtilities.length ? availableUtilities : (["electricity"] as Utility[])).map((u) => {
                  const M = UTILITY_META[u];
                  const Icon = M.icon;
                  return (
                    <TabsTrigger key={u} value={u} className="gap-1.5">
                      <Icon className={cn("h-3.5 w-3.5", M.color)} /> {M.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
          <div className="min-w-[200px]">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Time range</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRESET_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">From</label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">To</label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Search site</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by site name…" />
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label={`Total ${UTILITY_META[activeUtility].label.toLowerCase()}`}
          value={`${fmtN(totals.kwh, 0)} ${unit}`}
          icon={UtilIcon}
          iconClass={utilColor}
          trend={totals.prev > 0 ? {
            pct: totals.yoy.deltaPct,
            label: `vs ${range.startISO.slice(0, 4) === prevRange.startISO.slice(0, 4) ? "prior" : prevRange.startISO.slice(0, 4)}`,
          } : undefined}
        />
        <KpiCard
          label="Estimated cost"
          value={`£${fmtN(totals.cost, 0)}`}
          icon={PoundSterling}
          iconClass="text-emerald-600"
          sub={`@ ${fmtN(tariff, 1)}p / ${unit}`}
        />
        <KpiCard
          label="CO₂e"
          value={`${fmtN(totals.co2 / 1000, 1)} tCO₂e`}
          icon={Leaf}
          iconClass="text-emerald-600"
          sub={`≈ ${fmtN((totals.co2 * 2.5) | 0, 0)} miles driven`}
        />
        <KpiCard
          label="Sites tracked"
          value={`${filtered.length}`}
          icon={Gauge}
          iconClass="text-violet-500"
          sub={`Data coverage ${fmtN(totals.coverage, 1)}%`}
        />
      </div>

      {/* League table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-3 text-center">#</th>
                  <Th active={sortKey === "name"} dir={dir} onClick={() => toggleSort("name")}>Site</Th>
                  <Th active={sortKey === "total"} dir={dir} onClick={() => toggleSort("total")} align="right">
                    {UTILITY_META[activeUtility].label} ({unit})
                  </Th>
                  <Th active={sortKey === "yoy"} dir={dir} onClick={() => toggleSort("yoy")} align="right">vs Prev Year</Th>
                  <Th active={sortKey === "cost"} dir={dir} onClick={() => toggleSort("cost")} align="right">Cost (£)</Th>
                  <Th active={sortKey === "co2"} dir={dir} onClick={() => toggleSort("co2")} align="right">CO₂e (kg)</Th>
                  <Th active={sortKey === "peak"} dir={dir} onClick={() => toggleSort("peak")} align="right">Peak (kW)</Th>
                  <Th active={sortKey === "loadFactor"} dir={dir} onClick={() => toggleSort("loadFactor")} align="right">Load Fctr</Th>
                  <Th active={sortKey === "outOfHours"} dir={dir} onClick={() => toggleSort("outOfHours")} align="right">Out-of-hours %</Th>
                  <Th active={sortKey === "coverage"} dir={dir} onClick={() => toggleSort("coverage")} align="right">Data</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No {UTILITY_META[activeUtility].label.toLowerCase()} data for this range.
                  </td></tr>
                )}
                {filtered.map((r, idx) => {
                  const isOpen = expanded === (r.buildingId ?? "unassigned");
                  const isReducer = r.prevKwh > 0 && r.yoyPct < 0;
                  const isGrower = r.prevKwh > 0 && r.yoyPct > 0;
                  return (
                    <>
                      <tr
                        key={(r.buildingId ?? "unassigned") + "-row"}
                        className={cn(
                          "cursor-pointer border-b transition-colors hover:bg-muted/40",
                          isOpen && "bg-muted/40",
                        )}
                        onClick={() => setExpanded(isOpen ? null : (r.buildingId ?? "unassigned"))}
                      >
                        <td className="px-3 py-3 text-center text-xs font-mono text-muted-foreground">
                          {rankMedal(idx + 1)}
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {r.buildingName}
                          <div className="text-xs font-normal text-muted-foreground">
                            {r.meterCount} meter{r.meterCount === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">{fmtN(r.totalKwh, 0)}</td>
                        <td className="px-3 py-3 text-right">
                          {r.prevKwh > 0 ? (
                            <span className={cn(
                              "inline-flex items-center gap-1 font-mono",
                              isReducer ? "text-emerald-600" : isGrower ? "text-red-600" : "text-muted-foreground",
                            )}>
                              {isReducer ? <TrendingDown className="h-3.5 w-3.5" /> : isGrower ? <TrendingUp className="h-3.5 w-3.5" /> : null}
                              {r.yoyPct > 0 ? "+" : ""}{fmtN(r.yoyPct, 1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">£{fmtN(r.costGbp, 0)}</td>
                        <td className="px-3 py-3 text-right font-mono">{fmtN(r.co2Kg, 0)}</td>
                        <td className="px-3 py-3 text-right font-mono">{fmtN(r.peakKw, 1)}</td>
                        <td className="px-3 py-3 text-right font-mono">{r.loadFactor > 0 ? fmtN(r.loadFactor, 2) : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono">
                          <span className={cn(
                            r.outOfHoursPct > 40 ? "text-amber-600" : "text-foreground",
                          )}>{fmtN(r.outOfHoursPct, 0)}%</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Badge variant="outline" className={cn(
                            "font-mono",
                            r.coveragePct >= 95 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" :
                            r.coveragePct >= 80 ? "border-amber-500/30 bg-amber-500/10 text-amber-700" :
                            "border-red-500/30 bg-red-500/10 text-red-700",
                          )}>
                            {fmtN(r.coveragePct, 0)}%
                          </Badge>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={(r.buildingId ?? "unassigned") + "-drill"} className="border-b bg-muted/20">
                          <td colSpan={10} className="p-4">
                            <MonthlyDrilldown
                              row={r}
                              prev={r.buildingId ? prevByBldg.get(r.buildingId) : undefined}
                              utility={activeUtility}
                              unit={unit}
                              utilRows={utilRows}
                              rangeYear={Number(range.startISO.slice(0, 4))}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" /> Tariff & carbon factors are set per organisation in Settings → Organisations. Defaults used when unset.</span>
      </div>
    </div>
  );
}

function Th({
  children, active, dir, onClick, align,
}: { children: React.ReactNode; active: boolean; dir: Dir; onClick: () => void; align?: "right" }) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "cursor-pointer select-none px-3 py-3 font-medium hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
        active && "text-foreground",
      )}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {children}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function KpiCard({
  label, value, sub, trend, icon: Icon, iconClass,
}: {
  label: string; value: string; sub?: string;
  trend?: { pct: number; label: string };
  icon: typeof Zap; iconClass?: string;
}) {
  const positive = trend && trend.pct < 0; // negative % = reduction = good
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          <Icon className={cn("h-4 w-4", iconClass ?? "text-primary")} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        {trend && (
          <div className={cn(
            "mt-1 text-xs font-medium",
            positive ? "text-emerald-600" : "text-red-600",
          )}>
            {trend.pct > 0 ? "+" : ""}{fmtN(trend.pct, 1)}% {trend.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyDrilldown({
  row, prev, utility, unit,
}: {
  row: SiteAggregate & { costGbp: number; co2Kg: number };
  prev: SiteAggregate | undefined;
  utility: Utility;
  unit: string;
}) {
  const data = MONTH_LABELS.map((m, i) => ({
    month: m,
    current: Math.round(row.monthlyTotals[i] ?? 0),
    previous: Math.round(prev?.monthlyTotals[i] ?? 0),
  }));
  const monthsWithData = data.filter((d) => d.current > 0);
  const best = monthsWithData.reduce<null | typeof data[0]>((a, b) => (a && a.current < b.current ? a : b), null);
  const worst = monthsWithData.reduce<null | typeof data[0]>((a, b) => (a && a.current > b.current ? a : b), null);
  const M = UTILITY_META[utility];
  const Icon = M.icon;

  return (
    <div className="grid gap-4 md:grid-cols-[1.5fr,1fr]">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className={cn("h-3.5 w-3.5", M.color)} /> Monthly {M.label.toLowerCase()} — current vs previous year
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="current" name={`This period (${unit})`} fill="hsl(var(--primary))" />
              <Bar dataKey="previous" name={`Previous year (${unit})`} fill="hsl(var(--muted-foreground))" fillOpacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Rolling trend</div>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <Line dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <RTooltip />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={1} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid gap-2 text-xs">
          {best && (
            <div className="flex items-center justify-between rounded-md border bg-emerald-500/5 px-3 py-2">
              <span className="text-muted-foreground">Lowest month</span>
              <span className="font-mono text-emerald-700">{best.month} · {fmtN(best.current, 0)} {unit}</span>
            </div>
          )}
          {worst && (
            <div className="flex items-center justify-between rounded-md border bg-red-500/5 px-3 py-2">
              <span className="text-muted-foreground">Highest month</span>
              <span className="font-mono text-red-700">{worst.month} · {fmtN(worst.current, 0)} {unit}</span>
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-muted-foreground">Cost</span>
            <span className="font-mono">£{fmtN(row.costGbp, 0)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-muted-foreground">CO₂e</span>
            <span className="font-mono">{fmtN(row.co2Kg, 0)} kg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function rankMedal(rank: number): React.ReactNode {
  if (rank === 1) return <span title="Highest consumption">🥇</span>;
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return rank;
}

function fmtN(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}