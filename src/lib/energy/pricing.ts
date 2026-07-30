import type { Building, ConsumptionRow } from "@/lib/data-store";
import { classifyUtility } from "./league";

// --- Products ---------------------------------------------------------------

export type ProductKey = "agile" | "outgoing" | "tracker" | "flexible";

export interface ProductDef {
  key: ProductKey;
  /** Octopus product code */
  code: string;
  label: string;
  short: string;
  direction: "import" | "export";
  /** true when the product publishes a distinct price every half hour */
  halfHourly: boolean;
  /** Octopus returns several payment methods for flat products */
  paymentMethod?: string;
}

export const PRODUCTS: Record<ProductKey, ProductDef> = {
  agile: {
    key: "agile",
    code: "AGILE-24-10-01",
    label: "Agile Octopus",
    short: "Agile",
    direction: "import",
    halfHourly: true,
  },
  outgoing: {
    key: "outgoing",
    code: "AGILE-OUTGOING-19-05-13",
    label: "Agile Outgoing Octopus",
    short: "Agile Export",
    direction: "export",
    halfHourly: true,
  },
  tracker: {
    key: "tracker",
    code: "SILVER-24-12-31",
    label: "Octopus Tracker",
    short: "Tracker",
    direction: "import",
    halfHourly: false,
  },
  flexible: {
    key: "flexible",
    code: "VAR-22-11-01",
    label: "Flexible Octopus",
    short: "Flexible",
    direction: "import",
    halfHourly: false,
    paymentMethod: "DIRECT_DEBIT",
  },
};

export const PRODUCT_KEYS: ProductKey[] = ["agile", "outgoing", "tracker", "flexible"];

export function tariffCode(product: ProductDef, region: string): string {
  return `E-1R-${product.code}-${region}`;
}

// --- Regions ----------------------------------------------------------------

export interface GspRegion { code: string; name: string }

export const GSP_REGIONS: GspRegion[] = [
  { code: "A", name: "Eastern England" },
  { code: "B", name: "East Midlands" },
  { code: "C", name: "London" },
  { code: "D", name: "Merseyside & North Wales" },
  { code: "E", name: "West Midlands" },
  { code: "F", name: "North East England" },
  { code: "G", name: "North West England" },
  { code: "H", name: "Southern England" },
  { code: "J", name: "South East England" },
  { code: "K", name: "South Wales" },
  { code: "L", name: "South West England" },
  { code: "M", name: "Yorkshire" },
  { code: "N", name: "Southern Scotland" },
  { code: "P", name: "Northern Scotland" },
];

export const DEFAULT_REGION = "C";

export function regionName(code: string | null | undefined): string {
  return GSP_REGIONS.find((r) => r.code === code)?.name ?? "Unknown region";
}

/** Region for a building, falling back to the org default then London. */
export function regionForBuilding(
  building: Building | undefined,
  orgDefault: string | null | undefined,
): string {
  return building?.gsp_region_code || orgDefault || DEFAULT_REGION;
}

// --- Rate series ------------------------------------------------------------

export interface UnitRate {
  product_code: string;
  region_code: string;
  valid_from: string;   // ISO UTC
  valid_to: string | null;
  value_inc_vat: number;
  value_exc_vat: number;
}

export interface RateSeries {
  /** sorted ascending by valid_from (ms) */
  points: Array<{ from: number; to: number; price: number }>;
}

export const HALF_HOUR_MS = 30 * 60 * 1000;

export function buildSeries(rates: UnitRate[]): RateSeries {
  const points = rates
    .map((r) => ({
      from: Date.parse(r.valid_from),
      to: r.valid_to ? Date.parse(r.valid_to) : Number.POSITIVE_INFINITY,
      price: Number(r.value_inc_vat),
    }))
    .filter((p) => Number.isFinite(p.from))
    .sort((a, b) => a.from - b.from);
  return { points };
}

/** Price (p/kWh inc VAT) applicable at a timestamp, or null when unknown. */
export function priceAt(series: RateSeries, t: number): number | null {
  const pts = series.points;
  if (pts.length === 0) return null;
  let lo = 0;
  let hi = pts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].from <= t) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (found < 0) return null;
  const p = pts[found];
  if (t >= p.to) return null;
  return p.price;
}

// --- Day curve --------------------------------------------------------------

export interface Slot {
  index: number;      // 0..47 within the day
  start: number;      // ms UTC
  label: string;      // UK local HH:MM
  price: number;
}

export function ukTimeLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(new Date(ms));
}

export function ukDateLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London",
  }).format(new Date(ms));
}

