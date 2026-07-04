import Papa from "papaparse";

import type { ConsumptionRow, Building } from "./data-store";

export const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/;

export const STRUCTURAL_FIELDS = [
  "OrganizationalUnits.Name",
  "Meters.Name",
  "Meters.Meterfactor",
  "Variables.Code",
  "Variables.Name",
  "Variables.Category",
] as const;

export interface ParsedCsv {
  headers: string[];
  timestampColumns: string[];
  structuralColumns: string[];
  rows: Record<string, string>[];
  uniqueOrgUnits: string[];
}

export function parseCsv(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const timestampColumns = headers.filter((h) => TIMESTAMP_RE.test(h));
        const structuralColumns = headers.filter((h) => !TIMESTAMP_RE.test(h));
        const rows = result.data;
        const uniqueOrgUnits = Array.from(
          new Set(rows.map((r) => r["OrganizationalUnits.Name"]).filter(Boolean)),
        );
        resolve({ headers, timestampColumns, structuralColumns, rows, uniqueOrgUnits });
      },
      error: (err) => reject(err),
    });
  });
}

// Slot index for HH:mm string (00:00 → 0, 00:30 → 1, ... 23:30 → 47)
function slotIndex(hh: string, mm: string): number {
  return parseInt(hh, 10) * 2 + (mm === "30" ? 1 : 0);
}

/**
 * Pivot the wide half-hourly CSV rows into consumption records keyed by date.
 * Each source row becomes N records (one per distinct date), with a 48-slot
 * numeric array indexed by half-hour.
 */
export function pivotRows(
  parsed: ParsedCsv,
  orgId: string,
  buildings: Building[],
): Omit<ConsumptionRow, "id">[] {
  const out: Omit<ConsumptionRow, "id">[] = [];
  const matchMap = new Map(buildings.map((b) => [b.csv_matched_name, b.id]));

  for (const row of parsed.rows) {
    const orgUnit = row["OrganizationalUnits.Name"] ?? "";
    const buildingId = matchMap.get(orgUnit) ?? null;

    // Group timestamps by date
    const perDate = new Map<string, (number | null)[]>();
    for (const col of parsed.timestampColumns) {
      const m = TIMESTAMP_RE.exec(col);
      if (!m) continue;
      const [, date, hh, mm] = m;
      if (!perDate.has(date)) perDate.set(date, new Array(48).fill(null));
      const raw = row[col];
      const val = raw === "" || raw == null ? null : Number(raw);
      perDate.get(date)![slotIndex(hh, mm)] = Number.isFinite(val as number) ? (val as number) : null;
    }

    for (const [date, values] of perDate) {
      out.push({
        organization_id: orgId,
        building_id: buildingId,
        original_org_unit_name: orgUnit,
        meter_name: row["Meters.Name"] ?? "",
        meter_factor: Number(row["Meters.Meterfactor"] ?? "1") || 1,
        variable_code: row["Variables.Code"] ?? "",
        variable_name: row["Variables.Name"] ?? "",
        variable_category: row["Variables.Category"] ?? "",
        interval_date: date,
        half_hourly_values: values,
      });
    }
  }
  return out;
}