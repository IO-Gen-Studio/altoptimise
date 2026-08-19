import type { CircuitRecord } from "./analytics";

export interface RoomHourRow {
  id?: string;
  period_id: string;
  room_name: string;
  hour_ts: string;
  temp_min: number | null;
  temp_avg: number | null;
  temp_max: number | null;
  set_temp_avg: number | null;
  on_share: number | null;
  reading_count: number;
}

export interface ComfortBand {
  min: number;
  max: number;
}

export const DEFAULT_BAND: ComfortBand = { min: 19, max: 21 };

export interface RoomStats {
  room: string;
  hours: number;
  avg: number;
  min: number;
  max: number;
  setAvg: number | null;
  onShare: number | null;
  hoursAbove: number;
  hoursBelow: number;
  hoursInBand: number;
  /** Σ max(temp - band.max, 0) — the overheating "effort" */
  degreeHoursAbove: number;
  /** Σ max(band.min - temp, 0) */
  degreeHoursBelow: number;
  /** Σ max(temp - band.min, 0) — total heating effort above the target floor */
  degreeHoursHeating: number;
  worstAbove: number | null;
  worstBelow: number | null;
  avgDeviation: number;
  flag: "ok" | "warn" | "bad";
}

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

export function roomStats(rows: RoomHourRow[], band: ComfortBand): RoomStats[] {
  const groups = new Map<string, RoomHourRow[]>();
  for (const r of rows) {
    if (r.temp_avg == null) continue;
    const list = groups.get(r.room_name);
    if (list) list.push(r);
    else groups.set(r.room_name, [r]);
  }

  const out: RoomStats[] = [];
  for (const [room, list] of groups) {
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let setSum = 0;
    let setN = 0;
    let onSum = 0;
    let onN = 0;
    let above = 0;
    let below = 0;
    let dhAbove = 0;
    let dhBelow = 0;
    let dhHeat = 0;
    let worstAbove: number | null = null;
    let worstBelow: number | null = null;
    let devSum = 0;

    for (const r of list) {
      const t = r.temp_avg!;
      sum += t;
      min = Math.min(min, r.temp_min ?? t);
      max = Math.max(max, r.temp_max ?? t);
      if (r.set_temp_avg != null) {
        setSum += r.set_temp_avg;
        setN += 1;
      }
      if (r.on_share != null) {
        onSum += r.on_share;
        onN += 1;
      }
      if (t > band.max) {
        above += 1;
        dhAbove += t - band.max;
        devSum += t - band.max;
        worstAbove = worstAbove == null ? t : Math.max(worstAbove, t);
      } else if (t < band.min) {
        below += 1;
        dhBelow += band.min - t;
        devSum += band.min - t;
        worstBelow = worstBelow == null ? t : Math.min(worstBelow, t);
      }
      dhHeat += Math.max(t - band.min, 0);
    }

    const hours = list.length;
    const outOfBandShare = hours ? (above + below) / hours : 0;
    out.push({
      room,
      hours,
      avg: round(sum / hours),
      min: round(min),
      max: round(max),
      setAvg: setN ? round(setSum / setN) : null,
      onShare: onN ? round(onSum / onN, 4) : null,
      hoursAbove: above,
      hoursBelow: below,
      hoursInBand: hours - above - below,
      degreeHoursAbove: round(dhAbove, 1),
      degreeHoursBelow: round(dhBelow, 1),
      degreeHoursHeating: round(dhHeat, 1),
      worstAbove: worstAbove == null ? null : round(worstAbove),
      worstBelow: worstBelow == null ? null : round(worstBelow),
      avgDeviation: round(devSum / hours),
      flag: outOfBandShare > 0.5 ? "bad" : outOfBandShare > 0.15 ? "warn" : "ok",
    });
  }
  return out.sort((a, b) => b.avg - a.avg);
}

export interface SiteTempSummary {
  rooms: number;
  hours: number;
  avg: number;
  inBandPct: number;
  hoursAbove: number;
  hoursBelow: number;
  warmest: RoomStats | null;
  coolest: RoomStats | null;
}

