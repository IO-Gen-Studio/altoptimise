import { useEffect, useMemo, useState } from "react";
import { Thermometer, ThermometerSnowflake, ThermometerSun, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { loadNhRoomHours, type NhRoomMap } from "@/lib/neutral-home.functions";
import type { CircuitRecord } from "@/lib/neutral-home/analytics";
import { zoneNames, zoneRooms, type ClassMap } from "@/lib/neutral-home/zones";
import {
  hourOfDayMatrix,
  roomStats,
  siteSummary,
  type ComfortBand,
  type RoomHourRow,
} from "@/lib/neutral-home/temp-analytics";

const num = (v: number, dp = 1) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function heatColor(v: number | null, band: ComfortBand) {
  if (v == null) return "bg-muted";
  if (v > band.max + 2) return "bg-red-500/70";
  if (v > band.max) return "bg-amber-500/60";
  if (v < band.min - 2) return "bg-blue-500/60";
  if (v < band.min) return "bg-sky-400/50";
  return "bg-emerald-500/50";
}

export function NeutralHomeTemperature({
  periodId,
  periodLabel,
  siteId,
  band,
  roomMap,
  circuits,
  classes,
}: {
  periodId: string;
  periodLabel: string;
  siteId: string;
  band: ComfortBand;
  roomMap: NhRoomMap[];
  circuits: CircuitRecord[];
  classes: ClassMap;
}) {
  const [rows, setRows] = useState<RoomHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadNhRoomHours({ data: { periodId } })
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load temperature data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodId]);

  const stats = useMemo(() => roomStats(rows, band), [rows, band]);
  const summary = useMemo(() => siteSummary(stats), [stats]);
  const matrix = useMemo(() => hourOfDayMatrix(rows), [rows]);
  const mapping = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roomMap)
      if (r.site_id === siteId && r.circuit_name) m.set(r.room_name, r.circuit_name);
    return m;
  }, [roomMap, siteId]);
  const zones = useMemo(() => zoneNames(circuits, classes), [circuits, classes]);
  const zonesWithTemp = useMemo(() => {
    const byZone = zoneRooms(mapping, classes);
    const withData = new Set(stats.map((s) => s.room));
    let n = 0;
    for (const [, rooms] of byZone) if (rooms.some((r) => withData.has(r))) n += 1;
    return n;
  }, [mapping, classes, stats]);
  const outOfBand = useMemo(() => stats.filter((s) => s.flag !== "ok"), [stats]);

  if (loading)
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          Loading temperature data…
        </CardContent>
      </Card>
    );

  if (error)
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );

  if (!rows.length)
    return (
      <Card className="border-dashed">
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          No temperature data stored for {periodLabel}. Upload a Temperature History report in
          Settings.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Thermometer}
          label="Zones Monitored"
          value={`${zonesWithTemp} of ${zones.length}`}
          sub={`${summary.rooms} rooms · ${summary.hours.toLocaleString()} room-hours`}
        />
        <Stat
          icon={Timer}
          label="Hours in Comfort Band"
          value={`${num(summary.inBandPct, 1)}%`}
          sub={`${band.min}–${band.max} °C`}
        />
        <Stat
          icon={ThermometerSun}
          label="Warmest Zone"
          value={summary.warmest ? `${num(summary.warmest.avg)} °C` : "—"}
          sub={summary.warmest?.room ?? ""}
        />
        <Stat
          icon={ThermometerSnowflake}
          label="Coolest Zone"
          value={summary.coolest ? `${num(summary.coolest.avg)} °C` : "—"}
          sub={summary.coolest?.room ?? ""}
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-base font-semibold tracking-tight">Temperature range by room</h2>
          <p className="pb-3 text-sm text-muted-foreground">
            {outOfBand.length} of {stats.length} rooms spent meaningful time outside the comfort
            band
          </p>
          <ScrollArea className="h-[360px] rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 text-right font-medium">Min</th>
                  <th className="px-3 py-2 text-right font-medium">Avg</th>
                  <th className="px-3 py-2 text-right font-medium">Max</th>
                  <th className="px-3 py-2 text-right font-medium">Set point</th>
                  <th className="px-3 py-2 text-right font-medium">Hrs above</th>
                  <th className="px-3 py-2 text-right font-medium">Hrs below</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.room} className="border-t">
                    <td className="px-3 py-2">{s.room}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(s.min)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{num(s.avg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(s.max)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.setAvg == null ? "—" : num(s.setAvg)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.hoursAbove}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.hoursBelow}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          s.flag === "bad" && "border-destructive/50 text-destructive",
                          s.flag === "warn" && "border-amber-500/50 text-amber-600",
                          s.flag === "ok" && "border-emerald-500/50 text-emerald-600",
                        )}
                      >
                        {s.flag === "bad"
                          ? "Out of band"
                          : s.flag === "warn"
                            ? "Borderline"
                            : "In band"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-base font-semibold tracking-tight">Room × hour heatmap</h2>
          <p className="pb-3 text-sm text-muted-foreground">
            Average temperature by hour of day. Amber/red is above the band, blue is below.
          </p>
          <ScrollArea className="h-[360px]">
            <div className="min-w-[720px] space-y-1 pr-3">
              <div className="flex gap-1 pl-40">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-5 text-center text-[10px] text-muted-foreground">
                    {h}
                  </div>
                ))}
              </div>
              {matrix.map((r) => (
                <div key={r.room} className="flex items-center gap-1">
                  <div className="w-40 truncate pr-2 text-xs" title={r.room}>
                    {r.room}
                  </div>
                  {r.hours.map((v, h) => (
                    <div
                      key={h}
                      title={`${r.room} · ${String(h).padStart(2, "0")}:00 · ${v == null ? "no data" : `${v} °C`}`}
                      className={cn("h-5 w-5 rounded-sm", heatColor(v, band))}
                    />
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        {sub ? <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
