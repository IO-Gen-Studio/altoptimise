/**
 * Outside air temperature + heating degree day helpers.
 *
 * Degree days use the daily mean method: HDD = max(0, base - mean).
 */

export interface WeatherDay {
  day: string;
  temp_min: number | null;
  temp_mean: number | null;
  temp_max: number | null;
  hdd: number | null;
}

export const DEFAULT_HDD_BASE = 15.5;

/** Heating degree days for one day against a base temperature. */
export const hdd = (mean: number | null | undefined, base: number): number =>
  mean == null ? 0 : Math.max(0, base - mean);

/** Total heating degree days across a period. */
export const periodHdd = (days: WeatherDay[]): number =>
  days.reduce((s, d) => s + (d.hdd ?? 0), 0);

/** Mean outside air temperature across a period, or null with no readings. */
export function periodMeanTemp(days: WeatherDay[]): number | null {
  const vals = days.map((d) => d.temp_mean).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** kWh per heating degree day, or null when there were no degree days. */
export const kwhPerHdd = (kwh: number, totalHdd: number): number | null =>
  totalHdd > 0 ? kwh / totalHdd : null;

/** Outside temperature keyed by MM-DD, matching the zone daily series. */
export function outsideByDay(days: WeatherDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) if (d.temp_mean != null) m.set(d.day.slice(5, 10), d.temp_mean);
  return m;
}
