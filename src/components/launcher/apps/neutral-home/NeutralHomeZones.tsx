import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Moon, PoundSterling, Thermometer, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { loadNhRoomHours, type NhRoomMap } from "@/lib/neutral-home.functions";
import type { CircuitRecord } from "@/lib/neutral-home/analytics";
import type { ComfortBand, RoomHourRow } from "@/lib/neutral-home/temp-analytics";
import {
  zoneAggregates,
  zoneComfort,
  type ClassMap,
} from "@/lib/neutral-home/zones";

const num = (v: number, dp = 0) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

const FLAG_CLASS: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
};

/**
 * Zone-level reporting: rolls each zone up with the equipment mapped into it
 * and joins the comfort data of the rooms that belong to those circuits.
 */
export function NeutralHomeZones({
  circuits,
  classes,
  roomMap,
  siteId,
  band,
  temperaturePeriodId,
}: {
  circuits: CircuitRecord[];
  classes: ClassMap;
  roomMap: NhRoomMap[];
  siteId: string;
  band: ComfortBand;
  /** period id when the period has temperature data, otherwise null */
  temperaturePeriodId: string | null;
}) {
  const [rows, setRows] = useState<RoomHourRow[]>([]);

  useEffect(() => {
    if (!temperaturePeriodId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    loadNhRoomHours({ data: { periodId: temperaturePeriodId } })
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [temperaturePeriodId]);

  const aggs = useMemo(() => zoneAggregates(circuits, classes), [circuits, classes]);

  const mapping = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roomMap)
      if (r.site_id === siteId && r.circuit_name) m.set(r.room_name, r.circuit_name);
    return m;
  }, [roomMap, siteId]);

  const comfort = useMemo(
    () => (rows.length ? zoneComfort(rows, band, mapping, classes, aggs) : []),
    [rows, band, mapping, classes, aggs],
  );
  const comfortByZone = useMemo(() => new Map(comfort.map((c) => [c.zone, c])), [comfort]);

  const chartData = useMemo(
    () =>
      aggs.slice(0, 14).map((a) => ({
        name: a.zone.length > 24 ? `${a.zone.slice(0, 23)}…` : a.zone,
        Zone: Number(a.ownKwh.toFixed(2)),
        Equipment: Number(a.equipmentKwh.toFixed(2)),
      })),
    [aggs],
  );

  if (!aggs.length) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 pb-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-tight">Zones</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            No zones yet. In Settings → Circuits &amp; zones, set a circuit's Category to
            &quot;Zone&quot;, then map Equipment circuits into it.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalKwh = aggs.reduce((a, z) => a + z.totalKwh, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-base font-semibold tracking-tight">Zones</h2>
                <p className="text-sm text-muted-foreground">
                  Zone consumption including the equipment mapped into it.
                </p>
              </div>
            </div>
            <Badge variant="outline">{aggs.length} zones</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {aggs.map((z) => {
              const c = comfortByZone.get(z.zone);
              return (
                <div key={z.zone} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{z.zone}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {z.equipment.length} equipment
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="tabular-nums font-medium">{num(z.totalKwh, 1)} kWh</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <PoundSterling className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="tabular-nums font-medium">£{num(z.costGbp, 2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="tabular-nums">{num(z.nightPct, 1)}% night</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={cn("tabular-nums", c ? FLAG_CLASS[c.flag] : "")}>
                        {c ? `${num(c.avg, 1)}°C` : "no temp"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Own {num(z.ownKwh, 1)} kWh · equipment {num(z.equipmentKwh, 1)} kWh ·{" "}
                    {totalKwh > 0 ? num((z.totalKwh / totalKwh) * 100, 1) : "0"}% of zone total
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={60}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <RTooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Zone" stackId="z" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Equipment" stackId="z" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {comfort.length ? (
        <Card>
          <CardContent className="p-5">
            <div className="pb-3">
              <h2 className="text-base font-semibold tracking-tight">Zone comfort &amp; usage</h2>
              <p className="text-sm text-muted-foreground">
                Room temperatures aggregated to the zone their circuit reports under (comfort band{" "}
                {band.min}–{band.max}°C).
              </p>
            </div>
            <ScrollArea className="max-h-[380px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Zone</th>
                    <th className="py-2 pr-3 font-medium">Rooms</th>
                    <th className="py-2 text-right font-medium">Avg °C</th>
                    <th className="py-2 text-right font-medium">In band %</th>
                    <th className="py-2 text-right font-medium">Hrs above</th>
                    <th className="py-2 text-right font-medium">Hrs below</th>
                    <th className="py-2 text-right font-medium">Usage (kWh)</th>
                    <th className="py-2 text-right font-medium">Cost (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {comfort.map((c) => (
                    <tr key={c.zone} className="border-t">
                      <td className="py-2 pr-3">{c.zone}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{c.rooms.length}</td>
                      <td className={cn("py-2 text-right tabular-nums", FLAG_CLASS[c.flag])}>
                        {num(c.avg, 1)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{num(c.inBandPct, 1)}</td>
                      <td className="py-2 text-right tabular-nums">{num(c.hoursAbove)}</td>
                      <td className="py-2 text-right tabular-nums">{num(c.hoursBelow)}</td>
                      <td className="py-2 text-right tabular-nums">{num(c.totalKwh, 1)}</td>
                      <td className="py-2 text-right tabular-nums">{num(c.costGbp, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