export function siteSummary(stats: RoomStats[]): SiteTempSummary {
  const hours = stats.reduce((a, s) => a + s.hours, 0);
  const weighted = stats.reduce((a, s) => a + s.avg * s.hours, 0);
  const above = stats.reduce((a, s) => a + s.hoursAbove, 0);
  const below = stats.reduce((a, s) => a + s.hoursBelow, 0);
  const sorted = [...stats].sort((a, b) => b.avg - a.avg);
  return {
    rooms: stats.length,
    hours,
    avg: hours ? round(weighted / hours) : 0,
    inBandPct: hours ? round(((hours - above - below) / hours) * 100, 1) : 0,
    hoursAbove: above,
    hoursBelow: below,
    warmest: sorted[0] ?? null,
    coolest: sorted[sorted.length - 1] ?? null,
  };
}

/** Daily average per room: [{ date, [room]: avg }] */
export function dailySeries(rows: RoomHourRow[], rooms: string[]): Record<string, number | string>[] {
  const wanted = new Set(rooms);
  const byDate = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const r of rows) {
    if (r.temp_avg == null || !wanted.has(r.room_name)) continue;
    const date = r.hour_ts.slice(0, 10);
    let m = byDate.get(date);
    if (!m) {
      m = new Map();
      byDate.set(date, m);
    }
    const cur = m.get(r.room_name) ?? { sum: 0, n: 0 };
    cur.sum += r.temp_avg;
    cur.n += 1;
    m.set(r.room_name, cur);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, m]) => {
      const row: Record<string, number | string> = { date: date.slice(5) };
      for (const [room, v] of m) row[room] = round(v.sum / v.n, 1);
      return row;
    });
}

/** Average temperature per room per hour-of-day (UTC hour). */
export function hourOfDayMatrix(
  rows: RoomHourRow[],
): { room: string; hours: (number | null)[] }[] {
  const map = new Map<string, { sum: number; n: number }[]>();
  for (const r of rows) {
    if (r.temp_avg == null) continue;
    const h = Number(r.hour_ts.slice(11, 13));
    if (!Number.isFinite(h)) continue;
    let arr = map.get(r.room_name);
    if (!arr) {
      arr = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));
      map.set(r.room_name, arr);
    }
    arr[h]!.sum += r.temp_avg;
    arr[h]!.n += 1;
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([room, arr]) => ({
      room,
      hours: arr.map((c) => (c.n ? round(c.sum / c.n, 1) : null)),
    }));
}

export interface CombinedRoomRow extends RoomStats {
  circuit: string;
  usage_kwh: number;
  cost_gbp: number;
  co2_kg: number;
  /** proportion of heating effort spent above the comfort band */
  wasteShare: number;
  wastedKwh: number;
  wastedGbp: number;
  kwhPerDegreeHour: number | null;
}

/**
 * Joins room temperature statistics to their mapped consumption circuit and
 * estimates the cost of overheating as the share of heating effort that sat
 * above the comfort band.
 */
export function combineRooms(
  stats: RoomStats[],
  circuits: CircuitRecord[],
  mapping: Map<string, string>,
): CombinedRoomRow[] {
  const byName = new Map(circuits.map((c) => [c.circuit_name, c]));
  const out: CombinedRoomRow[] = [];
  for (const s of stats) {
    const circuitName = mapping.get(s.room);
    if (!circuitName) continue;
    const c = byName.get(circuitName);
    if (!c) continue;
    const usage = c.usage_kwh ?? 0;
    const cost = (c.total_cost_p ?? 0) / 100;
    const share = s.degreeHoursHeating > 0 ? s.degreeHoursAbove / s.degreeHoursHeating : 0;
    out.push({
      ...s,
      circuit: circuitName,
      usage_kwh: usage,
      cost_gbp: cost,
      co2_kg: c.co2_kg ?? 0,
      wasteShare: round(share, 4),
      wastedKwh: round(usage * share, 1),
      wastedGbp: round(cost * share, 2),
      kwhPerDegreeHour: s.degreeHoursHeating > 0 ? round(usage / s.degreeHoursHeating, 2) : null,
    });
  }
  return out.sort((a, b) => b.wastedGbp - a.wastedGbp);
}
