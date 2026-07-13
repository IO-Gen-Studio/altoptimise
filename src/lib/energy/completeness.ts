import type { ConsumptionRow, Organisation } from "@/lib/data-store";
import { isActiveSlot, isPeakSeason, type ResolvedProfile } from "./profile";

export type CompletenessStatus = "ok" | "incomplete" | "telemetry_offline";
export type IntegrityStatus = "ok" | "spike" | "drop" | "insufficient_history" | "skipped";
export type StagnationStatus = "ok" | "offline" | "stuck_value";

export interface CompletenessResult {
  status: CompletenessStatus;
  expectedSlots: number;
  presentSlots: number;
  missingPct: number;
  longestFlatlineHours: number;
  reason?: string;
  integrity: IntegrityStatus;
  integrityDeltaPct: number;
  integrityBaselineKwh: number;
  integrityTodayKwh: number;
  integrityTodayISO: string | null;
  integrityBaselineDates: string[];
  stagnation: StagnationStatus;
  stuckValueHours: number;
  offlineEventCount: number;
  offlineEventDates: string[];
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
  const flatlineThreshold = 24; // spec: >=24h continuous 0 during active hours
  const stuckIntervalThreshold = 12; // spec: >=12 identical non-zero intervals
  const spikeThreshold = 1.3;
  const dropThreshold = 0.7;
  // Clamp window start to meter's first-seen date so newly onboarded meters
  // aren't unfairly flagged for absence before they existed.
  let effectiveStart = start;
  if (firstSeenISO) {
    const [fy, fm, fd] = firstSeenISO.split("-").map(Number);
    const firstSeen = new Date(fy, fm - 1, fd);
    if (firstSeen > effectiveStart) effectiveStart = firstSeen;
  }
  // Compute integrity + stagnation across the full meter history so
  // offline-event counting isn't artificially limited to the window.
  const integrity = computeIntegrity(rows, utility, end, org, profile);
  const stagnation = computeStagnation(rows, utility, profile, org);

  if (effectiveStart > end) {
    return {
      status: "ok", expectedSlots: 0, presentSlots: 0, missingPct: 0, longestFlatlineHours: 0,
      ...integrity, ...stagnation,
    };
  }
  const dayCount = daysBetween(effectiveStart, end);
  const expectedSlots = dayCount * 48;

  // Build a chronologically ordered flat series (null for missing)
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

  if (missingPct > missingThreshold) {
    return {
      status: "incomplete",
      expectedSlots, presentSlots, missingPct, longestFlatlineHours,
      reason: `${missingPct.toFixed(1)}% of intervals missing (> ${missingThreshold}%)`,
      ...integrity, ...stagnation,
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
      ...integrity, ...stagnation,
    };
  }
  if ((utility === "electricity" || utility === "water") &&
      stagnation.stuckValueHours >= stuckIntervalThreshold / 2) {
    return {
      status: "telemetry_offline",
      expectedSlots, presentSlots, missingPct, longestFlatlineHours,
      reason: `Meter reported the same non-zero value for ${stagnation.stuckValueHours.toFixed(1)}h continuously (≥ ${(stuckIntervalThreshold / 2).toFixed(1)}h)`,
      ...integrity, ...stagnation,
    };
  }
  if (utility === "gas" && !skipFlatlineForGas && longestFlatlineHours >= flatlineThreshold * 3) {
    // Non-summer gas: still flag extremely long flatlines (3× threshold)
    return {
      status: "telemetry_offline",
      expectedSlots, presentSlots, missingPct, longestFlatlineHours,
      reason: `Gas meter flat 0 for ${longestFlatlineHours.toFixed(1)}h outside summer season`,
      ...integrity, ...stagnation,
    };
  }

  return {
    status: "ok", expectedSlots, presentSlots, missingPct, longestFlatlineHours,
    ...integrity, ...stagnation,
  };
}

// --- Statistical integrity (spike/drop vs 4-week same-DOW baseline) --------

interface IntegrityFields {
  integrity: IntegrityStatus;
  integrityDeltaPct: number;
  integrityBaselineKwh: number;
  integrityTodayKwh: number;
  integrityTodayISO: string | null;
  integrityBaselineDates: string[];
}

function dayTotal(row: ConsumptionRow): { total: number; complete: boolean } {
  let sum = 0;
  let present = 0;
  for (let i = 0; i < 48; i++) {
    const v = row.half_hourly_values[i];
    if (v == null) continue;
    sum += v * (row.meter_factor || 1);
    present++;
  }
  return { total: sum, complete: present >= 43 }; // >=90% of 48 intervals
}

