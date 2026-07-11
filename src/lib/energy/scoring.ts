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
}

const ANOMALY_MULTIPLIER = 1.5;

function slotDate(dateISO: string): Date {
  // Interpret as local date to avoid TZ drift when checking weekdays.
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d);
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
  return { score, idleWaste, oohEnergy, activeEnergy, floor, anomalies: anomalies.slice(0, 10), seasonMode };
}