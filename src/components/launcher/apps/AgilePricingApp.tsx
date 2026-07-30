import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRightLeft, ChevronLeft, ChevronRight, Clock, Gauge, RefreshCw, Sparkles,
  TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBuildings, useConsumption, useMeterRegistry, useOrganisations } from "@/lib/data-store";
import { DEFAULT_TARIFF, orgTariff } from "@/lib/energy/league";
import {
  bestWindow, buildElectricityLoad, buildSeries, costFlat, costLoad, dayStats, fmtGbp, fmtPence,
  GSP_REGIONS, HALF_HOUR_MS, priceAt, priceBand, PRODUCTS, regionName, shiftAdvice, slotsForWindow,
  ukDateLabel, ukMidnight, ukTimeLabel, weekdayProfile, type ProductKey, type RateSeries,
  type UnitRate,
} from "@/lib/energy/pricing";
import { useLauncher } from "@/lib/launcher-context";
import { getUnitRates, syncPricesNow } from "@/lib/pricing.functions";
import { cn } from "@/lib/utils";

const PERIOD_DAYS = [7, 14, 30, 60, 90];

const BAND_FILL: Record<string, string> = {
  plunge: "hsl(160 84% 39%)",
  cheap: "hsl(142 71% 45%)",
  mid: "hsl(38 92% 50%)",
  expensive: "hsl(0 72% 51%)",
};