/** Half-hour slots covering [startMs, startMs + hours) with a known price. */
export function slotsForWindow(series: RateSeries, startMs: number, hours: number): Slot[] {
  const out: Slot[] = [];
  const n = Math.round((hours * 60) / 30);
  for (let i = 0; i < n; i++) {
    const t = startMs + i * HALF_HOUR_MS;
    const p = priceAt(series, t);
    if (p == null) continue;
    out.push({ index: i, start: t, label: ukTimeLabel(t), price: p });
  }
  return out;
}

/** Midnight (UK local) of the day containing `ms`, expressed in ms UTC. */
export function ukMidnight(ms: number, dayOffset = 0): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/London",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const guess = Date.UTC(get("year"), get("month") - 1, get("day") + dayOffset);
  // Correct for BST: step back until the UK-local hour reads 00.
  for (const shift of [0, -1, -2, 1, 2]) {
    const cand = guess + shift * 3600_000;
    const hh = ukTimeLabel(cand);
    if (hh === "00:00") return cand;
  }
  return guess;
}

export interface WindowPick { startMs: number; endMs: number; avgPrice: number }

/** Cheapest (or most expensive) contiguous run of `hours` within the slots. */
export function bestWindow(slots: Slot[], hours: number, mode: "cheap" | "expensive" = "cheap"): WindowPick | null {
  const n = Math.round((hours * 60) / 30);
  if (slots.length < n || n <= 0) return null;
  let best: WindowPick | null = null;
  for (let i = 0; i + n <= slots.length; i++) {
    // only consider contiguous runs
    if (slots[i + n - 1].start - slots[i].start !== (n - 1) * HALF_HOUR_MS) continue;
    let sum = 0;
    for (let j = i; j < i + n; j++) sum += slots[j].price;
    const avg = sum / n;
    if (!best || (mode === "cheap" ? avg < best.avgPrice : avg > best.avgPrice)) {
      best = { startMs: slots[i].start, endMs: slots[i + n - 1].start + HALF_HOUR_MS, avgPrice: avg };
    }
  }
  return best;
}

export interface DayStats {
  min: Slot | null;
  max: Slot | null;
  avg: number;
  spread: number;
  negativeSlots: number;
  cheapest1h: WindowPick | null;
  cheapest2h: WindowPick | null;
  cheapest3h: WindowPick | null;
  peakBlock: WindowPick | null;
}

export function dayStats(slots: Slot[]): DayStats {
  if (slots.length === 0) {
    return { min: null, max: null, avg: 0, spread: 0, negativeSlots: 0,
      cheapest1h: null, cheapest2h: null, cheapest3h: null, peakBlock: null };
  }
  let min = slots[0];
  let max = slots[0];
  let sum = 0;
  let neg = 0;
  for (const s of slots) {
    if (s.price < min.price) min = s;
    if (s.price > max.price) max = s;
    sum += s.price;
    if (s.price <= 0) neg++;
  }
  return {
    min,
    max,
    avg: sum / slots.length,
    spread: max.price - min.price,
    negativeSlots: neg,
    cheapest1h: bestWindow(slots, 1),
    cheapest2h: bestWindow(slots, 2),
    cheapest3h: bestWindow(slots, 3),
    peakBlock: bestWindow(slots, 3, "expensive"),
  };
}

// --- Costing your own consumption ------------------------------------------

export interface MeterConsumptionSlot { ms: number; kwh: number }

export interface BuildingLoad {
  buildingId: string | null;
  buildingName: string;
  region: string;
  slots: MeterConsumptionSlot[];
}

/**
 * Explode electricity consumption rows into half-hourly (timestamp, kWh) pairs
 * per building. Slot i of a date maps to UTC date + i×30min, matching the rest
 * of the analytics engine so nothing shifts by timezone.
 */
export function buildElectricityLoad(opts: {
  rows: ConsumptionRow[];
  buildings: Building[];
  orgId: string;
  orgDefaultRegion: string | null | undefined;
  fromISO: string;
  toISO: string;
  buildingIdFor?: (meterName: string) => string | null;
  factorFor?: (meterName: string) => number;
  direction?: "import" | "export";
}): BuildingLoad[] {
  const { rows, buildings, orgId, orgDefaultRegion, fromISO, toISO } = opts;
  const byId = new Map(buildings.map((b) => [b.id, b] as const));
  const groups = new Map<string, BuildingLoad>();

  for (const r of rows) {
    if (r.organization_id !== orgId) continue;
    if (r.interval_date < fromISO || r.interval_date > toISO) continue;
    const u = classifyUtility(r.variable_category);
    const wantSolar = opts.direction === "export";
    if (wantSolar ? u !== "solar" : u !== "electricity") continue;

    const bid = opts.buildingIdFor?.(r.meter_name) ?? r.building_id ?? null;
    const key = bid ?? "unassigned";
    let g = groups.get(key);
    if (!g) {
      const b = bid ? byId.get(bid) : undefined;
      g = {
        buildingId: bid,
        buildingName: b?.custom_display_name ?? "Unassigned",
        region: regionForBuilding(b, orgDefaultRegion),
        slots: [],
      };
      groups.set(key, g);
    }
    const f = opts.factorFor?.(r.meter_name) ?? r.meter_factor ?? 1;
    const [y, m, d] = r.interval_date.split("-").map(Number);
    const base = Date.UTC(y, m - 1, d);
    for (let i = 0; i < 48; i++) {
      const v = r.half_hourly_values[i];
      if (v == null) continue;
      g.slots.push({ ms: base + i * HALF_HOUR_MS, kwh: v * f });
    }
  }
  return Array.from(groups.values());
}

