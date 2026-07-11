import type { ConsumptionRow, Organisation } from "@/lib/data-store";
import type { ResolvedProfile } from "./profile";

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
): CompletenessResult {
  const missingThreshold = org?.completeness_missing_pct ?? 10;
  const flatlineThreshold = org?.completeness_flatline_hours ?? 24;
  const dayCount = daysBetween(start, end);
  const expectedSlots = dayCount * 48;

  // Build a chronologically ordered flat series (null for missing)
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);
  const byDate = new Map<string, (number | null)[]>();
  for (const r of rows) {
    if (r.interval_date < startISO || r.interval_date > endISO) continue;
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

  const series: (number | null)[] = [];
  const cursor = new Date(start);
  for (let d = 0; d < dayCount; d++) {
    const iso = cursor.toISOString().slice(0, 10);
    const day = byDate.get(iso);
    if (day) series.push(...day);
    else for (let i = 0; i < 48; i++) series.push(null);
    cursor.setDate(cursor.getDate() + 1);
  }

  const presentSlots = series.filter((v) => v != null).length;
  const missingPct = expectedSlots === 0 ? 0 : ((expectedSlots - presentSlots) / expectedSlots) * 100;

  // Longest run of absolute 0 (in half-hour slots)
  let longestZeroSlots = 0;
  let run = 0;
  for (const v of series) {
    if (v === 0) { run++; if (run > longestZeroSlots) longestZeroSlots = run; }
    else run = 0;
  }
  const longestFlatlineHours = longestZeroSlots / 2;

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