function computeIntegrity(
  rows: ConsumptionRow[],
  utility: "electricity" | "gas" | "water" | "other",
  end: Date,
  org: Organisation | undefined,
  profile: ResolvedProfile,
): IntegrityFields {
  const empty: IntegrityFields = {
    integrity: "insufficient_history",
    integrityDeltaPct: 0,
    integrityBaselineKwh: 0,
    integrityTodayKwh: 0,
    integrityTodayISO: null,
    integrityBaselineDates: [],
  };
  if (!rows.length) return empty;

  // Find "today" = the most recent complete day <= end.
  const byDate = new Map<string, ConsumptionRow>();
  for (const r of rows) byDate.set(r.interval_date, r);
  const endISO = end.toISOString().slice(0, 10);
  const sortedDates = [...byDate.keys()].sort();
  let todayISO: string | null = null;
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const iso = sortedDates[i];
    if (iso > endISO) continue;
    const t = dayTotal(byDate.get(iso)!);
    if (t.complete) { todayISO = iso; break; }
  }
  if (!todayISO) return empty;
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const dow = todayDate.getDay();
  const todayIsPeak = isPeakSeason(profile, todayDate);
  const todayKwh = dayTotal(byDate.get(todayISO)!).total;

  // Skip integrity for gas during summer gas months.
  if (utility === "gas" && profile.summerGasMonths.includes(tm)) {
    return { ...empty, integrity: "skipped", integrityTodayISO: todayISO, integrityTodayKwh: todayKwh };
  }

  // Walk back same-DOW dates, prefer previous 4 complete matches that also
  // match today's peak/off-peak season (for holiday-park profiles).
  const baselineDates: string[] = [];
  const baselineTotals: number[] = [];
  const cursor = new Date(todayDate);
  cursor.setDate(cursor.getDate() - 7);
  let scanned = 0;
  while (baselineDates.length < 4 && scanned < 26) {
    const iso = cursor.toISOString().slice(0, 10);
    const row = byDate.get(iso);
    if (row) {
      const t = dayTotal(row);
      if (t.complete && isPeakSeason(profile, cursor) === todayIsPeak) {
        baselineDates.push(iso);
        baselineTotals.push(t.total);
      }
    }
    cursor.setDate(cursor.getDate() - 7);
    scanned++;
  }

  if (baselineTotals.length < 3) {
    return { ...empty, integrity: "insufficient_history", integrityTodayISO: todayISO, integrityTodayKwh: todayKwh };
  }

  const baseline = baselineTotals.reduce((a, b) => a + b, 0) / baselineTotals.length;
  if (baseline <= 0) {
    return {
      integrity: "insufficient_history",
      integrityDeltaPct: 0,
      integrityBaselineKwh: baseline,
      integrityTodayKwh: todayKwh,
      integrityTodayISO: todayISO,
      integrityBaselineDates: baselineDates,
    };
  }
  const delta = (todayKwh - baseline) / baseline;
  void dow;
  let status: IntegrityStatus = "ok";
  if (todayKwh > baseline * 1.3) status = "spike";
  else if (todayKwh < baseline * 0.7) status = "drop";
  return {
    integrity: status,
    integrityDeltaPct: delta * 100,
    integrityBaselineKwh: baseline,
    integrityTodayKwh: todayKwh,
    integrityTodayISO: todayISO,
    integrityBaselineDates: baselineDates,
  };
}

// --- Stagnation (offline runs + stuck non-zero values) --------------------

interface StagnationFields {
  stagnation: StagnationStatus;
  stuckValueHours: number;
  offlineEventCount: number;
  offlineEventDates: string[];
}

function computeStagnation(
  rows: ConsumptionRow[],
  utility: "electricity" | "gas" | "water" | "other",
  profile: ResolvedProfile,
  _org: Organisation | undefined,
): StagnationFields {
  const empty: StagnationFields = {
    stagnation: "ok", stuckValueHours: 0, offlineEventCount: 0, offlineEventDates: [],
  };
  if (utility === "gas" || utility === "other") return empty;
  if (!rows.length) return empty;

  // Build chronological flat series over full history.
  const sorted = [...rows].sort((a, b) => a.interval_date.localeCompare(b.interval_date));
  const series: (number | null)[] = [];
  const active: boolean[] = [];
  const slotISO: string[] = [];
  for (const r of sorted) {
    const [y, m, d] = r.interval_date.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const f = r.meter_factor || 1;
    for (let i = 0; i < 48; i++) {
      const v = r.half_hourly_values[i];
      series.push(v == null ? null : v * f);
      active.push(isActiveSlot(profile, date, i));
      slotISO.push(r.interval_date);
    }
  }

  // Count offline events: distinct runs of >=48 consecutive slots of 0 during active hours.
  const OFFLINE_SLOTS = 48; // 24h
  let run = 0;
  let runStart = -1;
  const offlineDates = new Set<string>();
  for (let i = 0; i < series.length; i++) {
    if (active[i] && series[i] === 0) {
      if (run === 0) runStart = i;
      run++;
    } else {
      if (run >= OFFLINE_SLOTS) offlineDates.add(slotISO[runStart]);
      run = 0;
    }
  }
  if (run >= OFFLINE_SLOTS) offlineDates.add(slotISO[runStart]);

  // Stuck non-zero value: longest run of identical non-zero across ALL hours.
  const STUCK_SLOTS = 12;
  let stuckRun = 1;
  let longestStuck = 0;
  let prev: number | null = null;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v != null && v !== 0 && prev != null && v === prev) {
      stuckRun++;
      if (stuckRun > longestStuck) longestStuck = stuckRun;
    } else {
      stuckRun = 1;
    }
    prev = v;
  }
  const stuckValueHours = longestStuck >= STUCK_SLOTS ? longestStuck / 2 : 0;

  const status: StagnationStatus =
    offlineDates.size > 0 ? "offline" :
    stuckValueHours > 0 ? "stuck_value" : "ok";

  return {
    stagnation: status,
    stuckValueHours,
    offlineEventCount: offlineDates.size,
    offlineEventDates: [...offlineDates].sort(),
  };
}

function monthRange(start: Date, end: Date): number[] {
  const out = new Set<number>();
  const c = new Date(start);
  while (c <= end) { out.add(c.getMonth() + 1); c.setDate(c.getDate() + 1); }
  return Array.from(out);
}