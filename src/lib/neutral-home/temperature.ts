import Papa from "papaparse";
import * as XLSX from "xlsx";

/** One hour of readings for one room, aggregated from minute-level data. */
export interface RoomHourAgg {
  room_name: string;
  hour_ts: string;
  temp_min: number | null;
  temp_avg: number | null;
  temp_max: number | null;
  set_temp_avg: number | null;
  on_share: number | null;
  reading_count: number;
}

export interface TemperatureReport {
  fileName: string;
  rooms: string[];
  roomsWithoutReadings: string[];
  hours: RoomHourAgg[];
  rowsRead: number;
  rowsDropped: number;
  startISO: string | null;
  endISO: string | null;
  missingColumns: string[];
}

interface Acc {
  room: string;
  hour: string;
  min: number;
  max: number;
  sum: number;
  n: number;
  setSum: number;
  setN: number;
  onN: number;
  stateN: number;
}

const HEADERS = {
  set: ["set temp", "set temperature", "setpoint", "set point"],
  room: ["room", "room name", "zone", "location"],
  actual: ["actual temp", "actual temperature", "temperature", "temp"],
  time: ["date and time", "datetime", "date/time", "timestamp", "date"],
  state: ["state", "status", "output"],
};

function pickKey(keys: string[], candidates: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const c of candidates) {
    const hit = keys.find((k) => norm(k) === c);
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = keys.find((k) => norm(k).includes(c));
    if (hit) return hit;
  }
  return null;
}

/** "2026-07-01 00:01:00" or "01/07/2026 00:01" → hour-truncated ISO (treated as UTC). */
export function hourKey(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const iso = raw.toISOString();
    return `${iso.slice(0, 13)}:00:00.000Z`;
  }
  const s = String(raw).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]!.padStart(2, "0")}:00:00.000Z`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (m)
    return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${m[4]!.padStart(2, "0")}:00:00.000Z`;
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

class Aggregator {
  private map = new Map<string, Acc>();
  rooms = new Set<string>();
  roomsWithData = new Set<string>();
  rowsRead = 0;
  rowsDropped = 0;
  minHour: string | null = null;
  maxHour: string | null = null;

  add(room: string, hour: string, actual: number | null, set: number | null, on: boolean | null) {
    this.rooms.add(room);
    if (actual == null) {
      this.rowsDropped += 1;
      return;
    }
    this.roomsWithData.add(room);
    if (this.minHour == null || hour < this.minHour) this.minHour = hour;
    if (this.maxHour == null || hour > this.maxHour) this.maxHour = hour;
    const key = `${room}\u0000${hour}`;
    let a = this.map.get(key);
    if (!a) {
      a = {
        room,
        hour,
        min: actual,
        max: actual,
        sum: 0,
        n: 0,
        setSum: 0,
        setN: 0,
        onN: 0,
        stateN: 0,
      };
      this.map.set(key, a);
    }
    a.min = Math.min(a.min, actual);
    a.max = Math.max(a.max, actual);
    a.sum += actual;
    a.n += 1;
    if (set != null) {
      a.setSum += set;
      a.setN += 1;
    }
    if (on != null) {
      a.stateN += 1;
      if (on) a.onN += 1;
    }
  }

  hours(): RoomHourAgg[] {
    const round = (v: number, dp = 2) => Number(v.toFixed(dp));
    return Array.from(this.map.values())
      .map((a) => ({
        room_name: a.room,
        hour_ts: a.hour,
        temp_min: round(a.min),
        temp_avg: round(a.sum / a.n),
        temp_max: round(a.max),
        set_temp_avg: a.setN ? round(a.setSum / a.setN) : null,
        on_share: a.stateN ? round(a.onN / a.stateN, 4) : null,
        reading_count: a.n,
      }))
      .sort((x, y) =>
        x.room_name === y.room_name
          ? x.hour_ts.localeCompare(y.hour_ts)
          : x.room_name.localeCompare(y.room_name),
      );
  }
}

function isOn(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "on" || s === "1" || s === "true" || s === "heating") return true;
  if (s === "off" || s === "0" || s === "false") return false;
  return null;
}

function feed(agg: Aggregator, rows: Record<string, unknown>[], keys: ReturnType<typeof mapKeys>) {
  for (const row of rows) {
    agg.rowsRead += 1;
    const room = String(row[keys.room!] ?? "").trim();
    if (!room) {
      agg.rowsDropped += 1;
      continue;
    }
    const hour = keys.time ? hourKey(row[keys.time]) : null;
    if (!hour) {
      agg.rooms.add(room);
      agg.rowsDropped += 1;
      continue;
    }
    agg.add(
      room,
      hour,
      keys.actual ? num(row[keys.actual]) : null,
      keys.set ? num(row[keys.set]) : null,
      keys.state ? isOn(row[keys.state]) : null,
    );
  }
}

