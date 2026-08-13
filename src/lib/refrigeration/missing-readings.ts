import type { RefrigerationReading } from './parse';

/**
 * Estimate the number of missing readings in a time range.
 * Auto-detects the reading interval from the data (defaults to 15 min).
 */
export function countMissingReadings(
  readings: RefrigerationReading[],
  start: Date,
  end: Date
): { expected: number; actual: number; missing: number } {
  const filtered = readings.filter(r => r.time >= start && r.time <= end);
  const actual = filtered.length;

  // Detect interval from all readings (not just filtered)
  let intervalMs = 15 * 60 * 1000; // default 15 min
  if (readings.length >= 2) {
    const sorted = [...readings].sort((a, b) => a.time.getTime() - b.time.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < Math.min(sorted.length, 50); i++) {
      gaps.push(sorted[i].time.getTime() - sorted[i - 1].time.getTime());
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    if (median > 0) intervalMs = median;
  }

  const rangeMs = end.getTime() - start.getTime();
  const expected = Math.max(1, Math.floor(rangeMs / intervalMs) + 1);
  const missing = Math.max(0, expected - actual);

  return { expected, actual, missing };
}
