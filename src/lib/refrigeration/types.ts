export type CaseStatus = "active" | "inactive";

/** A refrigeration case as consumed by the dashboard widgets. */
export interface CaseOption {
  id: string;
  label: string;
  /** Raw CSV text loaded from the database (preferred source). */
  csvText?: string | null;
  /** Optional remote URL fallback (unused in Optimise, kept for widget compat). */
  file?: string;
  maxSafeTemp?: number;
  status?: CaseStatus;
  efficiencyRed?: number;
  efficiencyAmber?: number;
  description?: string;
}

export interface RefrigerationCaseRow {
  id: string;
  organization_id: string;
  building_id: string;
  case_id: string;
  label: string;
  description: string;
  controller: string;
  controller_description: string;
  max_safe_temp: number;
  efficiency_red: number;
  efficiency_amber: number;
  status: string;
  source_filename: string | null;
  csv_text?: string | null;
  updated_at: string;
}

export interface RefrigerationSettingsRow {
  organization_id: string;
  default_max_safe_temp: number;
  default_efficiency_red: number;
  default_efficiency_amber: number;
}

export type EfficiencyFlag = "good" | "amber" | "red";

export const EFFICIENCY_CONFIG: Record<EfficiencyFlag, { color: string; bgColor: string; label: string }> = {
  good: { color: "text-status-ok", bgColor: "bg-status-ok/10", label: "Good" },
  amber: { color: "text-status-warn", bgColor: "bg-status-warn/10", label: "Watch" },
  red: { color: "text-status-error", bgColor: "bg-status-error/10", label: "Poor" },
};

/** Exceedance share of readings mapped to a traffic-light flag. */
export function getEfficiencyFlag(
  exceedances: number,
  totalReadings: number,
  red = 5,
  amber = 2,
): EfficiencyFlag {
  if (totalReadings <= 0) return "good";
  const pct = (exceedances / totalReadings) * 100;
  if (pct >= red) return "red";
  if (pct >= amber) return "amber";
  return "good";
}

export function caseOptionFromRow(row: RefrigerationCaseRow): CaseOption {
  return {
    id: row.case_id,
    label: row.label || row.description || row.case_id,
    description: row.description,
    csvText: row.csv_text ?? null,
    maxSafeTemp: row.max_safe_temp,
    status: (row.status === "inactive" ? "inactive" : "active") as CaseStatus,
    efficiencyRed: row.efficiency_red,
    efficiencyAmber: row.efficiency_amber,
  };
}
