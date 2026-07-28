import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, Droplet, PoundSterling, Settings2, ShieldCheck,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBuildings, useConsumption, useDataStore, useMeterRegistry, useOrganisations } from "@/lib/data-store";
import {
  analyseMeter, buildWaterMeterInputs, defaultSettings, meterIntervalSeries,
  STATUS_LABEL, type LeakStatus, type MeterLeakResult, type SentinelSettings,
} from "@/lib/energy/water-sentinel";
import { orgCo2Factor } from "@/lib/energy/league";
import { useLauncher } from "@/lib/launcher-context";
import {
  loadWaterSentinel, saveWaterSentinelSettings, setLeakAcknowledgement, type LeakAckRow,
} from "@/lib/water-sentinel.functions";
import { cn } from "@/lib/utils";

type Filter = "all" | "leaks" | "high";
type SortKey = "building" | "minFlow" | "volume" | "cost" | "status";

const WINDOW_DAYS_OPTIONS = [7, 14, 30, 60, 90];

function statusBadge(status: LeakStatus) {
  if (status === "critical")
    return <Badge className="border-red-500/30 bg-red-500/15 text-red-600" variant="outline">{STATUS_LABEL.critical}</Badge>;
  if (status === "minor")
    return <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700" variant="outline">{STATUS_LABEL.minor}</Badge>;
  if (status === "incomplete")
    return <Badge variant="outline" className="text-muted-foreground">{STATUS_LABEL.incomplete}</Badge>;
  return <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700" variant="outline">{STATUS_LABEL.normal}</Badge>;
}

