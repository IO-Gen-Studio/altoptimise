import type { NhMeterCategory } from "@/lib/neutral-home.functions";
import type { CircuitRecord } from "./analytics";
import { detailCircuits } from "./analytics";
import type { RoomHourRow, RoomStats, ComfortBand } from "./temp-analytics";
import { roomStats } from "./temp-analytics";

export type CircuitKind = "zone" | "equipment" | "other";

export const KIND_LABEL: Record<CircuitKind, string> = {
  zone: "Zone",
  equipment: "Equipment",
  other: "Other",
};

export const KIND_OPTIONS: CircuitKind[] = ["zone", "equipment", "other"];

export interface CircuitClass {
  kind: CircuitKind;
  /** the zone circuit this equipment rolls up into */
  zone: string | null;
}

export type ClassMap = Map<string, CircuitClass>;

/** Per-site classification lookup keyed by circuit name. */
export function classMap(rows: NhMeterCategory[], siteId: string): ClassMap {
  const m: ClassMap = new Map();
  for (const r of rows) {
    if (r.site_id !== siteId) continue;
    const kind = (r.kind ?? "other") as CircuitKind;
    m.set(r.circuit_name, {
      kind,
      zone: kind === "equipment" ? (r.zone_circuit_name ?? null) : null,
    });
  }
  return m;
}

export const kindOf = (cls: ClassMap, circuit: string): CircuitKind =>
  cls.get(circuit)?.kind ?? "other";

/** The zone a circuit reports under — itself when it is a zone. */
export function zoneOf(cls: ClassMap, circuit: string): string | null {
  const c = cls.get(circuit);
  if (!c) return null;
  if (c.kind === "zone") return circuit;
  return c.kind === "equipment" ? c.zone : null;
}

/** All circuits classed as zones, in the order they appear plus any orphan links. */
export function zoneNames(circuits: CircuitRecord[], cls: ClassMap): string[] {
  const names = new Set<string>();
  for (const c of detailCircuits(circuits)) {
    if (kindOf(cls, c.circuit_name) === "zone") names.add(c.circuit_name);
  }
  for (const [, v] of cls) if (v.kind === "equipment" && v.zone) names.add(v.zone);
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export interface ZoneMemberRow {
  circuit: string;
  kwh: number;
  costGbp: number;
  co2Kg: number;
}

export interface ZoneAgg {
  zone: string;
  ownKwh: number;
  equipmentKwh: number;
  totalKwh: number;
  costGbp: number;
  co2Kg: number;
  dayKwh: number;
  nightKwh: number;
  nightPct: number;
  equipment: ZoneMemberRow[];
}

const num = (v: number | null | undefined) => v ?? 0;

/** Rolls each zone up with the equipment mapped into it. */
export function zoneAggregates(circuits: CircuitRecord[], cls: ClassMap): ZoneAgg[] {
  const rows = detailCircuits(circuits);
  const byName = new Map(rows.map((r) => [r.circuit_name, r]));
  const out: ZoneAgg[] = [];

  for (const zone of zoneNames(circuits, cls)) {
    const own = byName.get(zone);
    const equipment: ZoneMemberRow[] = [];
    for (const r of rows) {
      const c = cls.get(r.circuit_name);
      if (c?.kind === "equipment" && c.zone === zone) {
        equipment.push({
          circuit: r.circuit_name,
          kwh: num(r.usage_kwh),
          costGbp: num(r.total_cost_p) / 100,
          co2Kg: num(r.co2_kg),
        });
      }
    }
    equipment.sort((a, b) => b.kwh - a.kwh);

    const ownKwh = num(own?.usage_kwh);
    const equipmentKwh = equipment.reduce((a, e) => a + e.kwh, 0);
    const day = num(own?.day_kwh) + rows
      .filter((r) => cls.get(r.circuit_name)?.kind === "equipment" && cls.get(r.circuit_name)?.zone === zone)
      .reduce((a, r) => a + num(r.day_kwh), 0);
    const night = num(own?.night_kwh) + rows
      .filter((r) => cls.get(r.circuit_name)?.kind === "equipment" && cls.get(r.circuit_name)?.zone === zone)
      .reduce((a, r) => a + num(r.night_kwh), 0);
    const dn = day + night;

    out.push({
      zone,
      ownKwh,
      equipmentKwh,
      totalKwh: ownKwh + equipmentKwh,
      costGbp: num(own?.total_cost_p) / 100 + equipment.reduce((a, e) => a + e.costGbp, 0),
      co2Kg: num(own?.co2_kg) + equipment.reduce((a, e) => a + e.co2Kg, 0),
      dayKwh: day,
      nightKwh: night,
      nightPct: dn > 0 ? (night / dn) * 100 : 0,
      equipment,
    });
  }
  return out.sort((a, b) => b.totalKwh - a.totalKwh);
}

/** Rooms grouped by the zone their mapped circuit reports under. */
export function zoneRooms(
  mapping: Map<string, string>,
  cls: ClassMap,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [room, circuit] of mapping) {
    const zone = zoneOf(cls, circuit);
    if (!zone) continue;
    const list = out.get(zone);
    if (list) list.push(room);
    else out.set(zone, [room]);
  }
  return out;
}

