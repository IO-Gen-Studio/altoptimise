import { ArrowLeft, Activity, CalendarDays, Gauge } from "lucide-react";
import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useBuildings, useConsumption, useDataStore, useMeterRegistry,
  useMeterSeries, useOrganisations,
} from "@/lib/data-store";
import { checkCompleteness, utilityKind } from "@/lib/energy/completeness";
import { inheritanceLabel, resolveProfile } from "@/lib/energy/profile";

interface Props {
  orgId: string;
  rawMeterName: string;
  windowDays: number;
  onBack: () => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hhmmToSlot(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 2 + (m >= 30 ? 1 : 0);
}

export function MeterDashboard({ orgId, rawMeterName, windowDays, onBack }: Props) {
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(orgId);
  const { consumption } = useConsumption();
  const { state } = useDataStore();
  const registry = useMeterRegistry(orgId);
  const meter = registry.find((m) => m.raw_meter_name === rawMeterName);

  const org = organisations.find((o) => o.id === orgId);
  const building = buildings.find((b) => b.id === meter?.effective_building_id);
  const profile = resolveProfile(
    org, building,
    state.schedules.filter((s) => s.building_id === (building?.id ?? "")),
  );

  const { startISO, endISO, start, end } = useMemo(() => {
    const dates = consumption
      .filter((c) => c.meter_name === rawMeterName)
      .map((r) => r.interval_date).sort();
    const last = dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
    const [y, m, d] = last.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const start = new Date(end);
    start.setDate(start.getDate() - (windowDays - 1));
    return { start, end, startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) };
  }, [consumption, rawMeterName, windowDays]);

  const series = useMeterSeries(rawMeterName, startISO, endISO);
  const utility = utilityKind(meter?.utility_category ?? "");
  const completeness = useMemo(
    () => checkCompleteness(series.rows, utility, start, end, org, profile, series.firstSeen ?? undefined),
    [series.rows, series.firstSeen, utility, start, end, org, profile],
  );

  if (!meter) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card><CardContent className="p-8 text-sm text-muted-foreground">Meter not found.</CardContent></Card>
      </div>
    );
  }

  const activeFromSlot = hhmmToSlot(profile.activeFrom);
  const activeToSlot = hhmmToSlot(profile.activeTo);

  // Colour scale for heatmap: 0..max maps to alpha 0..1 of primary
  const heatMax = Math.max(1e-9, ...series.weekdayHeatmap.flat());

  const statusBadge = completeness.status === "ok" ? (
    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">OK</Badge>
  ) : completeness.status === "incomplete" ? (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">Data Incomplete</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">Telemetry Offline</Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {meter.custom_display_name ?? meter.raw_meter_name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {building?.custom_display_name ?? "Unassigned"} · <span className="capitalize">{utility}</span> ·
              factor {meter.effective_meter_factor} · {meter.row_count} rows
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {inheritanceLabel(profile.source, profile.profileType)}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Status</div>
          <div className="mt-2">{statusBadge}</div>
          {completeness.reason && <div className="mt-2 text-xs text-muted-foreground">{completeness.reason}</div>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Coverage</div>
          <div className="mt-1 text-2xl font-semibold">{(100 - completeness.missingPct).toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">
            {completeness.presentSlots}/{completeness.expectedSlots} intervals
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Longest flatline (active hrs)</div>
          <div className="mt-1 text-2xl font-semibold">{completeness.longestFlatlineHours.toFixed(1)}h</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Window total</div>
          <div className="mt-1 text-2xl font-semibold">{series.totalWindowKwh.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground">
            {series.firstSeen ? `First seen ${series.firstSeen}` : "—"} · Last {series.lastSeen ?? "—"}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-primary" /> Average half-hour profile
            <span className="text-xs font-normal text-muted-foreground">— shaded band = active hours</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series.hhAverage}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" interval={5} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <ReferenceArea x1={series.hhAverage[activeFromSlot]?.label} x2={series.hhAverage[Math.max(0, activeToSlot - 1)]?.label}
                  fill="hsl(var(--primary))" fillOpacity={0.08} />
                <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-primary" /> Daily totals
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.dailyTotals}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4 text-primary" /> Weekly pattern (avg kWh per half-hour)
          </div>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex text-[10px] text-muted-foreground">
                <div className="w-10" />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} style={{ width: "calc(2 * 12px)" }} className="text-center">
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
              </div>
              {series.weekdayHeatmap.map((row, d) => (
                <div key={d} className="flex items-center">
                  <div className="w-10 text-xs text-muted-foreground">{WEEKDAY_LABELS[d]}</div>
                  {row.map((v, i) => {
                    const alpha = v <= 0 ? 0 : Math.min(1, v / heatMax);
                    return (
                      <div
                        key={i}
                        title={`${WEEKDAY_LABELS[d]} ${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"} — ${v.toFixed(2)}`}
                        style={{ width: 12, height: 18, background: `hsl(var(--primary) / ${alpha})` }}
                        className="border border-background"
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}