export interface CostResult {
  totalKwh: number;
  costedKwh: number;
  costPence: number;
  /** price-weighted average unit rate in p/kWh */
  weightedRate: number;
  coveragePct: number;
  byDay: Map<string, { kwh: number; pence: number }>;
  bySlot: number[]; // 48 slots — pence spent per half-hour-of-day
  kwhBySlot: number[];
}

export function costLoad(slots: MeterConsumptionSlot[], series: RateSeries): CostResult {
  const byDay = new Map<string, { kwh: number; pence: number }>();
  const bySlot = new Array(48).fill(0);
  const kwhBySlot = new Array(48).fill(0);
  let totalKwh = 0;
  let costedKwh = 0;
  let pence = 0;
  for (const s of slots) {
    totalKwh += s.kwh;
    const p = priceAt(series, s.ms);
    const day = new Date(s.ms).toISOString().slice(0, 10);
    const idx = Math.floor((s.ms % 86_400_000) / HALF_HOUR_MS);
    kwhBySlot[idx] += s.kwh;
    const bucket = byDay.get(day) ?? { kwh: 0, pence: 0 };
    bucket.kwh += s.kwh;
    if (p != null) {
      costedKwh += s.kwh;
      const c = s.kwh * p;
      pence += c;
      bucket.pence += c;
      bySlot[idx] += c;
    }
    byDay.set(day, bucket);
  }
  return {
    totalKwh,
    costedKwh,
    costPence: pence,
    weightedRate: costedKwh > 0 ? pence / costedKwh : 0,
    coveragePct: totalKwh > 0 ? (costedKwh / totalKwh) * 100 : 0,
    byDay,
    bySlot,
    kwhBySlot,
  };
}

/** Flat-tariff comparison at a fixed p/kWh. */
export function costFlat(totalKwh: number, pencePerKwh: number): number {
  return totalKwh * pencePerKwh;
}

// --- Shift advisor ----------------------------------------------------------

export interface ShiftAdvice {
  peakSlotIndices: number[];
  cheapSlotIndices: number[];
  peakLabel: string;
  cheapLabel: string;
  shiftableKwh: number;
  avgPeakRate: number;
  avgCheapRate: number;
  savingPence: number;
}

function slotLabelFromIndex(idx: number): string {
  const h = Math.floor(idx / 2);
  const m = idx % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

function rangeLabel(indices: number[]): string {
  if (indices.length === 0) return "—";
  const start = indices[0];
  const end = indices[indices.length - 1] + 1;
  return `${slotLabelFromIndex(start)}–${slotLabelFromIndex(end % 48)}`;
}

/**
 * Averages the Agile price by half-hour-of-day over the period, then models
 * moving a share of the load in the priciest N-hour block into the cheapest.
 */
export function shiftAdvice(
  load: MeterConsumptionSlot[],
  series: RateSeries,
  opts: { blockHours: number; shiftablePct: number },
): ShiftAdvice | null {
  const slotCount = Math.max(1, Math.round((opts.blockHours * 60) / 30));
  const rateSum = new Array(48).fill(0);
  const rateN = new Array(48).fill(0);
  const kwhBySlot = new Array(48).fill(0);
  let any = false;
  for (const s of load) {
    const idx = Math.floor((s.ms % 86_400_000) / HALF_HOUR_MS);
    kwhBySlot[idx] += s.kwh;
    const p = priceAt(series, s.ms);
    if (p != null) { rateSum[idx] += p; rateN[idx] += 1; any = true; }
  }
  if (!any) return null;
  const avgRate = rateSum.map((v, i) => (rateN[i] > 0 ? v / rateN[i] : NaN));

  let peakStart = -1;
  let peakVal = -Infinity;
  let cheapStart = -1;
  let cheapVal = Infinity;
  for (let i = 0; i + slotCount <= 48; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i; j < i + slotCount; j++) {
      if (!Number.isFinite(avgRate[j])) { ok = false; break; }
      sum += avgRate[j];
    }
    if (!ok) continue;
    const avg = sum / slotCount;
    if (avg > peakVal) { peakVal = avg; peakStart = i; }
    if (avg < cheapVal) { cheapVal = avg; cheapStart = i; }
  }
  if (peakStart < 0 || cheapStart < 0) return null;

  const peakIdx = Array.from({ length: slotCount }, (_, k) => peakStart + k);
  const cheapIdx = Array.from({ length: slotCount }, (_, k) => cheapStart + k);
  const peakKwh = peakIdx.reduce((a, i) => a + kwhBySlot[i], 0);
  const shiftable = (peakKwh * opts.shiftablePct) / 100;

  return {
    peakSlotIndices: peakIdx,
    cheapSlotIndices: cheapIdx,
    peakLabel: rangeLabel(peakIdx),
    cheapLabel: rangeLabel(cheapIdx),
    shiftableKwh: shiftable,
    avgPeakRate: peakVal,
    avgCheapRate: cheapVal,
    savingPence: shiftable * (peakVal - cheapVal),
  };
}

