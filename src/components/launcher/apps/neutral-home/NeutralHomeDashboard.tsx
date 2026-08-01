import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download, Gauge, Leaf, Moon, PoundSterling, Sun, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { NeutralHomeBundle } from "@/lib/neutral-home.functions";
import {
  compareKpis, computeKpis, detailCircuits, mergedCsv, nightFlags, simulateShift,
  NIGHT_FLAG_THRESHOLD, type CircuitRecord,
} from "@/lib/neutral-home/analytics";
import { CATEGORY_LABEL, type CircuitCategory } from "@/lib/neutral-home/parse";

type SortKey =
  | "circuit_name"
  | "category"
  | "usage_kwh"
  | "usage_kwh_per_m2"
  | "cost_p_per_m2"
  | "co2_kg_per_m2"
  | "total_cost_p"
  | "night";

type SortDir = "asc" | "desc";

const nightShareOf = (c: CircuitRecord) => {
  const t = (c.day_kwh ?? 0) + (c.night_kwh ?? 0);
  return t > 0 ? ((c.night_kwh ?? 0) / t) * 100 : 0;
};

const num = (v: number, dp = 0) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function NeutralHomeDashboard({ bundle }: { bundle: NeutralHomeBundle }) {
  const [siteId, setSiteId] = useState<string>(bundle.sites[0]?.id ?? "");
  const sitePeriods = useMemo(
    () => bundle.periods.filter((p) => p.site_id === siteId),
    [bundle.periods, siteId],
  );
  const [periodId, setPeriodId] = useState<string>("");
  const [comparePeriodId, setComparePeriodId] = useState<string>("");
  const [category, setCategory] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("usage_kwh");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [shiftPct, setShiftPct] = useState(10);
  const [manualDay, setManualDay] = useState("");
  const [manualNight, setManualNight] = useState("");
  const [showAggregates, setShowAggregates] = useState(true);

  const period = sitePeriods.find((p) => p.id === periodId) ?? sitePeriods[0];
  const comparePeriod =
    sitePeriods.find((p) => p.id === comparePeriodId) ??
    sitePeriods.filter((p) => p.id !== period?.id)[0];

  const circuits = useMemo(
    () => (period ? bundle.circuits.filter((c) => c.period_id === period.id) : []),
    [bundle.circuits, period],
  );
  const compareCircuits = useMemo(
    () => (comparePeriod ? bundle.circuits.filter((c) => c.period_id === comparePeriod.id) : []),
    [bundle.circuits, comparePeriod],
  );

  const kpis = useMemo(() => computeKpis(circuits), [circuits]);
  const compareKpi = useMemo(() => computeKpis(compareCircuits), [compareCircuits]);
  const variance = useMemo(() => compareKpis(kpis, compareKpi), [kpis, compareKpi]);
  const flags = useMemo(() => nightFlags(circuits), [circuits]);

  const filtered = useMemo(() => {
    const rows = detailCircuits(circuits);
    return category === "all" ? rows : rows.filter((c) => c.category === category);
  }, [circuits, category]);

  const categories = useMemo(() => {
    const set = new Set<CircuitCategory>();
    for (const c of circuits) set.add(c.category);
    return Array.from(set).sort();
  }, [circuits]);

  const chartData = useMemo(
    () =>
      [...filtered]
        .filter((c) => (c.day_kwh ?? 0) + (c.night_kwh ?? 0) > 0)
        .sort((a, b) => ((b.day_kwh ?? 0) + (b.night_kwh ?? 0)) - ((a.day_kwh ?? 0) + (a.night_kwh ?? 0)))
        .slice(0, 18)
        .map((c) => ({
          name: c.circuit_name.length > 28 ? `${c.circuit_name.slice(0, 27)}…` : c.circuit_name,
          Day: Number((c.day_kwh ?? 0).toFixed(2)),
          Night: Number((c.night_kwh ?? 0).toFixed(2)),
        })),
    [filtered],
  );

  const leaderboard = useMemo(() => {
    const base = showAggregates ? circuits : detailCircuits(circuits);
    const rows = category === "all" ? base : base.filter((c) => c.category === category);
    const dir = sortDir === "asc" ? 1 : -1;
    const text = (c: CircuitRecord) =>
      sortKey === "category" ? CATEGORY_LABEL[c.category] : c.circuit_name;
    const val = (c: CircuitRecord) => (sortKey === "night" ? nightShareOf(c) : Number(c[sortKey as keyof CircuitRecord] ?? 0));
    return [...rows].sort((a, b) =>
      sortKey === "circuit_name" || sortKey === "category"
        ? text(a).localeCompare(text(b)) * dir
        : (val(a) - val(b)) * dir,
    );
  }, [circuits, category, showAggregates, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "circuit_name" || key === "category" ? "asc" : "desc");
    }
  };

  const dayRate = kpis.dayRate ?? (manualDay ? Number(manualDay) : null);
  const nightRate = kpis.nightRate ?? (manualNight ? Number(manualNight) : null);
  const shift = simulateShift(kpis, shiftPct, dayRate, nightRate);

  const exportCsv = () => {
    const csv = mergedCsv(circuits);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neutral-home-${period?.label.replace(/\s+/g, "-") ?? "period"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Site</Label>
            <Select value={siteId} onValueChange={(v) => { setSiteId(v); setPeriodId(""); setComparePeriodId(""); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {bundle.sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={period?.id ?? ""} onValueChange={setPeriodId} disabled={!sitePeriods.length}>
              <SelectTrigger className="w-48"><SelectValue placeholder="No periods" /></SelectTrigger>
              <SelectContent>
                {sitePeriods.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Compare with</Label>
            <Select value={comparePeriod?.id ?? ""} onValueChange={setComparePeriodId}
              disabled={sitePeriods.length < 2}>
              <SelectTrigger className="w-48"><SelectValue placeholder="No comparison" /></SelectTrigger>
              <SelectContent>
                {sitePeriods.filter((p) => p.id !== period?.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Circuit category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportCsv}
            disabled={!circuits.length}>
            <Download className="h-3.5 w-3.5" /> Export merged CSV
          </Button>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Kpi label="Meters imported" value={num(circuits.length)} icon={Gauge}
              sub={`${circuits.filter((c) => !c.is_aggregate).length} sub-circuits · ${circuits.filter((c) => c.is_aggregate).length} totals/incomers`} />
            <Kpi label="Total consumption" value={`${num(kpis.totalKwh)} kWh`} icon={Zap}
              badge={variancePct(variance, "Total consumption")} />
            <Card className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Day / Night split</span>
                  <div className="flex gap-1"><Sun className="h-4 w-4 text-amber-500" /><Moon className="h-4 w-4 text-indigo-500" /></div>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">
                  {num(kpis.dayPct, 1)}% / {num(kpis.nightPct, 1)}%
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-amber-500" style={{ width: `${kpis.dayPct}%` }} />
                  <div className="bg-indigo-500" style={{ width: `${kpis.nightPct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{num(kpis.dayKwh)} kWh day</span>
                  <span>{num(kpis.nightKwh)} kWh night</span>
                </div>
              </CardContent>
            </Card>
            <Kpi label="Total cost" value={`£${num(kpis.totalCostGbp, 2)}`} icon={PoundSterling}
              badge={variancePct(variance, "Total cost")} />
            <Kpi label="Carbon" value={`${num(kpis.co2Kg / 1000, 2)} tCO₂e`} icon={Leaf}
              sub={`${num(kpis.co2Kg)} kg`} badge={variancePct(variance, "Carbon")} />
            <Kpi label="Blended cost" value={`${num(kpis.blendedPPerKwh, 2)} p/kWh`} icon={Zap}
              badge={variancePct(variance, "Blended cost")} sub={`${kpis.circuitCount} circuits`} />
          </div>

          {compareCircuits.length ? (
            <Card>
              <CardContent className="p-5">
                <h2 className="pb-1 text-base font-semibold tracking-tight">Period comparison</h2>
                <p className="pb-4 text-sm text-muted-foreground">
                  {period.label} vs {comparePeriod?.label}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Metric</th>
                        <th className="py-2 text-right font-medium">{period.label}</th>
                        <th className="py-2 text-right font-medium">{comparePeriod?.label}</th>
                        <th className="py-2 text-right font-medium">Change</th>
                        <th className="py-2 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variance.map((v) => {
                        const good = v.lowerIsBetter ? v.delta <= 0 : v.delta >= 0;
                        return (
                          <tr key={v.metric} className="border-t">
                            <td className="py-2">{v.metric}</td>
                            <td className="py-2 text-right">{num(v.current, 2)} {v.unit}</td>
                            <td className="py-2 text-right text-muted-foreground">{num(v.previous, 2)} {v.unit}</td>
                            <td className={cn("py-2 text-right font-medium", good ? "text-emerald-600" : "text-red-600")}>
                              {v.delta >= 0 ? "+" : ""}{num(v.delta, 2)} {v.unit}
                            </td>
                            <td className={cn("py-2 text-right font-medium", good ? "text-emerald-600" : "text-red-600")}>
                              {v.pct == null ? "—" : `${v.pct >= 0 ? "+" : ""}${num(v.pct, 1)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-5">
              <h2 className="pb-1 text-base font-semibold tracking-tight">Day / night load & waste</h2>
              <p className="pb-4 text-sm text-muted-foreground">
                Top circuits by total usage. Night share above {NIGHT_FLAG_THRESHOLD}% is flagged below.
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
                    <div key={f.circuit.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm",
                        f.nonEssential ? "border-amber-500/40 bg-amber-500/5" : "",
                      )}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={cn("h-4 w-4", f.nonEssential ? "text-amber-600" : "text-muted-foreground")} />
                        <span className="font-medium">{f.circuit.circuit_name}</span>
                        <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[f.circuit.category]}</Badge>
                      </div>
                      <div className="text-muted-foreground">
                        {num(f.nightShare, 1)}% at night · {num(f.circuit.night_kwh ?? 0)} kWh
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No circuits exceed the night-share threshold.</p>
              )}

              <div className="mt-6 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Tariff shift simulator</h3>
                    <p className="text-xs text-muted-foreground">
                      Move {shiftPct}% of day usage onto the night rate.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold tracking-tight text-emerald-600">
                      {dayRate != null && nightRate != null ? `£${num(shift.savingGbp, 2)}` : "—"}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Modelled saving
                    </div>
                  </div>
                </div>
                <div className="mt-4 max-w-md">
                  <Slider value={[shiftPct]} min={0} max={20} step={1}
                    onValueChange={(v) => setShiftPct(v[0] ?? 0)} />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>0%</span><span>10%</span><span>20%</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {num(shift.shiftedKwh)} kWh shifted
                  {dayRate != null && nightRate != null
                    ? ` · day ${num(dayRate, 2)} p/kWh vs night ${num(nightRate, 2)} p/kWh`
                    : ""}
                </div>
                {kpis.dayRate == null || kpis.nightRate == null ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:max-w-md">
                    <p className="text-xs text-amber-600 sm:col-span-2">
                      This report has no day/night unit rates. Enter rates to run the simulation.
                    </p>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Day rate (p/kWh)</Label>
                      <Input type="number" value={manualDay} onChange={(e) => setManualDay(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Night rate (p/kWh)</Label>
                      <Input type="number" value={manualNight} onChange={(e) => setManualNight(e.target.value)} />
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Efficiency Legue Table</h2>
                  <p className="text-sm text-muted-foreground">
                    {showAggregates
                      ? "Showing every imported meter, including totals, incomers and inverters."
                      : "Totals, incomers and inverters are hidden."} Click any column header to sort.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="nh-aggs" checked={showAggregates} onCheckedChange={setShowAggregates} />
                  <Label htmlFor="nh-aggs" className="text-xs">Include totals & incomers</Label>
                </div>
                <Select value={sortKey} onValueChange={(v) => toggleSort(v as SortKey)}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circuit_name">Circuit name</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="usage_kwh">Usage (kWh)</SelectItem>
                    <SelectItem value="usage_kwh_per_m2">Usage (kWh/m²)</SelectItem>
                    <SelectItem value="cost_p_per_m2">Cost (p/m²)</SelectItem>
                    <SelectItem value="co2_kg_per_m2">CO₂ (kg/m²)</SelectItem>
                    <SelectItem value="total_cost_p">Cost (£)</SelectItem>
                    <SelectItem value="night">Night share</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <SortTh label="Circuit" col="circuit_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
                      <SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
                      <SortTh label="kWh" col="usage_kwh" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="kWh/m²" col="usage_kwh_per_m2" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="p/m²" col="cost_p_per_m2" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="kg/m²" col="co2_kg_per_m2" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="Cost £" col="total_cost_p" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="Night %" col="night" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((c) => {
                      const nightShare = nightShareOf(c);
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="py-2 pr-3">
                            {c.circuit_name}
                            {c.is_aggregate ? (
                              <Badge variant="outline" className="ml-2 text-[10px]">total</Badge>
                            ) : null}
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{CATEGORY_LABEL[c.category]}</td>
                          <td className="py-2 text-right">{num(c.usage_kwh ?? 0, 1)}</td>
                          <td className="py-2 text-right">{c.usage_kwh_per_m2 == null ? "—" : num(c.usage_kwh_per_m2, 2)}</td>
                          <td className="py-2 text-right">{c.cost_p_per_m2 == null ? "—" : num(c.cost_p_per_m2, 2)}</td>
                          <td className="py-2 text-right">{c.co2_kg_per_m2 == null ? "—" : num(c.co2_kg_per_m2, 2)}</td>
                          <td className="py-2 text-right">{num((c.total_cost_p ?? 0) / 100, 2)}</td>
                          <td className={cn("py-2 text-right", nightShare > NIGHT_FLAG_THRESHOLD ? "font-medium text-amber-600" : "")}>
                            {num(nightShare, 1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
  label, col, sortKey, sortDir, onSort, align = "right",
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
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function Kpi({
  label, value, sub, icon: Icon, badge,
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
            <span className={cn("flex items-center gap-1 font-medium", badge.good ? "text-emerald-600" : "text-red-600")}>
              {badge.good ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {badge.text}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}