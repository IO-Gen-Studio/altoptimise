import { useEffect, useMemo, useState } from "react";
import { Thermometer, ThermometerSnowflake, ThermometerSun, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { loadNhRoomHours, type NhRoomMap } from "@/lib/neutral-home.functions";
import type { CircuitRecord } from "@/lib/neutral-home/analytics";
import { zoneNames, zoneRooms, type ClassMap } from "@/lib/neutral-home/zones";
import {
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
