import type { Building, Organisation, Schedule, Weekday } from "@/lib/data-store";

export type ProfileType = "office" | "retail" | "evening_peak";
export type ScheduleSource = "building" | "org" | "system";

export interface ResolvedProfile {
  profileType: ProfileType;
  source: ScheduleSource;
  activeFrom: string; // "HH:MM"
  activeTo: string;   // "HH:MM"
  activeDays: number[]; // 0=Sun..6=Sat
  peakSeasonMonths: number[]; // 1..12
  summerGasMonths: number[];  // 1..12
  holidays: string[]; // YYYY-MM-DD
}

export const SYSTEM_DEFAULT: Omit<ResolvedProfile, "source"> = {
  profileType: "office",
  activeFrom: "08:30",
  activeTo: "17:30",
  activeDays: [1, 2, 3, 4, 5],
  peakSeasonMonths: [],
  summerGasMonths: [5, 6, 7, 8, 9],
  holidays: [],
};

export const PROFILE_LABEL: Record<ProfileType, string> = {
  office: "Daytime Peak — Weekends Closed (Office)",
  retail: "Daytime Peak — Weekends Open (Retail)",
  evening_peak: "Evening Peak (Leisure / Caravan)",
};

/** Profile presets applied when an org selects a template */
export function presetForProfile(p: ProfileType): Pick<ResolvedProfile, "activeFrom" | "activeTo" | "activeDays" | "peakSeasonMonths"> {
  if (p === "evening_peak") {
    return { activeFrom: "16:00", activeTo: "23:59", activeDays: [0,1,2,3,4,5,6], peakSeasonMonths: [3,4,5,6,7,8,9,10] };
  }
  if (p === "retail") {
    return { activeFrom: "08:30", activeTo: "17:30", activeDays: [0,1,2,3,4,5,6], peakSeasonMonths: [] };
  }
  return { activeFrom: "08:30", activeTo: "17:30", activeDays: [1,2,3,4,5], peakSeasonMonths: [] };
}

export function resolveProfile(
  org: Organisation | undefined,
  building: Building | undefined,
  buildingSchedules: Schedule[],
): ResolvedProfile {
  // Priority 1: building override — a real building-scoped schedule set exists.
  if (building?.schedule_override_enabled && buildingSchedules.length > 0) {
    const dayMap: Record<Weekday, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const days = Array.from(new Set(buildingSchedules.map((s) => dayMap[s.day])));
    const from = buildingSchedules[0].from;
    const to = buildingSchedules[0].to;
    return {
      profileType: (org?.profile_type as ProfileType) ?? "office",
      source: "building",
      activeFrom: from,
      activeTo: to,
      activeDays: days,
      peakSeasonMonths: org?.peak_season_months ?? [],
      summerGasMonths: org?.summer_gas_months ?? SYSTEM_DEFAULT.summerGasMonths,
      holidays: org?.holidays ?? [],
    };
  }
  // Priority 2: org profile
  if (org) {
    return {
      profileType: (org.profile_type as ProfileType) ?? "office",
      source: "org",
      activeFrom: org.active_from ?? SYSTEM_DEFAULT.activeFrom,
      activeTo: org.active_to ?? SYSTEM_DEFAULT.activeTo,
      activeDays: org.active_days ?? SYSTEM_DEFAULT.activeDays,
      peakSeasonMonths: org.peak_season_months ?? [],
      summerGasMonths: org.summer_gas_months ?? SYSTEM_DEFAULT.summerGasMonths,
      holidays: org.holidays ?? [],
    };
  }
  // Priority 3: system default
  return { ...SYSTEM_DEFAULT, source: "system" };
}

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
function slotMinutes(slot: number): number {
  return slot * 30;
}

/** Is this (date, slotIdx) inside the ACTIVE zone under this profile? */
export function isActiveSlot(profile: ResolvedProfile, date: Date, slotIdx: number): boolean {
  const iso = date.toISOString().slice(0, 10);
  if (profile.holidays.includes(iso)) return false;
  const dow = date.getDay();
  if (!profile.activeDays.includes(dow)) return false;
  const mins = slotMinutes(slotIdx);
  return mins >= hhmmToMinutes(profile.activeFrom) && mins < hhmmToMinutes(profile.activeTo);
}

export function isBaseloadSlot(profile: ResolvedProfile, date: Date, slotIdx: number): boolean {
  return !isActiveSlot(profile, date, slotIdx);
}

export function isPeakSeason(profile: ResolvedProfile, date: Date): boolean {
  if (!profile.peakSeasonMonths.length) return true;
  return profile.peakSeasonMonths.includes(date.getMonth() + 1);
}

export function inheritanceLabel(source: ScheduleSource, profileType: ProfileType): string {
  if (source === "building") return "Custom Building Override";
  if (source === "org") return `Inheriting Org Profile: ${PROFILE_LABEL[profileType]}`;
  return "System Default (Mon–Fri 08:30–17:30)";
}