export function WaterSentinelApp() {
  const { org, persona } = useLauncher();
  const canEdit = persona.role === "super_admin" || persona.role === "admin";
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);
  const { consumption } = useConsumption();
  const { state } = useDataStore();
  const registry = useMeterRegistry(org.id);
  const orgFull = organisations.find((o) => o.id === org.id);

  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("minFlow");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [selectedMeter, setSelectedMeter] = useState<string | null>(null);
  const [chartDays, setChartDays] = useState(2);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ackTarget, setAckTarget] = useState<MeterLeakResult | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [acks, setAcks] = useState<LeakAckRow[]>([]);
  const [settings, setSettings] = useState<SentinelSettings>(() => defaultSettings(orgFull));
  const [draft, setDraft] = useState<SentinelSettings>(settings);
  const [saving, setSaving] = useState(false);

  // Load persisted settings + acknowledgements for the selected organisation.
  useEffect(() => {
    let cancelled = false;
    if (!org.id || org.id === "none") return;
    loadWaterSentinel({ data: { orgId: org.id } })
      .then((bundle) => {
        if (cancelled) return;
        const base = defaultSettings(orgFull);
        const next: SentinelSettings = bundle.settings
          ? {
              windowStart: bundle.settings.window_start,
              windowEnd: bundle.settings.window_end,
              sensitivityM3: Number(bundle.settings.sensitivity_m3),
              consecutiveIntervals: Number(bundle.settings.consecutive_intervals),
              waterPencePerM3: base.waterPencePerM3,
              wastewaterPencePerM3: Number(bundle.settings.wastewater_pence_per_m3),
            }
          : base;
        setSettings(next);
        setDraft(next);
        setAcks(bundle.acks);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load water sentinel settings");
      });
    return () => { cancelled = true; };
  }, [org.id, orgFull]);

  const meterInputs = useMemo(
    () => buildWaterMeterInputs({
      orgId: org.id,
      consumption,
      buildings,
      schedules: state.schedules,
      org: orgFull,
      registry,
    }),
    [org.id, consumption, buildings, state.schedules, orgFull, registry],
  );

  // Anchor to the latest water interval date so results never shift by timezone.
  const endISO = useMemo(() => {
    let latest = "";
    for (const m of meterInputs) {
      for (const r of m.rows) if (r.interval_date > latest) latest = r.interval_date;
    }
    return latest || new Date().toISOString().slice(0, 10);
  }, [meterInputs]);

  const startISO = useMemo(() => {
    const [y, m, d] = endISO.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - (days - 1));
    return dt.toISOString().slice(0, 10);
  }, [endISO, days]);

  const co2 = orgCo2Factor(orgFull, "water");

  const results = useMemo(
    () => meterInputs.map((m) => analyseMeter(m, settings, startISO, endISO, co2)),
    [meterInputs, settings, startISO, endISO, co2],
  );

  const ackByMeter = useMemo(
    () => new Map(acks.map((a) => [a.raw_meter_name, a] as const)),
    [acks],
  );

  const kpis = useMemo(() => {
    const leaking = results.filter((r) => r.status === "critical" || r.status === "minor");
    const critical = results.filter((r) => r.status === "critical").length;
    return {
      leakCount: leaking.length,
      critical,
      lostM3: leaking.reduce((s, r) => s + r.totalLeakVolumeM3, 0),
      perNightM3: leaking.reduce((s, r) => s + r.leakVolumePerNightM3, 0),
      costTotal: leaking.reduce((s, r) => s + r.totalCostGbp, 0),
      costPerNight: leaking.reduce((s, r) => s + r.costPerNightGbp, 0),
      costPerMonth: leaking.reduce((s, r) => s + r.costPerMonthGbp, 0),
      incomplete: results.filter((r) => r.status === "incomplete").length,
    };
  }, [results]);

  const filtered = useMemo(() => {
    let list = results;
    if (filter === "leaks") list = list.filter((r) => r.status === "critical" || r.status === "minor");
    if (filter === "high") list = list.filter((r) => r.minFlowM3PerHour > 1);
    const rank: Record<LeakStatus, number> = { critical: 3, minor: 2, normal: 1, incomplete: 0 };
    const sorted = [...list].sort((a, b) => {
      let d = 0;
      if (sortKey === "building") d = a.buildingName.localeCompare(b.buildingName);
      else if (sortKey === "minFlow") d = a.minFlowM3PerHour - b.minFlowM3PerHour;
      else if (sortKey === "volume") d = a.totalNightVolumeM3 - b.totalNightVolumeM3;
      else if (sortKey === "cost") d = a.totalCostGbp - b.totalCostGbp;
      else d = rank[a.status] - rank[b.status];
      return dir === "asc" ? d : -d;
    });
    return sorted;
  }, [results, filter, sortKey, dir]);

  const chartMeterName = selectedMeter;
  const chartInput = meterInputs.find((m) => m.rawMeterName === chartMeterName);
  const chartResult = results.find((r) => r.rawMeterName === chartMeterName);
  const baseline = chartResult?.minFlowM3PerHour ? chartResult.minFlowM3PerHour / 2 : 0;

  const chartData = useMemo(() => {
    if (!chartInput) return [];
    return meterIntervalSeries(chartInput, settings, endISO, chartDays, baseline);
  }, [chartInput, settings, endISO, chartDays, baseline]);

  // Contiguous unoccupied blocks, rendered as translucent shaded bands.
  const overnightBands = useMemo(() => {
    const bands: Array<{ x1: string; x2: string }> = [];
    let startLabel: string | null = null;
    let prevLabel: string | null = null;
    for (const p of chartData) {
      if (p.overnight) {
        if (startLabel == null) startLabel = p.label;
        prevLabel = p.label;
      } else if (startLabel != null && prevLabel != null) {
        bands.push({ x1: startLabel, x2: prevLabel });
        startLabel = null;
        prevLabel = null;
      }
    }
    if (startLabel != null && prevLabel != null) bands.push({ x1: startLabel, x2: prevLabel });
    return bands;
  }, [chartData]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDir("desc"); }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await saveWaterSentinelSettings({
        data: {
          orgId: org.id,
          windowStart: draft.windowStart,
          windowEnd: draft.windowEnd,
          sensitivityM3: draft.sensitivityM3,
          consecutiveIntervals: draft.consecutiveIntervals,
          wastewaterPencePerM3: draft.wastewaterPencePerM3,
          waterPencePerM3: draft.waterPencePerM3,
        },
      });
      setSettings(draft);
      setSettingsOpen(false);
      toast.success("Detection settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function submitAck(status: "acknowledged" | "dismissed" | "open") {
    if (!ackTarget) return;
    try {
      const rows = await setLeakAcknowledgement({
        data: {
          orgId: org.id,
          rawMeterName: ackTarget.rawMeterName,
          status,
          note: ackNote,
          periodStart: startISO,
          periodEnd: endISO,
        },
      });
      setAcks(rows);
      setAckTarget(null);
      setAckNote("");
      toast.success(status === "open" ? "Alert reopened" : `Alert ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update alert");
    }
  }

  if (meterInputs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          No water meters found for {org.name}. Upload half-hourly water data in Settings › Data Update.
        </CardContent>
      </Card>
    );
  }

  const tariffTotal = settings.waterPencePerM3 + settings.wastewaterPencePerM3;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Droplet className="h-5 w-5 text-blue-500" /> Overnight Water Sentinel
          </h1>
          <p className="text-xs text-muted-foreground">
            {meterInputs.length} water meters · unoccupied window {settings.windowStart}–{settings.windowEnd} ·
            {" "}£{(tariffTotal / 100).toFixed(2)}/m³ combined supply + wastewater · {startISO} → {endISO}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOW_DAYS_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>Last {d} nights</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setDraft(settings); setSettingsOpen(true); }}>
              <Settings2 className="h-4 w-4" /> Detection settings
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Active leaks detected</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-3xl font-semibold">{kpis.leakCount}</div>
            {kpis.critical > 0 ? (
              <Badge className="border-red-500/30 bg-red-500/15 text-red-600" variant="outline">
                <AlertTriangle className="mr-1 h-3 w-3" />{kpis.critical} critical
              </Badge>
            ) : kpis.leakCount > 0 ? (
              <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700" variant="outline">Amber</Badge>
            ) : (
              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700" variant="outline">
                <ShieldCheck className="mr-1 h-3 w-3" />All clear
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {kpis.incomplete} meter(s) excluded — data incomplete
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Estimated overnight water lost</div>
          <div className="mt-1 text-3xl font-semibold">{kpis.lostM3.toFixed(1)} m³</div>
          <div className="mt-1 text-xs text-muted-foreground">{kpis.perNightM3.toFixed(2)} m³ per night</div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
            <PoundSterling className="h-3.5 w-3.5" /> Total financial impact
          </div>
          <div className="mt-1 text-3xl font-semibold">£{kpis.costTotal.toFixed(0)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            £{kpis.costPerNight.toFixed(2)}/night · £{kpis.costPerMonth.toFixed(0)}/month
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              Half-hourly flow — {chartResult?.displayName ?? "—"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                shaded = unoccupied window · dashed red = minimum overnight baseline
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={chartMeterName ?? ""} onValueChange={setSelectedMeter}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select meter" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {results.map((r) => (
                    <SelectItem key={r.rawMeterName} value={r.rawMeterName}>
                      {r.buildingName} — {r.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(chartDays)} onValueChange={(v) => setChartDays(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">24 hours</SelectItem>
                  <SelectItem value="2">48 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap={0}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={7} />
                <YAxis tick={{ fontSize: 11 }} unit=" m³" width={70} />
                <RTooltip formatter={(v: number) => `${Number(v).toFixed(3)} m³`} />
                {overnightBands.map((b) => (
                  <ReferenceArea key={b.x1} x1={b.x1} x2={b.x2} fill="#475569" fillOpacity={0.18} />
                ))}
                <Bar dataKey="value" fill="#3b82f6" isAnimationActive={false} />
                <Bar dataKey="aboveBaseline" fill="#ef4444" isAnimationActive={false} />
                {baseline > 0 && (
                  <ReferenceLine y={baseline} stroke="#ef4444" strokeDasharray="5 4" />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3b82f6]" /> Usage
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#ef4444]" /> Overnight above baseline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-500/25" /> Unoccupied window
            </span>
            {chartResult && (
              <span>Baseline leak rate {chartResult.minFlowM3PerHour.toFixed(3)} m³/hr</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Water leak audit</div>
            <div className="flex gap-1.5">
              {([["all", "All Sites"], ["leaks", "Active Leaks Only"], ["high", "High Waste (>1 m³/hr)"]] as const).map(
                ([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filter === key ? "default" : "outline"}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </Button>
                ),
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  {([
                    ["building", "Site / Building"],
                    ["minFlow", "Min Overnight Flow (m³/hr)"],
                    ["volume", "Total Night Volume (m³)"],
                    ["status", "Status"],
                    ["cost", "Estimated Cost Waste (£)"],
                  ] as const).map(([key, label]) => (
                    <th key={key} className="cursor-pointer px-2 py-2 text-left" onClick={() => toggleSort(key)}>
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {sortKey === key && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left">Action Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const ack = ackByMeter.get(r.rawMeterName);
                  return (
                    <tr
                      key={r.rawMeterName}
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/40",
                        chartMeterName === r.rawMeterName && "bg-muted/50",
                      )}
                    >
                      <td className="cursor-pointer px-2 py-2" onClick={() => setSelectedMeter(r.rawMeterName)}>
                        <div className="font-medium">{r.buildingName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.displayName}</div>
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.status === "incomplete" ? "—" : r.minFlowM3PerHour.toFixed(3)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{r.totalNightVolumeM3.toFixed(2)}</td>
                      <td className="px-2 py-2">{statusBadge(r.status)}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {r.totalCostGbp > 0 ? `£${r.totalCostGbp.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {ack ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                              <Check className="mr-1 h-3 w-3" />{ack.status}
                            </Badge>
                            {canEdit && (
                              <Button size="sm" variant="ghost" onClick={() => { setAckTarget(r); setAckNote(ack.note ?? ""); }}>
                                Edit
                              </Button>
                            )}
                          </div>
                        ) : canEdit && (r.status === "critical" || r.status === "minor") ? (
                          <Button size="sm" variant="outline" onClick={() => { setAckTarget(r); setAckNote(""); }}>
                            Acknowledge / Dismiss
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Open</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">No meters match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detection settings</DialogTitle>
            <DialogDescription>Applies to all water meters in {org.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Window start</Label>
              <Input type="time" value={draft.windowStart} onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Window end</Label>
              <Input type="time" value={draft.windowEnd} onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum flow sensitivity (m³ per interval)</Label>
              <Input type="number" step="0.01" value={draft.sensitivityM3}
                onChange={(e) => setDraft({ ...draft, sensitivityM3: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Consecutive intervals to trigger</Label>
              <Input type="number" min={1} max={48} value={draft.consecutiveIntervals}
                onChange={(e) => setDraft({ ...draft, consecutiveIntervals: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Water tariff (£/m³)</Label>
              <Input type="number" step="0.01" value={(draft.waterPencePerM3 / 100).toFixed(2)}
                onChange={(e) => setDraft({ ...draft, waterPencePerM3: Number(e.target.value) * 100 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Wastewater discharge (£/m³)</Label>
              <Input type="number" step="0.01" value={(draft.wastewaterPencePerM3 / 100).toFixed(2)}
                onChange={(e) => setDraft({ ...draft, wastewaterPencePerM3: Number(e.target.value) * 100 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ackTarget} onOpenChange={(o) => { if (!o) setAckTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leak alert — {ackTarget?.displayName}</DialogTitle>
            <DialogDescription>
              {ackTarget?.buildingName} · {ackTarget ? STATUS_LABEL[ackTarget.status] : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={4}
              placeholder="e.g. Maintenance team notified for toilet valve repair"
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            {ackTarget && ackByMeter.has(ackTarget.rawMeterName) && (
              <Button variant="ghost" onClick={() => submitAck("open")}>Reopen</Button>
            )}
            <Button variant="outline" onClick={() => submitAck("dismissed")}>Dismiss</Button>
            <Button onClick={() => submitAck("acknowledged")}>Acknowledge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}