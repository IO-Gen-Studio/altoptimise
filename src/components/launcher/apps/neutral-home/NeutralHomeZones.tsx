import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, LayoutGrid, ArrowDown, ArrowUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { loadNhRoomHours, type NhRoomMap } from "@/lib/neutral-home.functions";
import type { CircuitRecord } from "@/lib/neutral-home/analytics";
import type { ComfortBand, RoomHourRow } from "@/lib/neutral-home/temp-analytics";
import {
  zoneAggregates,
  zoneDailyTemps,
  type ClassMap,
  type ZoneAgg,
  type ZoneTempSeries,
} from "@/lib/neutral-home/zones";

const num = (v: number, dp = 0) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

type SortKey =
  | "zone"
  | "totalKwh"
  | "co2Kg"
  | "costGbp"
  | "dayKwh"
  | "nightKwh"
  | "avgTemp";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "zone", label: "Zone", align: "left" },
  { key: "totalKwh", label: "Usage (kWh)", align: "right" },
  { key: "co2Kg", label: "CO2 (kg)", align: "right" },
  { key: "costGbp", label: "Cost (£)", align: "right" },
  { key: "dayKwh", label: "Day (kWh)", align: "right" },
  { key: "nightKwh", label: "Night (kWh)", align: "right" },
  { key: "avgTemp", label: "Avg temp (°C)", align: "right" },
];

function heatClass(v: number | null, band: ComfortBand) {
  if (v == null) return "bg-muted";
  if (v > band.max + 2) return "bg-red-500/70";
  if (v > band.max) return "bg-amber-500/60";
  if (v < band.min - 2) return "bg-blue-500/60";
  if (v < band.min) return "bg-sky-400/50";
  return "bg-emerald-500/50";
}

/**
 * Zone league table: each zone rolled up with the equipment mapped into it,
 * expandable to its daily average temperature against the comfort band.
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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "totalKwh",
    dir: "desc",
  });
  const [open, setOpen] = useState<string | null>(null);

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

  const temps = useMemo(
    () =>
      rows.length
        ? zoneDailyTemps(rows, band, mapping, classes)
        : new Map<string, ZoneTempSeries>(),
    [rows, band, mapping, classes],
  );

  /** warmest / coldest zone by average temperature, for the grid tags */
  const extremes = useMemo(() => {
    let warmest: string | null = null;
    let coldest: string | null = null;
    let hi = -Infinity;
    let lo = Infinity;
    for (const [zone, t] of temps) {
      if (t.avg > hi) {
        hi = t.avg;
        warmest = zone;
      }
      if (t.avg < lo) {
        lo = t.avg;
        coldest = zone;
      }
    }
    return { warmest, coldest };
  }, [temps]);

  const sorted = useMemo(() => {
    const list = [...aggs];
    const { key, dir } = sort;
    const val = (z: ZoneAgg) =>
      key === "avgTemp" ? (temps.get(z.zone)?.avg ?? -Infinity) : (z[key as keyof ZoneAgg] as number);
    list.sort((a, b) => {
      const cmp = key === "zone" ? a.zone.localeCompare(b.zone) : val(a) - val(b);
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [aggs, sort, temps]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "zone" ? "asc" : "desc" },
    );

  if (!aggs.length) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 pb-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-tight">Zone league table</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            No zones yet. In Settings → Circuits &amp; zones, set a circuit's Category to
            &quot;Zone&quot;, then map Equipment circuits into it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold tracking-tight">Zone Consumption and Temperature Overview</h2>
              <p className="text-sm text-muted-foreground">
                Each zone including the equipment mapped into it. Click a zone for its temperature
                profile.
              </p>
            </div>
          </div>
          <Badge variant="outline">{aggs.length} zones</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="w-8 py-2" />
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "py-2 font-medium",
                      c.align === "right" ? "text-right pl-3" : "text-left pr-3",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.label}
                      {sort.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((z, i) => {
                const isOpen = open === z.zone;
                const t = temps.get(z.zone);
                const isWarmest = extremes.warmest === z.zone;
                const isColdest = extremes.coldest === z.zone;
                return (
                  <Fragment key={z.zone}>
                    <tr
                      onClick={() => setOpen(isOpen ? null : z.zone)}
                      className={cn(
                        "cursor-pointer border-t transition-colors hover:bg-muted/50",
                        isOpen && "bg-muted/40",
                      )}
                    >
                      <td className="py-2 text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="font-medium">{z.zone}</span>
                          {isWarmest ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/50 text-amber-600"
                            >
                              <ThermometerSun className="h-3 w-3" /> Warmest
                            </Badge>
                          ) : null}
                          {isColdest ? (
                            <Badge variant="outline" className="gap-1 border-sky-500/50 text-sky-600">
                              <ThermometerSnowflake className="h-3 w-3" /> Coldest
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {z.equipment.length} equipment mapped
                        </div>
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums font-medium">
                        {num(z.totalKwh, 1)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">{num(z.co2Kg, 1)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{num(z.costGbp, 2)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{num(z.dayKwh, 1)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{num(z.nightKwh, 1)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {t ? `${num(t.avg, 1)}` : "—"}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={COLUMNS.length + 1} className="p-4">
                          <ZoneDetail zone={z} band={band} temp={temps.get(z.zone)} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ZoneDetail({
  zone,
  band,
  temp,
}: {
  zone: ZoneAgg;
  band: ComfortBand;
  temp?: ZoneTempSeries;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div className="rounded-lg border bg-card p-3">
          <div className="pb-2 text-xs font-medium text-muted-foreground">
            Daily average temperature · comfort band {band.min}–{band.max}°C
          </div>
          {temp?.daily.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temp.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    unit="°"
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v}°C`, "Avg"]}
                  />
                  <ReferenceLine
                    y={band.min}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{
                      value: `${band.min}°C`,
                      position: "insideLeft",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                  <ReferenceLine
                    y={band.max}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{
                      value: `${band.max}°C`,
                      position: "insideLeft",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No temperature data for this zone.
            </p>
          )}
        </div>

        <div className="space-y-2">
          {temp ? (
            <>
              <Stat label="Average temperature" value={`${num(temp.avg, 1)}°C`} />
              <Stat label="Highest temperature" value={`${num(temp.max, 1)}°C`} />
              <Stat label="Lowest temperature" value={`${num(temp.min, 1)}°C`} />
              <p className="text-[11px] text-muted-foreground">
                {num(temp.hoursInBand)} of {num(temp.hours)} readings in band ·{" "}
                {temp.rooms.length} room{temp.rooms.length === 1 ? "" : "s"} mapped
              </p>
            </>
          ) : (
            <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
              Map rooms to this zone's circuits in Settings → Rooms &amp; comfort to see temperature
              stats.
            </div>
          )}
        </div>
      </div>

      {zone.equipment.length ? (
        <div className="rounded-lg border bg-card p-3">
          <div className="pb-2 text-xs font-medium text-muted-foreground">Equipment circuits</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Circuit</th>
                <th className="py-1 text-right font-medium">Usage (kWh)</th>
                <th className="py-1 text-right font-medium">Cost (£)</th>
                <th className="py-1 text-right font-medium">CO2 (kg)</th>
              </tr>
            </thead>
            <tbody>
              {zone.equipment.map((e) => (
                <tr key={e.circuit} className="border-t">
                  <td className="py-1.5 pr-3">{e.circuit}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(e.kwh, 1)}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(e.costGbp, 2)}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(e.co2Kg, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