function KpiCard(props: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "bad";
}) {
  const Icon = props.icon;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted",
          props.tone === "good" && "bg-emerald-500/15 text-emerald-600",
          props.tone === "bad" && "bg-red-500/15 text-red-600",
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{props.label}</div>
          <div className="truncate text-xl font-semibold">{props.value}</div>
          {props.sub ? <div className="text-xs text-muted-foreground">{props.sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function AgilePricingApp() {
  const { org, persona } = useLauncher();
  const canEdit = persona.role === "super_admin" || persona.role === "admin";
  const { organisations, updateOrganisation } = useOrganisations();
  const { buildings, updateBuilding } = useBuildings(org.id);
  const { consumption } = useConsumption();
  const registry = useMeterRegistry(org.id);
  const orgFull = organisations.find((o) => o.id === org.id);

  const [days, setDays] = useState(30);
  const [buildingId, setBuildingId] = useState<string>("all");
  const [rates, setRates] = useState<UnitRate[]>([]);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [shiftPct, setShiftPct] = useState(orgFull?.shiftable_load_pct ?? 20);
  const [now, setNow] = useState(() => Date.now());
  const [dayOffset, setDayOffset] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setShiftPct(orgFull?.shiftable_load_pct ?? 20);
  }, [orgFull?.shiftable_load_pct]);

  const orgRegion = orgFull?.default_gsp_region_code ?? null;
  const selectedBuilding = buildings.find((b) => b.id === buildingId);
  const activeRegion = selectedBuilding?.gsp_region_code || orgRegion || "C";

  const regionsInUse = useMemo(() => {
    const s = new Set<string>();
    if (orgRegion) s.add(orgRegion);
    for (const b of buildings) if (b.gsp_region_code) s.add(b.gsp_region_code);
    if (s.size === 0) s.add("C");
    return Array.from(s);
  }, [buildings, orgRegion]);

  // Meter → building / factor from the registry (respects admin overrides).
  const meterMeta = useMemo(() => {
    const m = new Map<string, { buildingId: string | null; factor: number }>();
    for (const r of registry) {
      m.set(r.raw_meter_name, {
        buildingId: r.effective_building_id ?? null,
        factor: r.effective_meter_factor ?? 1,
      });
    }
    return m;
  }, [registry]);

  // Period anchored to the latest electricity interval so results never shift.
  const { fromISO, toISO } = useMemo(() => {
    let latest = "";
    for (const c of consumption) {
      if (c.organization_id !== org.id) continue;
      if (c.interval_date > latest) latest = c.interval_date;
    }
    const end = latest || new Date().toISOString().slice(0, 10);
    const [y, m, d] = end.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d - (days - 1)));
    return { fromISO: start.toISOString().slice(0, 10), toISO: end };
  }, [consumption, org.id, days]);

  // Fetch stored rates: the analysis period plus the live/day-ahead window.
  const curveFromISO = useMemo(() => {
    const viewISO = new Date(ukMidnight(Date.now(), dayOffset)).toISOString().slice(0, 10);
    return viewISO < fromISO ? viewISO : fromISO;
  }, [fromISO, dayOffset]);

  useEffect(() => {
    if (!org.id || org.id === "none") return;
    let cancelled = false;
    setLoading(true);
    const from = `${curveFromISO}T00:00:00Z`;
    const to = new Date(Date.now() + 3 * 86_400_000).toISOString();
    getUnitRates({
      data: {
        regions: regionsInUse,
        products: Object.values(PRODUCTS).map((p) => p.code),
        fromISO: from,
        toISO: to,
      },
    })
      .then((b) => {
        if (cancelled) return;
        setRates(b.rates);
        setLastSynced(b.lastSyncedAt);
      })
      .catch(() => { if (!cancelled) toast.error("Could not load Octopus prices"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [org.id, curveFromISO, regionsInUse]);

  const seriesFor = useMemo(() => {
    const cache = new Map<string, RateSeries>();
    return (product: ProductKey, region: string): RateSeries => {
      const key = `${product}|${region}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const code = PRODUCTS[product].code;
      const built = buildSeries(rates.filter((r) => r.product_code === code && r.region_code === region));
      cache.set(key, built);
      return built;
    };
  }, [rates]);

  const agile = seriesFor("agile", activeRegion);
  const outgoing = seriesFor("outgoing", activeRegion);

  // --- Live + day curve -----------------------------------------------------
  const todayStart = useMemo(() => ukMidnight(now), [now]);
  const tomorrowStart = todayStart + 24 * 3600_000;
  const todaySlots = useMemo(() => slotsForWindow(agile, todayStart, 24), [agile, todayStart]);
  const tomorrowSlots = useMemo(() => slotsForWindow(agile, tomorrowStart, 24), [agile, tomorrowStart]);
  const today = useMemo(() => dayStats(todaySlots), [todaySlots]);
  const tomorrow = useMemo(() => dayStats(tomorrowSlots), [tomorrowSlots]);

  // Day being charted (0 = today, negative = earlier days).
  const viewStart = useMemo(() => ukMidnight(now, dayOffset), [now, dayOffset]);
  const viewISO = useMemo(() => new Date(viewStart).toISOString().slice(0, 10), [viewStart]);
  const viewSlots = useMemo(() => slotsForWindow(agile, viewStart, 24), [agile, viewStart]);
  const viewStats = useMemo(() => dayStats(viewSlots), [viewSlots]);

  const slotNow = Math.floor(now / HALF_HOUR_MS) * HALF_HOUR_MS;
  const priceNow = priceAt(agile, slotNow);
  const priceNext = priceAt(agile, slotNow + HALF_HOUR_MS);
  const exportNow = priceAt(outgoing, slotNow);
  const minsToChange = Math.max(0, Math.ceil((slotNow + HALF_HOUR_MS - now) / 60000));
  const band = priceNow != null ? priceBand(priceNow, today) : "mid";

  // Typical consumption for the same weekday (last 4 matching days with data).
  const profile = useMemo(
    () => weekdayProfile({
      rows: consumption,
      orgId: org.id,
      targetISO: viewISO,
      buildingId,
      buildingIdFor: (name) => meterMeta.get(name)?.buildingId ?? null,
      factorFor: (name) => meterMeta.get(name)?.factor ?? 1,
    }),
    [consumption, org.id, viewISO, buildingId, meterMeta],
  );

  const showProfile = (profile.samples ?? 0) >= 3 && profile.bySlot != null;

  const curveData = useMemo(() => {
    const rows = dayOffset === 0
      ? [...viewSlots.map((s) => ({ ...s, next: false })), ...tomorrowSlots.map((s) => ({ ...s, next: true }))]
      : viewSlots.map((s) => ({ ...s, next: false }));
    return rows.map((s) => ({
      name: `${s.next ? "+" : ""}${s.label}`,
      price: Number(s.price.toFixed(3)),
      kwh: !s.next && showProfile && profile.bySlot
        ? Number(profile.bySlot[s.index].toFixed(3))
        : null,
      start: s.start,
      band: priceBand(s.price, s.next ? tomorrow : viewStats),
    }));
  }, [viewSlots, tomorrowSlots, viewStats, tomorrow, dayOffset, showProfile, profile]);

  // --- Cost overlay ---------------------------------------------------------
  const loads = useMemo(
    () => buildElectricityLoad({
      rows: consumption,
      buildings,
      orgId: org.id,
      orgDefaultRegion: orgRegion,
      fromISO,
      toISO,
      buildingIdFor: (name) => meterMeta.get(name)?.buildingId ?? null,
      factorFor: (name) => meterMeta.get(name)?.factor ?? 1,
    }),
    [consumption, buildings, org.id, orgRegion, fromISO, toISO, meterMeta],
  );

  const flatTariff = orgTariff(orgFull, "electricity") || DEFAULT_TARIFF.electricity;

  const perBuilding = useMemo(() => {
    return loads.map((l) => {
      const a = costLoad(l.slots, seriesFor("agile", l.region));
      const t = costLoad(l.slots, seriesFor("tracker", l.region));
      const f = costLoad(l.slots, seriesFor("flexible", l.region));
      const flat = costFlat(a.totalKwh, flatTariff);
      return {
        ...l,
        kwh: a.totalKwh,
        agilePence: a.costPence,
        trackerPence: t.costPence,
        flexPence: f.costPence,
        flatPence: flat,
        weightedRate: a.weightedRate,
        coverage: a.coveragePct,
        savingPence: flat - a.costPence,
        byDay: a.byDay,
      };
    }).sort((x, y) => y.kwh - x.kwh);
  }, [loads, seriesFor, flatTariff]);

  const visible = buildingId === "all" ? perBuilding : perBuilding.filter((b) => b.buildingId === buildingId);

  const totals = useMemo(() => {
    const t = visible.reduce(
      (a, b) => ({
        kwh: a.kwh + b.kwh,
        agile: a.agile + b.agilePence,
        tracker: a.tracker + b.trackerPence,
        flex: a.flex + b.flexPence,
        flat: a.flat + b.flatPence,
        costedKwh: a.costedKwh + (b.coverage / 100) * b.kwh,
      }),
      { kwh: 0, agile: 0, tracker: 0, flex: 0, flat: 0, costedKwh: 0 },
    );
    return { ...t, weightedRate: t.costedKwh > 0 ? t.agile / t.costedKwh : 0 };
  }, [visible]);

  const dailyCost = useMemo(() => {
    const map = new Map<string, { date: string; agile: number; flat: number }>();
    for (const b of visible) {
      for (const [date, v] of b.byDay) {
        const e = map.get(date) ?? { date, agile: 0, flat: 0 };
        e.agile += v.pence / 100;
        e.flat += (v.kwh * flatTariff) / 100;
        map.set(date, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [visible, flatTariff]);

  // --- Shift advisor --------------------------------------------------------
  const advice = useMemo(() => {
    const slots = visible.flatMap((b) => b.slots);
    if (slots.length === 0) return null;
    return shiftAdvice(slots, seriesFor("agile", activeRegion), { blockHours: 2, shiftablePct: shiftPct });
  }, [visible, seriesFor, activeRegion, shiftPct]);

  const tomorrowBest = useMemo(
    () => (tomorrowSlots.length ? bestWindow(tomorrowSlots, 3) : null),
    [tomorrowSlots],
  );
  const exportBest = useMemo(() => {
    const s = slotsForWindow(outgoing, todayStart, 48);
    return s.length ? bestWindow(s, 1, "expensive") : null;
  }, [outgoing, todayStart]);

  const solarLoads = useMemo(
    () => buildElectricityLoad({
      rows: consumption, buildings, orgId: org.id, orgDefaultRegion: orgRegion,
      fromISO, toISO, direction: "export",
      buildingIdFor: (name) => meterMeta.get(name)?.buildingId ?? null,
      factorFor: (name) => meterMeta.get(name)?.factor ?? 1,
    }),
    [consumption, buildings, org.id, orgRegion, fromISO, toISO, meterMeta],
  );
  const exportValue = useMemo(() => {
    let kwh = 0;
    let pence = 0;
    for (const l of solarLoads) {
      const r = costLoad(l.slots, seriesFor("outgoing", l.region));
      kwh += r.totalKwh;
      pence += r.costPence;
    }
    return { kwh, pence };
  }, [solarLoads, seriesFor]);

  async function handleSync() {
    setSyncing(true);
    const id = toast.loading("Fetching latest Octopus prices…");
    try {
      const res = await syncPricesNow({ data: { regions: regionsInUse, daysBack: Math.min(90, days) } });
      toast.success(`Synced ${res.rows.toLocaleString()} price points`, { id });
      if (res.failures.length) toast.warning(res.failures[0]);
      const b = await getUnitRates({
        data: {
          regions: regionsInUse,
          products: Object.values(PRODUCTS).map((p) => p.code),
          fromISO: `${fromISO}T00:00:00Z`,
          toISO: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        },
      });
      setRates(b.rates);
      setLastSynced(b.lastSyncedAt);
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setSyncing(false);
    }
  }

  const noRates = rates.length === 0 && !loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Zap className="h-5 w-5 text-amber-500" /> Agile Pricing & Shift Advisor
          </h1>
          <p className="text-sm text-muted-foreground">
            Live Octopus Agile rates for {regionName(activeRegion)} ({activeRegion}) — costed against your own
            half-hourly electricity.
            {lastSynced ? ` Last synced ${new Date(lastSynced).toLocaleString("en-GB")}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={buildingId} onValueChange={setBuildingId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.custom_display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_DAYS.map((d) => <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} /> Sync prices
            </Button>
          ) : null}
        </div>
      </div>

      {noRates ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Zap className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No Octopus prices stored yet for {regionName(activeRegion)}.
              {canEdit ? " Hit “Sync prices” to pull them now." : " An admin needs to run the first sync."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Live strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={cn(
          "border-2",
          band === "cheap" && "border-emerald-500/40",
          band === "plunge" && "border-emerald-600/60",
          band === "mid" && "border-amber-500/40",
          band === "expensive" && "border-red-500/40",
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Price now (inc VAT)</span>
              {priceNow != null && priceNow <= 0 ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700" variant="outline">
                  Plunge pricing
                </Badge>
              ) : priceNow != null && priceNow >= 90 ? (
                <Badge className="border-red-500/30 bg-red-500/15 text-red-600" variant="outline">Near cap</Badge>
              ) : null}
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {priceNow != null ? fmtPence(priceNow) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {priceNext != null ? `Next slot ${fmtPence(priceNext)} · changes in ${minsToChange} min` : "Next slot unknown"}
            </div>
          </CardContent>
        </Card>
        <KpiCard
          label="Today's cheapest slot"
          value={today.min ? fmtPence(today.min.price) : "—"}
          sub={today.min ? `at ${today.min.label}` : undefined}
          icon={TrendingDown}
          tone="good"
        />
        <KpiCard
          label="Today's peak slot"
          value={today.max ? fmtPence(today.max.price) : "—"}
          sub={today.max ? `at ${today.max.label} · spread ${fmtPence(today.spread)}` : undefined}
          icon={TrendingUp}
          tone="bad"
        />
        <KpiCard
          label="Export price now"
          value={exportNow != null ? fmtPence(exportNow) : "—"}
          sub={exportBest ? `Best export ${ukTimeLabel(exportBest.startMs)} @ ${fmtPence(exportBest.avgPrice)}` : "Agile Outgoing"}
          icon={Activity}
        />
      </div>

      <Tabs defaultValue="curve">
        <TabsList>
          <TabsTrigger value="curve">Day curve</TabsTrigger>
          <TabsTrigger value="cost">Your cost</TabsTrigger>
          <TabsTrigger value="shift">Shift advisor</TabsTrigger>
          <TabsTrigger value="compare">Tariff comparison</TabsTrigger>
          {canEdit ? <TabsTrigger value="settings">Regions</TabsTrigger> : null}
        </TabsList>

        {/* --- Day curve --- */}
        <TabsContent value="curve" className="space-y-4 pt-4">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Half-hourly Agile price &amp; typical consumption</h2>
                  <p className="text-xs text-muted-foreground">
                    {ukDateLabel(viewStart)}
                    {dayOffset === 0 && tomorrowSlots.length ? ` → ${ukDateLabel(tomorrowStart)}` : ""} ·
                    {" "}green = cheap, amber/red = expensive. Dashed line = day average.
                    {showProfile
                      ? ` Line = average kWh across the last ${profile.samples} ${ukWeekday(viewStart)}s with data.`
                      : " Not enough matching weekdays with data for a consumption overlay."}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {dayOffset === 0 && tomorrowSlots.length === 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" /> Tomorrow publishes ~16:00
                    </Badge>
                  ) : null}
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setDayOffset((d) => d - 1)} aria-label="Previous day">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8"
                    onClick={() => setDayOffset(0)} disabled={dayOffset === 0}>
                    Today
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setDayOffset((d) => Math.min(0, d + 1))}
                    disabled={dayOffset >= 0} aria-label="Next day">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={curveData} margin={{ top: 8, right: 0, bottom: 4, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={3} />
                    <YAxis yAxisId="kwh" orientation="left" tick={{ fontSize: 10 }} width={48}
                      label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <YAxis yAxisId="price" orientation="right" tick={{ fontSize: 10 }} unit="p" width={48} />
                    <RTooltip
                      formatter={(v: number, key: string) =>
                        key === "kwh"
                          ? [`${v.toFixed(2)} kWh`, "Typical consumption"]
                          : [`${v.toFixed(2)}p/kWh`, "Price"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine yAxisId="price" y={Number(viewStats.avg.toFixed(2))}
                      stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                    <ReferenceLine yAxisId="price" y={0} stroke="hsl(var(--border))" />
                    {showProfile ? (
                      <Area yAxisId="kwh" dataKey="kwh" type="monotone" connectNulls
                        stroke="hsl(var(--primary))" strokeWidth={2}
                        fill="hsl(var(--primary))" fillOpacity={0.12} />
                    ) : null}
                    <Bar yAxisId="price" dataKey="price" radius={[2, 2, 0, 0]}>
                      {curveData.map((d, i) => (
                        <Cell key={i} fill={BAND_FILL[d.band]}
                          opacity={dayOffset === 0 && d.start <= slotNow ? 0.55 : 1} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={`Cheapest 1 hour · ${ukDateLabel(viewStart)}`}
              value={viewStats.cheapest1h ? fmtPence(viewStats.cheapest1h.avgPrice) : "—"}
              sub={viewStats.cheapest1h ? `${ukTimeLabel(viewStats.cheapest1h.startMs)}–${ukTimeLabel(viewStats.cheapest1h.endMs)}` : undefined}
              icon={TrendingDown} tone="good"
            />
            <KpiCard
              label="Cheapest 3 hours"
              value={viewStats.cheapest3h ? fmtPence(viewStats.cheapest3h.avgPrice) : "—"}
              sub={viewStats.cheapest3h ? `${ukTimeLabel(viewStats.cheapest3h.startMs)}–${ukTimeLabel(viewStats.cheapest3h.endMs)}` : undefined}
              icon={Sparkles} tone="good"
            />
            <KpiCard
              label="Peak 3-hour block"
              value={viewStats.peakBlock ? fmtPence(viewStats.peakBlock.avgPrice) : "—"}
              sub={viewStats.peakBlock ? `${ukTimeLabel(viewStats.peakBlock.startMs)}–${ukTimeLabel(viewStats.peakBlock.endMs)}` : undefined}
              icon={TrendingUp} tone="bad"
            />
            <KpiCard
              label="Day average / typical use"
              value={fmtPence(viewStats.avg)}
              sub={showProfile
                ? `${Math.round(profile.totalKwh).toLocaleString()} kWh typical · ${viewStats.negativeSlots} slot(s) ≤ 0p`
                : `${viewStats.negativeSlots} slot(s) at or below 0p`}
              icon={Gauge}
            />
          </div>

          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Tomorrow</h2>
              {tomorrowSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not yet published. Octopus releases day-ahead Agile prices around 16:00 UK time.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <KpiCard label="Cheapest slot" value={tomorrow.min ? fmtPence(tomorrow.min.price) : "—"}
                    sub={tomorrow.min?.label} icon={TrendingDown} tone="good" />
                  <KpiCard label="Most expensive slot" value={tomorrow.max ? fmtPence(tomorrow.max.price) : "—"}
                    sub={tomorrow.max?.label} icon={TrendingUp} tone="bad" />
                  <KpiCard label="Best 3-hour run" value={tomorrowBest ? fmtPence(tomorrowBest.avgPrice) : "—"}
                    sub={tomorrowBest ? `${ukTimeLabel(tomorrowBest.startMs)}–${ukTimeLabel(tomorrowBest.endMs)}` : undefined}
                    icon={Sparkles} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Cost overlay --- */}
        <TabsContent value="cost" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Electricity in period" value={`${Math.round(totals.kwh).toLocaleString()} kWh`}
              sub={`${fromISO} → ${toISO}`} icon={Zap} />
            <KpiCard label="Cost on Agile" value={fmtGbp(totals.agile)}
              sub={`Weighted rate ${fmtPence(totals.weightedRate)}/kWh`} icon={Activity} />
            <KpiCard label={`Cost on your flat tariff (${flatTariff}p)`} value={fmtGbp(totals.flat)}
              sub="Current org tariff" icon={Gauge} />
            <KpiCard
              label="Agile vs flat"
              value={`${totals.flat - totals.agile >= 0 ? "−" : "+"}${fmtGbp(Math.abs(totals.flat - totals.agile))}`}
              sub={totals.flat > 0 ? `${(((totals.flat - totals.agile) / totals.flat) * 100).toFixed(1)}% ${totals.flat >= totals.agile ? "cheaper" : "dearer"} on Agile` : undefined}
              icon={totals.flat >= totals.agile ? TrendingDown : TrendingUp}
              tone={totals.flat >= totals.agile ? "good" : "bad"}
            />
          </div>

          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Daily cost — Agile vs flat tariff</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyCost} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} unit="£" />
                    <RTooltip formatter={(v: number, n) => [`£${v.toFixed(2)}`, n === "agile" ? "Agile" : "Flat tariff"]}
                      contentStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="agile" stroke="hsl(38 92% 50%)" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="flat" stroke="hsl(258 90% 66%)" dot={false} strokeWidth={2} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Building</th>
                      <th className="px-4 py-2 text-left">Region</th>
                      <th className="px-4 py-2 text-right">kWh</th>
                      <th className="px-4 py-2 text-right">Weighted rate</th>
                      <th className="px-4 py-2 text-right">Agile cost</th>
                      <th className="px-4 py-2 text-right">Flat cost</th>
                      <th className="px-4 py-2 text-right">Saving on Agile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((b) => (
                      <tr key={b.buildingId ?? "unassigned"} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{b.buildingName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{b.region} · {regionName(b.region)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{Math.round(b.kwh).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtPence(b.weightedRate)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtGbp(b.agilePence)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtGbp(b.flatPence)}</td>
                        <td className={cn("px-4 py-2 text-right font-medium tabular-nums",
                          b.savingPence >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {b.savingPence >= 0 ? "" : "−"}{fmtGbp(Math.abs(b.savingPence))}
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No electricity data in this period.
                      </td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Shift advisor --- */}
        <TabsContent value="shift" className="space-y-4 pt-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Load shifting opportunity</h2>
                  <p className="text-xs text-muted-foreground">
                    Based on the actual Agile price shape over the last {days} days.
                  </p>
                </div>
                <div className="w-64">
                  <Label className="text-xs">Shiftable share of peak load: {shiftPct}%</Label>
                  <Slider
                    value={[shiftPct]} min={0} max={100} step={5} disabled={!canEdit}
                    onValueChange={(v) => setShiftPct(v[0])}
                    onValueCommit={(v) => canEdit && updateOrganisation(org.id, { shiftable_load_pct: v[0] })}
                  />
                </div>
              </div>

              {advice ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard label="Priciest 2-hour block" value={advice.peakLabel}
                      sub={`Avg ${fmtPence(advice.avgPeakRate)}/kWh`} icon={TrendingUp} tone="bad" />
                    <KpiCard label="Cheapest 2-hour block" value={advice.cheapLabel}
                      sub={`Avg ${fmtPence(advice.avgCheapRate)}/kWh`} icon={TrendingDown} tone="good" />
                    <KpiCard label="Shiftable energy" value={`${Math.round(advice.shiftableKwh).toLocaleString()} kWh`}
                      sub={`${shiftPct}% of the peak block`} icon={ArrowRightLeft} />
                    <KpiCard label="Estimated saving" value={fmtGbp(advice.savingPence)}
                      sub={`Over the last ${days} days`} icon={Sparkles} tone="good" />
                  </div>
                  <p className="rounded-lg bg-muted/50 p-3 text-sm">
                    Moving <span className="font-semibold">{Math.round(advice.shiftableKwh).toLocaleString()} kWh</span>{" "}
                    out of <span className="font-semibold">{advice.peakLabel}</span> into{" "}
                    <span className="font-semibold">{advice.cheapLabel}</span> would have saved{" "}
                    <span className="font-semibold">{fmtGbp(advice.savingPence)}</span> over this period
                    (≈ {fmtGbp((advice.savingPence / days) * 365)} a year at the same price shape).
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not enough overlapping price and consumption data to model a shift yet.
                </p>
              )}

              {tomorrowBest ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                  <span className="font-semibold">Tomorrow's best 3-hour run:</span>{" "}
                  {ukTimeLabel(tomorrowBest.startMs)}–{ukTimeLabel(tomorrowBest.endMs)} at an average of{" "}
                  {fmtPence(tomorrowBest.avgPrice)}/kWh — schedule EV charging, battery charging, immersion or
                  flexible plant here.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Export value (Agile Outgoing)</h2>
              {exportValue.kwh > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <KpiCard label="Solar exported (metered)" value={`${Math.round(exportValue.kwh).toLocaleString()} kWh`}
                    sub={`${fromISO} → ${toISO}`} icon={Zap} />
                  <KpiCard label="Value at Agile Outgoing" value={fmtGbp(exportValue.pence)} icon={Sparkles} tone="good" />
                  <KpiCard label="Best export window today"
                    value={exportBest ? fmtPence(exportBest.avgPrice) : "—"}
                    sub={exportBest ? `${ukTimeLabel(exportBest.startMs)}–${ukTimeLabel(exportBest.endMs)}` : undefined}
                    icon={TrendingUp} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No solar/export meters found for this organisation in the selected period.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Comparison --- */}
        <TabsContent value="compare" className="space-y-4 pt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Tariff</th>
                      <th className="px-4 py-2 text-right">Modelled cost for your load</th>
                      <th className="px-4 py-2 text-right">Effective unit rate</th>
                      <th className="px-4 py-2 text-right">vs Agile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["Agile Octopus", totals.agile],
                      ["Octopus Tracker", totals.tracker],
                      ["Flexible Octopus", totals.flex],
                      [`Your flat tariff (${flatTariff}p)`, totals.flat],
                    ] as Array<[string, number]>).map(([name, pence]) => (
                      <tr key={name} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{pence > 0 ? fmtGbp(pence) : "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {pence > 0 && totals.kwh > 0 ? fmtPence(pence / totals.kwh) : "—"}
                        </td>
                        <td className={cn("px-4 py-2 text-right tabular-nums",
                          pence - totals.agile > 0 ? "text-emerald-600" : "text-red-600")}>
                          {pence > 0 && totals.agile > 0
                            ? `${pence - totals.agile >= 0 ? "+" : "−"}${fmtGbp(Math.abs(pence - totals.agile))}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Modelled by applying each published tariff's unit rates to your actual half-hourly consumption over the
            selected period. Standing charges are excluded. A load shape concentrated overnight favours Agile; a flat
            daytime shape usually favours Tracker or Flexible.
          </p>
        </TabsContent>

        {/* --- Regions --- */}
        {canEdit ? (
          <TabsContent value="settings" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h2 className="text-sm font-semibold">Organisation default region</h2>
                  <p className="text-xs text-muted-foreground">
                    Used by any building without its own region.
                  </p>
                </div>
                <Select
                  value={orgRegion ?? "C"}
                  onValueChange={(v) => updateOrganisation(org.id, { default_gsp_region_code: v })}
                >
                  <SelectTrigger className="w-80"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {GSP_REGIONS.map((r) => (
                      <SelectItem key={r.code} value={r.code}>{r.code} — {r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="pt-2">
                  <h2 className="text-sm font-semibold">Per-building regions</h2>
                  <div className="mt-2 divide-y rounded-lg border">
                    {buildings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm">{b.custom_display_name}</span>
                        <Select
                          value={b.gsp_region_code ?? "inherit"}
                          onValueChange={(v) =>
                            updateBuilding(b.id, { gsp_region_code: v === "inherit" ? null : v })}
                        >
                          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="inherit">
                              Inherit org default ({orgRegion ?? "C"})
                            </SelectItem>
                            {GSP_REGIONS.map((r) => (
                              <SelectItem key={r.code} value={r.code}>{r.code} — {r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    {buildings.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">No buildings yet.</div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}