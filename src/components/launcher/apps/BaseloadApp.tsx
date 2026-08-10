import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Droplet, Flame,
  Gauge, HelpCircle, PauseCircle, Trophy, Zap,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Building, ConsumptionRow } from "@/lib/data-store";
import { useBuildings, useConsumptionIndex, useDataStore, useOrganisations } from "@/lib/data-store";
import { checkCompleteness, utilityKind, type CompletenessResult } from "@/lib/energy/completeness";
import {
  estimateCo2Kg, estimateCostGbp, orgCo2Factor, orgTariff, unitLabel,
} from "@/lib/energy/league";
import { inheritanceLabel, PROFILE_LABEL, resolveProfile, type ResolvedProfile } from "@/lib/energy/profile";
import {
  computeAvgDayProfile, computeBaseloadScore, FLOOR_PERCENTILE, WASTE_MULTIPLIER, type ScoreResult,
} from "@/lib/energy/scoring";
import { useLauncher } from "@/lib/launcher-context";
import { cn } from "@/lib/utils";

type Kind = "electricity" | "gas" | "water";
type WindowDays = 7 | 30 | 90 | 365;
type SortKey =
  | "rank" | "name" | "score" | "waste" | "cost" | "co2" | "ooh" | "floor" | "events" | "coverage";
type Dir = "asc" | "desc";

const KIND_META: Record<Kind, { label: string; icon: typeof Zap; color: string; chart: string }> = {
  electricity: { label: "Electricity", icon: Zap, color: "text-violet-500", chart: "#8b5cf6" },
  gas: { label: "Gas", icon: Flame, color: "text-orange-500", chart: "#f97316" },
  water: { label: "Water", icon: Droplet, color: "text-blue-500", chart: "#3b82f6" },
};

const WINDOW_LABEL: Record<WindowDays, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
  365: "Last 12 months",
};

interface LeagueRow {
  building: Building;
  profile: ResolvedProfile;
  rows: ConsumptionRow[];
  completeness: CompletenessResult;
  score: ScoreResult;
  wasteCostGbp: number;
  wasteCo2Kg: number;
  oohSharePct: number;
  floorKw: number;
  activeAvgKw: number;
  coveragePct: number;
}

interface PausedRow {
  building: Building;
  completeness: CompletenessResult;
}