function mapKeys(headerKeys: string[]) {
  return {
    room: pickKey(headerKeys, HEADERS.room),
    actual: pickKey(headerKeys, HEADERS.actual),
    time: pickKey(headerKeys, HEADERS.time),
    set: pickKey(headerKeys, HEADERS.set),
    state: pickKey(headerKeys, HEADERS.state),
  };
}

function missing(keys: ReturnType<typeof mapKeys>): string[] {
  const out: string[] = [];
  if (!keys.room) out.push("Room");
  if (!keys.actual) out.push("Actual Temp");
  if (!keys.time) out.push("Date and Time");
  return out;
}

function finish(file: File, agg: Aggregator, missingColumns: string[]): TemperatureReport {
  const rooms = Array.from(agg.rooms).sort((a, b) => a.localeCompare(b));
  return {
    fileName: file.name,
    rooms: Array.from(agg.roomsWithData).sort((a, b) => a.localeCompare(b)),
    roomsWithoutReadings: rooms.filter((r) => !agg.roomsWithData.has(r)),
    hours: agg.hours(),
    rowsRead: agg.rowsRead,
    rowsDropped: agg.rowsDropped,
    startISO: agg.minHour ? agg.minHour.slice(0, 10) : null,
    endISO: agg.maxHour ? agg.maxHour.slice(0, 10) : null,
    missingColumns,
  };
}

/**
 * Streams a (potentially very large) minute-level temperature export and
 * aggregates it to one row per room per hour in the browser.
 */
export function parseTemperatureReport(
  file: File,
  onProgress?: (rowsRead: number) => void,
): Promise<TemperatureReport> {
  const isCsv = /\.csv$/i.test(file.name);
  if (!isCsv) {
    return file.arrayBuffer().then((buf) => {
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const agg = new Aggregator();
      const keys = mapKeys(Object.keys(rows[0] ?? {}));
      const miss = missing(keys);
      if (!miss.length) feed(agg, rows, keys);
      onProgress?.(rows.length);
      return finish(file, agg, miss);
    });
  }

  return new Promise((resolve, reject) => {
    const agg = new Aggregator();
    let keys: ReturnType<typeof mapKeys> | null = null;
    let miss: string[] = [];
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      chunkSize: 1024 * 1024,
      chunk: (results, parser) => {
        if (!keys) {
          keys = mapKeys(results.meta.fields ?? Object.keys(results.data[0] ?? {}));
          miss = missing(keys);
          if (miss.length) {
            parser.abort();
            return;
          }
        }
        feed(agg, results.data, keys);
        onProgress?.(agg.rowsRead);
      },
      complete: () => resolve(finish(file, agg, miss)),
      error: (err) => reject(err),
    });
  });
}

/** Merge several temperature files into one aggregate set (later files win per key). */
export function mergeTemperatureReports(reports: TemperatureReport[]): TemperatureReport | null {
  if (!reports.length) return null;
  if (reports.length === 1) return reports[0]!;
  const byKey = new Map<string, RoomHourAgg>();
  const rooms = new Set<string>();
  const without = new Set<string>();
  let rowsRead = 0;
  let rowsDropped = 0;
  let start: string | null = null;
  let end: string | null = null;
  const missingColumns = new Set<string>();
  for (const r of reports) {
    for (const h of r.hours) byKey.set(`${h.room_name}\u0000${h.hour_ts}`, h);
    r.rooms.forEach((x) => rooms.add(x));
    r.roomsWithoutReadings.forEach((x) => without.add(x));
    r.missingColumns.forEach((x) => missingColumns.add(x));
    rowsRead += r.rowsRead;
    rowsDropped += r.rowsDropped;
    if (r.startISO && (!start || r.startISO < start)) start = r.startISO;
    if (r.endISO && (!end || r.endISO > end)) end = r.endISO;
  }
  return {
    fileName: reports.map((r) => r.fileName).join(", "),
    rooms: Array.from(rooms).sort((a, b) => a.localeCompare(b)),
    roomsWithoutReadings: Array.from(without).filter((x) => !rooms.has(x)),
    hours: Array.from(byKey.values()),
    rowsRead,
    rowsDropped,
    startISO: start,
    endISO: end,
    missingColumns: Array.from(missingColumns),
  };
}