// --- Formatting -------------------------------------------------------------

export function fmtPence(p: number, dp = 2): string {
  return `${p.toFixed(dp)}p`;
}

export function fmtGbp(pence: number): string {
  const gbp = pence / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP",
    maximumFractionDigits: Math.abs(gbp) >= 100 ? 0 : 2,
  }).format(gbp);
}

/** Colour band for a price relative to a day's distribution. */
export function priceBand(price: number, stats: DayStats): "cheap" | "mid" | "expensive" | "plunge" {
  if (price <= 0) return "plunge";
  if (stats.spread <= 0) return "mid";
  const pos = (price - (stats.min?.price ?? 0)) / stats.spread;
  if (pos <= 0.33) return "cheap";
  if (pos >= 0.75) return "expensive";
  return "mid";
}

// --- Typical weekday consumption profile ------------------------------------

export interface WeekdayProfile {
  /** 48 slots of mean kWh for the same weekday, or null when unavailable. */
  bySlot: number[] | null;
  /** ISO dates that fed the average, most recent first. */
  dates: string[];
  samples: number;
  totalKwh: number;
}

/**
 * Average half-hourly electricity consumption for the same day of week as
 * `targetISO`, using the last 4 matching dates that have data. Mirrors the
 * baseline rule used by the data-integrity check.
 */
export function weekdayProfile(opts: {
  rows: ConsumptionRow[];
  orgId: string;
  targetISO: string;
  buildingId?: string | "all";
  buildingIdFor?: (meterName: string) => string | null;
  factorFor?: (meterName: string) => number;
}): WeekdayProfile {
  const { rows, orgId, targetISO } = opts;
  const want = opts.buildingId && opts.buildingId !== "all" ? opts.buildingId : null;

  // date -> 48 slot totals (kWh) across all matching meters
  const byDate = new Map<string, number[]>();
  for (const r of rows) {
    if (r.organization_id !== orgId) continue;
    if (classifyUtility(r.variable_category) !== "electricity") continue;
    const bid = opts.buildingIdFor?.(r.meter_name) ?? r.building_id ?? null;
    if (want && bid !== want) continue;
    const f = opts.factorFor?.(r.meter_name) ?? r.meter_factor ?? 1;
    let acc = byDate.get(r.interval_date);
    if (!acc) {
      acc = new Array(48).fill(0);
      byDate.set(r.interval_date, acc);
    }
    for (let i = 0; i < 48; i++) {
      const v = r.half_hourly_values[i];
      if (v == null) continue;
      acc[i] += v * f;
    }
  }

  const [ty, tm, td] = targetISO.split("-").map(Number);
  const cursor = new Date(Date.UTC(ty, tm - 1, td));
  const dates: string[] = [];
  const totals: number[][] = [];
  let scanned = 0;
  while (totals.length < 4 && scanned < 26) {
    const iso = cursor.toISOString().slice(0, 10);
    const acc = byDate.get(iso);
    if (acc && acc.some((v) => v > 0)) {
      dates.push(iso);
      totals.push(acc);
    }
    cursor.setUTCDate(cursor.getUTCDate() - 7);
    scanned++;
  }

  if (totals.length === 0) return { bySlot: null, dates: [], samples: 0, totalKwh: 0 };

  const bySlot = new Array(48).fill(0);
  for (const t of totals) for (let i = 0; i < 48; i++) bySlot[i] += t[i];
  for (let i = 0; i < 48; i++) bySlot[i] /= totals.length;
  return {
    bySlot,
    dates,
    samples: totals.length,
    totalKwh: bySlot.reduce((a, b) => a + b, 0),
  };
}