export function BaseloadApp() {
  const { org } = useLauncher();
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);
  const { state } = useDataStore();
  const index = useConsumptionIndex(org.id);
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("waste");
  const [dir, setDir] = useState<Dir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const orgRecord = organisations.find((o) => o.id === org.id);

  const availableKinds = useMemo(() => {
    const set = new Set<Kind>();
    for (const r of index.rows) {
      const k = utilityKind(r.variable_category);
      if (k !== "other") set.add(k);
    }
    return (["electricity", "gas", "water"] as Kind[]).filter((k) => set.has(k));
  }, [index]);

  const [kind, setKind] = useState<Kind>("electricity");
  const activeKind: Kind = availableKinds.includes(kind) ? kind : (availableKinds[0] ?? "electricity");

  const { startISO, endISO, start, end } = useMemo(() => {
    const last = index.maxDate ?? new Date().toISOString().slice(0, 10);
    const [y, m, d] = last.split("-").map(Number);
    const e = new Date(Date.UTC(y, m - 1, d));
    const s = new Date(e);
    s.setUTCDate(s.getUTCDate() - (windowDays - 1));
    return { start: s, end: e, startISO: s.toISOString().slice(0, 10), endISO: e.toISOString().slice(0, 10) };
  }, [index, windowDays]);

  const tariff = orgTariff(orgRecord, activeKind);
  const co2Factor = orgCo2Factor(orgRecord, activeKind);

  const { scored, paused } = useMemo(() => {
    const schedulesByBuilding = new Map<string, typeof state.schedules>();
    for (const s of state.schedules) {
      const list = schedulesByBuilding.get(s.building_id);
      if (list) list.push(s);
      else schedulesByBuilding.set(s.building_id, [s]);
    }
    const ok: LeagueRow[] = [];
    const bad: PausedRow[] = [];
    for (const b of buildings) {
      const profile = resolveProfile(orgRecord, b, schedulesByBuilding.get(b.id) ?? []);
      const rows = (index.byBuilding.get(b.id) ?? []).filter(
        (r) => utilityKind(r.variable_category) === activeKind,
      );
      if (rows.length === 0) continue;
      const completeness = checkCompleteness(rows, activeKind, start, end, orgRecord, profile);
      if (completeness.status !== "ok") {
        bad.push({ building: b, completeness });
        continue;
      }
      const score = computeBaseloadScore(rows, profile, startISO, endISO);
      const total = score.oohEnergy + score.activeEnergy;
      ok.push({
        building: b,
        profile,
        rows,
        completeness,
        score,
        wasteCostGbp: estimateCostGbp(score.idleWaste, tariff),
        wasteCo2Kg: estimateCo2Kg(score.idleWaste, co2Factor),
        oohSharePct: total > 0 ? (score.oohEnergy / total) * 100 : 0,
        floorKw: score.floor * 2,
        activeAvgKw: score.activeSlotCount > 0 ? score.activeEnergy / (score.activeSlotCount / 2) : 0,
        coveragePct: completeness.expectedSlots > 0
          ? Math.min(100, (completeness.presentSlots / completeness.expectedSlots) * 100)
          : 0,
      });
    }
    return { scored: ok, paused: bad };
  }, [buildings, index, state.schedules, orgRecord, activeKind, start, end, startISO, endISO, tariff, co2Factor]);

  // Rank = worst first on idle waste
  const ranked = useMemo(() => {
    const byWaste = [...scored].sort((a, b) => b.score.idleWaste - a.score.idleWaste);
    return byWaste.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [scored]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? ranked.filter((r) => r.building.custom_display_name.toLowerCase().includes(q))
      : ranked;
    const mul = dir === "asc" ? 1 : -1;
    const sorters: Record<SortKey, (a: typeof list[number], b: typeof list[number]) => number> = {
      rank: (a, b) => (a.rank - b.rank) * mul,
      name: (a, b) => a.building.custom_display_name.localeCompare(b.building.custom_display_name) * mul,
      score: (a, b) => (a.score.score - b.score.score) * mul,
      waste: (a, b) => (a.score.idleWaste - b.score.idleWaste) * mul,
      cost: (a, b) => (a.wasteCostGbp - b.wasteCostGbp) * mul,
      co2: (a, b) => (a.wasteCo2Kg - b.wasteCo2Kg) * mul,
      ooh: (a, b) => (a.oohSharePct - b.oohSharePct) * mul,
      floor: (a, b) => (a.floorKw - b.floorKw) * mul,
      events: (a, b) => (a.score.anomalyCount - b.score.anomalyCount) * mul,
      coverage: (a, b) => (a.coveragePct - b.coveragePct) * mul,
    };
    return [...list].sort(sorters[sortKey]);
  }, [ranked, search, sortKey, dir]);

  const totals = useMemo(() => {
    const waste = ranked.reduce((a, r) => a + r.score.idleWaste, 0);
    const cost = ranked.reduce((a, r) => a + r.wasteCostGbp, 0);
    const avg = ranked.length ? ranked.reduce((a, r) => a + r.score.score, 0) / ranked.length : 0;
    const best = ranked.reduce<typeof ranked[number] | null>(
      (b, r) => (!b || r.score.score > b.score.score ? r : b), null);
    const worst = ranked.reduce<typeof ranked[number] | null>(
      (b, r) => (!b || r.score.score < b.score.score ? r : b), null);
    const annualised = windowDays > 0 ? (cost / windowDays) * 365 : 0;
    return { waste, cost, avg, best, worst, annualised };
  }, [ranked, windowDays]);

  const unit = unitLabel(activeKind === "water" ? "water" : "electricity");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir(k === "name" ? "asc" : "desc"); }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10">
              <Gauge className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Baseload League</h1>
              <p className="text-sm text-muted-foreground">
                Which sites waste the most energy when they should be closed — {org.name},{" "}
                {startISO} to {endISO}.
              </p>
            </div>
          </div>
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as WindowDays)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {([7, 30, 90, 365] as WindowDays[]).map((w) => (
                <SelectItem key={w} value={String(w)}>{WINDOW_LABEL[w]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </header>

        <Collapsible open={howOpen} onOpenChange={setHowOpen}>
          <Card className="border-dashed">
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <HelpCircle className="h-4 w-4 text-primary" /> How this score works
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", howOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">1. Split the day.</span> Every half-hour
                  reading is either <em>active hours</em> (from the building's schedule, or the
                  organisation profile if it has no override) or <em>out-of-hours baseload</em>.
                </p>
                <p>
                  <span className="font-medium text-foreground">2. Find the realistic floor.</span> The
                  P{FLOOR_PERCENTILE} of all out-of-hours readings is what the site genuinely needs
                  overnight (alarms, fridges, comms).
                </p>
                <p>
                  <span className="font-medium text-foreground">3. Count the waste.</span> Any
                  out-of-hours half hour above {WASTE_MULTIPLIER}× that floor is a waste event, and the
                  energy above the threshold is idle waste.
                </p>
                <p>
                  <span className="font-medium text-foreground">4. Score it.</span> Score = the share of
                  out-of-hours energy that is <em>not</em> waste, 0–100. 100 means the site sits flat at
                  its floor overnight; a low score means plant is left running.
                </p>
                <p>
                  Sites with missing, flatlined or offline data are excluded from ranking and listed
                  separately below — a bad feed would otherwise look like a bad building.
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {availableKinds.length > 1 && (
          <Tabs value={activeKind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList>
              {availableKinds.map((k) => {
                const Icon = KIND_META[k].icon;
                return (
                  <TabsTrigger key={k} value={k} className="gap-1.5">
                    <Icon className={cn("h-3.5 w-3.5", KIND_META[k].color)} /> {KIND_META[k].label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Idle waste"
            value={`${fmt(totals.waste)} ${unit}`}
            sub={`Above the overnight floor across ${ranked.length} site(s)`}
          />
          <SummaryCard
            title="Wasted cost"
            value={`£${fmt(totals.cost)}`}
            sub={`≈ £${fmt(totals.annualised)} / year at this rate`}
          />
          <SummaryCard
            title="Portfolio avg score"
            value={totals.avg.toFixed(0)}
            sub={totals.best && totals.worst
              ? `Best ${totals.best.building.custom_display_name} · Worst ${totals.worst.building.custom_display_name}`
              : "No sites scored"}
          />
          <SummaryCard
            title="Scoring paused"
            value={String(paused.length)}
            sub="Sites excluded for data quality"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Trophy className="h-4 w-4 text-amber-500" /> Ranked worst to best on idle waste
              </div>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sites…"
                className="h-8 w-56"
              />
            </div>

            {visible.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No scoreable {KIND_META[activeKind].label.toLowerCase()} data for {org.name} in this window.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                      <Th onClick={() => toggleSort("rank")} active={sortKey === "rank"} dir={dir} className="w-14">#</Th>
                      <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={dir} align="left">Site</Th>
                      <Th onClick={() => toggleSort("score")} active={sortKey === "score"} dir={dir}>Score</Th>
                      <Th onClick={() => toggleSort("waste")} active={sortKey === "waste"} dir={dir}>Idle waste ({unit})</Th>
                      <Th onClick={() => toggleSort("cost")} active={sortKey === "cost"} dir={dir}>Cost (£)</Th>
                      <Th onClick={() => toggleSort("co2")} active={sortKey === "co2"} dir={dir}>CO₂e (kg)</Th>
                      <Th onClick={() => toggleSort("ooh")} active={sortKey === "ooh"} dir={dir}>Out of hours</Th>
                      <Th onClick={() => toggleSort("floor")} active={sortKey === "floor"} dir={dir}>Floor / active</Th>
                      <Th onClick={() => toggleSort("events")} active={sortKey === "events"} dir={dir}>Events</Th>
                      <Th onClick={() => toggleSort("coverage")} active={sortKey === "coverage"} dir={dir}>Coverage</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const open = expanded === r.building.id;
                      return (
                        <Fragment key={r.building.id}>
                          <tr
                            onClick={() => setExpanded(open ? null : r.building.id)}
                            className="cursor-pointer border-b transition-colors hover:bg-muted/40"
                          >
                            <td className="p-3 text-center text-xs font-semibold text-muted-foreground">{r.rank}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 font-medium">
                                {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                {r.building.custom_display_name}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="mt-0.5 pl-5 text-[11px] text-muted-foreground">
                                    Active {r.profile.activeFrom.slice(0, 5)}–{r.profile.activeTo.slice(0, 5)} ·{" "}
                                    {r.score.seasonMode === "peak" ? "Peak season" : "Off-peak"}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                  {inheritanceLabel(r.profile.source, r.profile.profileType)} —{" "}
                                  {PROFILE_LABEL[r.profile.profileType]}. Waste threshold{" "}
                                  {r.score.threshold.toFixed(2)} {unit} per half hour.
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="p-3">
                              <div className={cn("text-lg font-semibold tabular-nums", scoreColor(r.score.score))}>
                                {r.score.score.toFixed(0)}
                              </div>
                              <Progress value={r.score.score} className="mt-1 h-1" />
                            </td>
                            <td className="p-3 text-right tabular-nums font-medium">{fmt(r.score.idleWaste)}</td>
                            <td className="p-3 text-right tabular-nums">£{fmt(r.wasteCostGbp)}</td>
                            <td className="p-3 text-right tabular-nums">{fmt(r.wasteCo2Kg)}</td>
                            <td className="p-3 text-right tabular-nums">{r.oohSharePct.toFixed(0)}%</td>
                            <td className="p-3 text-right tabular-nums text-xs">
                              {r.floorKw.toFixed(1)} / {r.activeAvgKw.toFixed(1)} kW
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.score.anomalyCount}</td>
                            <td className="p-3 text-right tabular-nums text-xs">{r.coveragePct.toFixed(0)}%</td>
                          </tr>
                          {open && (
                            <tr className="border-b bg-muted/20">
                              <td colSpan={10} className="p-4">
                                <RowDetail row={r} startISO={startISO} endISO={endISO} unit={unit} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {paused.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <PauseCircle className="h-4 w-4 text-amber-500" /> Scoring paused — data quality
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {paused.map((p) => (
                  <div
                    key={p.building.id}
                    className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3"
                  >
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      {p.building.custom_display_name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {p.completeness.status === "telemetry_offline" ? "Meter inactive / telemetry offline" : "Data incomplete"}
                      {p.completeness.reason ? ` — ${p.completeness.reason}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

function RowDetail({
  row, startISO, endISO, unit,
}: { row: LeagueRow & { rank: number }; startISO: string; endISO: string; unit: string }) {
  const avgDay = useMemo(
    () => computeAvgDayProfile(row.rows, row.profile, startISO, endISO),
    [row.rows, row.profile, startISO, endISO],
  );
  const data = avgDay.map((s) => ({
    label: slotLabel(s.slot),
    avg: s.avgKwh,
    baseload: s.baseloadShare > 0.5 ? s.avgKwh : 0,
  }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Average day — shaded bars are out-of-hours, line is the waste threshold
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={5} />
              <YAxis tick={{ fontSize: 10 }} width={44} />
              <RTooltip
                formatter={(v: number) => `${v.toFixed(2)} ${unit}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Area type="monotone" dataKey="avg" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} />
              <Bar dataKey="baseload" fill="#f59e0b" fillOpacity={0.55} />
              <ReferenceLine y={row.score.threshold} stroke="#ef4444" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Overnight floor {row.score.floor.toFixed(2)} {unit}/half hour ({row.floorKw.toFixed(1)} kW) ·
          waste threshold {row.score.threshold.toFixed(2)} {unit} · out-of-hours energy{" "}
          {fmt(row.score.oohEnergy)} {unit} of which {fmt(row.score.idleWaste)} {unit} is waste.
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Biggest waste events
          </div>
          {row.score.anomalies.length === 0 ? (
            <div className="text-xs text-muted-foreground">No out-of-hours excess detected.</div>
          ) : (
            <div className="space-y-1">
              {row.score.anomalies.slice(0, 6).map((a) => (
                <div key={`${a.date}-${a.slot}`} className="flex items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">{a.date} · {slotLabel(a.slot)}</span>
                  <span className="tabular-nums font-medium">+{a.excess.toFixed(2)} {unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Why this score</div>
          <Badge variant="outline" className="mb-2 text-[10px]">
            {inheritanceLabel(row.profile.source, row.profile.profileType)}
          </Badge>
          <div>
            Active {row.profile.activeFrom.slice(0, 5)}–{row.profile.activeTo.slice(0, 5)} on{" "}
            {row.profile.activeDays.map(dayName).join(", ") || "no days"}. Season{" "}
            {row.score.seasonMode === "peak" ? "peak" : "off-peak"}. Coverage{" "}
            {row.coveragePct.toFixed(0)}% ({row.completeness.presentSlots.toLocaleString()} of{" "}
            {row.completeness.expectedSlots.toLocaleString()} intervals).
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-5">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Th({
  children, onClick, active, dir, align = "right", className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: Dir;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th className={cn("p-3 font-medium", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className={cn(
          "h-6 gap-1 px-1 text-xs font-medium uppercase tracking-wider",
          align === "right" && "ml-auto",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </Button>
    </th>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 });
}

function slotLabel(slot: number): string {
  const h = Math.floor(slot / 2);
  const m = slot % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayName(d: number): string { return DAY_NAMES[d] ?? String(d); }
