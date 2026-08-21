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