export interface ZoneComfortRow {
  zone: string;
  rooms: string[];
  hours: number;
  avg: number;
  inBandPct: number;
  hoursAbove: number;
  hoursBelow: number;
  totalKwh: number;
  costGbp: number;
  flag: "ok" | "warn" | "bad";
}

/** Aggregates room-level comfort stats up to the zone level. */
export function zoneComfort(
  rows: RoomHourRow[],
  band: ComfortBand,
  mapping: Map<string, string>,
  cls: ClassMap,
  aggs: ZoneAgg[],
): ZoneComfortRow[] {
  const stats = new Map<string, RoomStats>(roomStats(rows, band).map((s) => [s.room, s]));
  const byZone = zoneRooms(mapping, cls);
  const kwhByZone = new Map(aggs.map((a) => [a.zone, a]));
  const out: ZoneComfortRow[] = [];

  for (const [zone, rooms] of byZone) {
    let hours = 0;
    let weighted = 0;
    let above = 0;
    let below = 0;
    const used: string[] = [];
    for (const room of rooms) {
      const s = stats.get(room);
      if (!s) continue;
      used.push(room);
      hours += s.hours;
      weighted += s.avg * s.hours;
      above += s.hoursAbove;
      below += s.hoursBelow;
    }
    if (!hours) continue;
    const inBandPct = ((hours - above - below) / hours) * 100;
    const agg = kwhByZone.get(zone);
    out.push({
      zone,
      rooms: used,
      hours,
      avg: Number((weighted / hours).toFixed(2)),
      inBandPct: Number(inBandPct.toFixed(1)),
      hoursAbove: above,
      hoursBelow: below,
      totalKwh: agg?.totalKwh ?? 0,
      costGbp: agg?.costGbp ?? 0,
      flag: inBandPct < 50 ? "bad" : inBandPct < 85 ? "warn" : "ok",
    });
  }
  return out.sort((a, b) => b.avg - a.avg);
}

export interface ZoneTempSeries {
  zone: string;
  rooms: string[];
  daily: { date: string; avg: number }[];
  /** day × hour-of-day average temperature grid for the period */
  grid: { date: string; hours: (number | null)[] }[];
  avg: number;
  min: number;
  max: number;
  hours: number;
  hoursInBand: number;
}

/** Daily average temperature per zone, plus avg/min/max across the period. */
export function zoneDailyTemps(
  rows: RoomHourRow[],
  band: ComfortBand,
  mapping: Map<string, string>,
  cls: ClassMap,
): Map<string, ZoneTempSeries> {
  const byZone = zoneRooms(mapping, cls);
  const zoneOfRoom = new Map<string, string>();
  for (const [zone, rooms] of byZone) for (const r of rooms) zoneOfRoom.set(r, zone);

  const acc = new Map<
    string,
    {
      rooms: Set<string>;
      days: Map<string, { sum: number; n: number }>;
      /** date -> hour-of-day -> running average accumulator */
      cells: Map<string, { sum: number; n: number }[]>;
      sum: number;
      n: number;
      min: number;
      max: number;
      inBand: number;
    }
  >();

  for (const r of rows) {
    if (r.temp_avg == null) continue;
    const zone = zoneOfRoom.get(r.room_name);
    if (!zone) continue;
    let a = acc.get(zone);
    if (!a) {
      a = {
        rooms: new Set(),
        days: new Map(),
        cells: new Map(),
        sum: 0,
        n: 0,
        min: Infinity,
        max: -Infinity,
        inBand: 0,
      };
      acc.set(zone, a);
    }
    a.rooms.add(r.room_name);
    const date = r.hour_ts.slice(0, 10);
    const cur = a.days.get(date) ?? { sum: 0, n: 0 };
    cur.sum += r.temp_avg;
    cur.n += 1;
    a.days.set(date, cur);

    const hour = Number(r.hour_ts.slice(11, 13));
    if (Number.isFinite(hour) && hour >= 0 && hour < 24) {
      let row = a.cells.get(date);
      if (!row) {
        row = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));
        a.cells.set(date, row);
      }
      row[hour]!.sum += r.temp_avg;
      row[hour]!.n += 1;
    }

    a.sum += r.temp_avg;
    a.n += 1;
    if (r.temp_avg < a.min) a.min = r.temp_avg;
    if (r.temp_avg > a.max) a.max = r.temp_avg;
    if (r.temp_avg >= band.min && r.temp_avg <= band.max) a.inBand += 1;
  }

  const out = new Map<string, ZoneTempSeries>();
  for (const [zone, a] of acc) {
    if (!a.n) continue;
    out.set(zone, {
      zone,
      rooms: Array.from(a.rooms).sort((x, y) => x.localeCompare(y)),
      daily: Array.from(a.days.entries())
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([date, v]) => ({ date: date.slice(5), avg: Number((v.sum / v.n).toFixed(1)) })),
      grid: Array.from(a.cells.entries())
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([date, hours]) => ({
          date: date.slice(5),
          hours: hours.map((c) => (c.n ? Number((c.sum / c.n).toFixed(1)) : null)),
        })),
      avg: Number((a.sum / a.n).toFixed(1)),
      min: Number(a.min.toFixed(1)),
      max: Number(a.max.toFixed(1)),
      hours: a.n,
      hoursInBand: a.inBand,
    });
  }
  return out;
}
