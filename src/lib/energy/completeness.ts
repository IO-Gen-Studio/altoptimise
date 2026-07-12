import type { ConsumptionRow, Organisation } from "@/lib/data-store";
import { isActiveSlot, type ResolvedProfile } from "./profile";

export type CompletenessStatus = "ok" | "incomplete" | "telemetry_offline";

export interface CompletenessResult {
  status: CompletenessStatus;
  expectedSlots: number;
  presentSlots: number;
  missingPct: number;
  longestFlatlineHours: number;
  reason?: string;
}

export function utilityKind(category: string): "electricity" | "gas" | "water" | "other" {
  const c = (category || "").toLowerCase();
  if (c.includes("electric")) return "electricity";
  if (c.includes("gas")) return "gas";
  if (c.includes("water")) return "water";
  return "other";
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/**
 * Compute data-completeness diagnostics for a specific meter within [start,end].
 * Rows must already be filtered to the meter of interest.
 */
export function checkCompleteness(
  rows: ConsumptionRow[],
  utility: "electricity" | "gas" | "water" | "other",
  start: Date,
  end: Date,
  org: Organisation | undefined,
  profile: ResolvedProfile,
  firstSeenISO?: string,
): CompletenessResult {
  const missingThreshold = org?.completeness_missing_pct ?? 10;
  const flatlineThreshold = org?.completeness_flatline_hours ?? 24;
  // Clamp window start to meter's first-seen date so newly onboarded meters
  // aren't unfairly flagged for absence before they existed.
  let effectiveStart = start;
  if (firstSeenISO) {
    const [fy, fm, fd] = firstSeenISO.split("-").map(Number);
    const firstSeen = new Date(fy, fm - 1, fd);
    if (firstSeen > effectiveStart) effectiveStart = firstSeen;
  }
  if (effectiveStart > end) {
    return { status: "ok", expectedSlots: 0, presentSlots: 0, missingPct: 0, longestFlatlineHours: 0 };
  }
  const dayCount = daysBetween(effectiveStart, end);
  const expectedSlots = dayCount * 48;

  // Build a chronologically ordered flat series (null for missing)
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);
  const effStartISO = effectiveStart.toISOString().slice(0, 10);
  const byDate = new Map<string, (number | null)[]>();
  for (const r of rows) {
    if (r.interval_date < effStartISO || r.interval_date > endISO) continue;
    // Merge duplicates by summing (multiple meters shouldn't occur here, but safe)
    const existing = byDate.get(r.interval_date);
    if (!existing) {
      byDate.set(r.interval_date, [...r.half_hourly_values]);
    } else {
      for (let i = 0; i < 48; i++) {
        const a = existing[i];
        const b = r.half_hourly_values[i];
        existing[i] = a == null && b == null ? null : (a ?? 0) + (b ?? 0);
      }
    }
  }

  // Build series + parallel active-hours flag array
  const series: (number | null)[] = [];
  const active: boolean[] = [];
  const cursor = new Date(effectiveStart);
  for (let d = 0; d < dayCount; d++) {
    const iso = cursor.toISOString().slice(0, 10);
    const day = byDate.get(iso);
    for (let i = 0; i < 48; i++) {
      series.push(day ? day[i] : null);
      active.push(isActiveSlot(profile, cursor, i));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const presentSlots = series.filter((v) => v != null).length;
  const missingPct = expectedSlots === 0 ? 0 : ((expectedSlots - presentSlots) / expectedSlots) * 100;

  // Longest run of 0 during ACTIVE hours only. Baseload/overnight zeros are
  // normal for many meters and must not trigger a telemetry-offline flag.
  let longestZeroSlots = 0;
  let run = 0;
  for (let i = 0; i < series.length; i++) {
    if (active[i] && series[i] === 0) {
      run++;
      if (run > longestZeroSlots) longestZeroSlots = run;
    } else {
      run = 0;
    }
  }
  const longestFlatlineHours = longestZeroSlots / 2;
  void startISO;

  if (missingPct > missingThreshold) {
    return {
      status: "incomplete",
      expectedSlots, presentSlots, missingPct, longestFlatlineHours,
      reason: `${missingPct.toFixed(1)}% of intervals missing (> ${missingThreshold}%)`,
    };
  }

  // Flatline check: skip for gas when window overlaps summer gas months
  const skipFlatlineForGas =
    utility === "gas" &&
    monthRange(start, end).some((m) => profile.summerGasMonths.includes(m));

  if ((utility === "electricity" || utility === "water") && longestFlatlineHours >= flatlineThreshold) {
    return {
      status: "telemetry_offline",
      expectedSlots, presentSlots, missingPct, longestFlatlineHours,
      reason: `Meter recorded 0 for ${longestFlatlineHours.toFixed(1)}h continuously (≥ ${flatlineThreshold}h)`,
    };
  }
  if (utility === "gas" && !skipFlatlineForGas && longestFlatlineHours >= flatlineThreshold * 3) {
    // Non-summer gas: still flag extremely long flatlines (3× threshold)
    return {
      status: "telemetry_offline",
      expectedSlots, presentSlots, missingPct, longestFlatlineHours,
      reason: `Gas meter flat 0 for ${longestFlatlineHours.toFixed(1)}h outside summer season`,
    };
  }

  return { status: "ok", expectedSlots, presentSlots, missingPct, longestFlatlineHours };
}

function monthRange(start: Date, end: Date): number[] {
  const out = new Set<number>();
  const c = new Date(start);
  while (c <= end) { out.add(c.getMonth() + 1); c.setDate(c.getDate() + 1); }
  return Array.from(out);
}