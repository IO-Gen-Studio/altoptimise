import type { ConsumptionRow } from "@/lib/data-store";
import { isBaseloadSlot, isPeakSeason, type ResolvedProfile } from "./profile";

export interface ScoreResult {
  score: number;
  idleWaste: number;
  oohEnergy: number;
  activeEnergy: number;
  floor: number;
  anomalies: { date: string; slot: number; value: number; excess: number }[];
  seasonMode: "peak" | "off_peak";
  /** total number of waste events (anomalies list is truncated for display) */
  anomalyCount: number;
  /** number of half-hourly slots classified as baseload / active */
  baseloadSlotCount: number;
  activeSlotCount: number;
  /** waste threshold = floor * 1.5 (kWh per half hour) */
  threshold: number;
}

const ANOMALY_MULTIPLIER = 1.5;

export const WASTE_MULTIPLIER = ANOMALY_MULTIPLIER;
export const FLOOR_PERCENTILE = 10;

function slotDate(dateISO: string): Date {
  // Interpret as UTC midnight so weekday/month checks match the ISO date
  // regardless of the viewer's timezone.
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export function computeBaseloadScore(
  rows: ConsumptionRow[],
  profile: ResolvedProfile,
  startISO: string,
  endISO: string,
): ScoreResult {
  const baseloadVals: number[] = [];
  const activeVals: number[] = [];
  const baseloadSlots: { date: string; slot: number; value: number }[] = [];
  let peakDays = 0;
  let offPeakDays = 0;

  for (const r of rows) {
    if (r.interval_date < startISO || r.interval_date > endISO) continue;
    const d = slotDate(r.interval_date);
    if (isPeakSeason(profile, d)) peakDays++;
    else offPeakDays++;
    for (let s = 0; s < 48; s++) {
      const v = r.half_hourly_values[s];
      if (v == null) continue;
      const scaled = v * (r.meter_factor ?? 1);
      if (isBaseloadSlot(profile, d, s)) {
        baseloadVals.push(scaled);
        baseloadSlots.push({ date: r.interval_date, slot: s, value: scaled });
      } else {
        activeVals.push(scaled);
      }
    }
  }

  const seasonMode: "peak" | "off_peak" = peakDays >= offPeakDays ? "peak" : "off_peak";
  // Floor: peak season → P10 of baseload; off-peak season on evening_peak → ~0
  const useAbsoluteFloor = profile.profileType === "evening_peak" && seasonMode === "off_peak";
  const floor = useAbsoluteFloor ? 0 : percentile(baseloadVals, 10);

  const oohEnergy = baseloadVals.reduce((a, b) => a + b, 0);
  const activeEnergy = activeVals.reduce((a, b) => a + b, 0);
  const threshold = floor * ANOMALY_MULTIPLIER;

  let idleWaste = 0;
  const anomalies: ScoreResult["anomalies"] = [];
  for (const b of baseloadSlots) {
    const excess = b.value - threshold;
    if (excess > 0) {
      idleWaste += excess;
      anomalies.push({ ...b, excess });
    }
  }

  const score = oohEnergy > 0
    ? Math.max(0, Math.min(100, (1 - idleWaste / oohEnergy) * 100))
    : 100;

  anomalies.sort((a, b) => b.excess - a.excess);
  return {
    score,
    idleWaste,
    oohEnergy,
    activeEnergy,
    floor,
    anomalies: anomalies.slice(0, 10),
    seasonMode,
    anomalyCount: anomalies.length,
    baseloadSlotCount: baseloadVals.length,
    activeSlotCount: activeVals.length,
    threshold,
  };
}

export interface AvgDaySlot {
  slot: number;
  /** average kWh in this half-hour across the window */
  avgKwh: number;
  /** share of days where this slot fell in the baseload (out-of-hours) zone, 0..1 */
  baseloadShare: number;
}

/** Average 48-slot day shape, plus how often each slot is out-of-hours. */
export function computeAvgDayProfile(
  rows: ConsumptionRow[],
  profile: ResolvedProfile,
  startISO: string,
  endISO: string,
): AvgDaySlot[] {
  const sum = new Array(48).fill(0);
  const count = new Array(48).fill(0);
  const baseHits = new Array(48).fill(0);
  for (const r of rows) {
    if (r.interval_date < startISO || r.interval_date > endISO) continue;
    const d = slotDate(r.interval_date);
    for (let s = 0; s < 48; s++) {
      const v = r.half_hourly_values[s];
      if (v == null) continue;
      sum[s] += v * (r.meter_factor ?? 1);
      count[s]++;
      if (isBaseloadSlot(profile, d, s)) baseHits[s]++;
    }
  }
  return Array.from({ length: 48 }, (_, s) => ({
    slot: s,
    avgKwh: count[s] > 0 ? sum[s] / count[s] : 0,
    baseloadShare: count[s] > 0 ? baseHits[s] / count[s] : 0,
  }));
}