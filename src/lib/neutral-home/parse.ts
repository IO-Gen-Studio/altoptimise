import * as XLSX from "xlsx";

export type ReportKind = "headline" | "daynight";

export interface ParsedPeriodRange {
  startISO: string;
  endISO: string;
  label: string;
}

export interface HeadlineRow {
  name: string;
  usage_kwh: number | null;
  co2_kg: number | null;
  blended_p_kwh: number | null;
  day_p_kwh: number | null;
  night_p_kwh: number | null;
  total_cost_p: number | null;
  usage_kwh_per_person: number | null;
  usage_kwh_per_m2: number | null;
  cost_p_per_person: number | null;
  cost_p_per_m2: number | null;
  co2_kg_per_person: number | null;
  co2_kg_per_m2: number | null;
}

export interface DayNightRow {
  name: string;
  day_kwh: number | null;
  day_pct: number | null;
  night_kwh: number | null;
  night_pct: number | null;
  total_kwh: number | null;
}

export interface ParsedReport<T> {
  fileName: string;
  kind: ReportKind;
  projectName: string | null;
  range: ParsedPeriodRange | null;
  rows: T[];
  missingColumns: string[];
}

export type CircuitCategory =
  | "hvac"
  | "ahu"
  | "heating"
  | "kitchen"
  | "lighting"
  | "ev"
  | "pv"
  | "office"
  | "storage"
  | "totals"
  | "other";

export const CATEGORY_LABEL: Record<CircuitCategory, string> = {
  hvac: "HVAC",
  ahu: "AHU",
  heating: "Heating / Storage Heaters",
  kitchen: "Kitchen",
  lighting: "Lighting & Small Power",
  ev: "EV Charging",
  pv: "PV / Export",
  office: "Offices",
  storage: "Storage & Retail",
  totals: "Totals & Incomers",
  other: "Other",
};

export interface MergedCircuit extends HeadlineRow, Omit<DayNightRow, "name" | "total_kwh"> {
  circuit_name: string;
  category: CircuitCategory;
  is_aggregate: boolean;
  daynight_total_kwh: number | null;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  headlineCount: number;
  daynightCount: number;
  onlyInHeadline: string[];
  onlyInDayNight: string[];
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v)
    .replace(/[,\s£]/g, "")
    .replace(/[()]/g, (m) => (m === "(" ? "-" : ""))
    .replace(/kwh|kg|p\/kwh|%/gi, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parses "5,052.81 kWh (65.22%)" or "0.00 kWh" */
export function parseKwhPct(v: unknown): { kwh: number | null; pct: number | null } {
  if (v == null || v === "") return { kwh: null, pct: null };
  const s = String(v);
  const kwhMatch = /(-?[\d,]+(?:\.\d+)?)\s*kwh/i.exec(s);
  const pctMatch = /\(\s*(-?[\d,]+(?:\.\d+)?)\s*%\s*\)/.exec(s);
  return {
    kwh: kwhMatch ? toNum(kwhMatch[1]) : toNum(s),
    pct: pctMatch ? toNum(pctMatch[1]) : null,
  };
}

function normHeader(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function readGrid(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null });
}

function stripOrdinal(s: string): string {
  return s.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
}

function parseEnvisijDate(raw: string): Date | null {
  const s = stripOrdinal(raw.trim()).replace(/,/g, " ");
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)));
    if (mi >= 0) return new Date(Date.UTC(Number(m[3]), mi, Number(m[1])));
  }
  const dmy = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function labelFor(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
  const a = fmt(start);
  const b = fmt(end);
  return a === b ? a : `${a} – ${b}`;
}

function extractRange(grid: unknown[][], headerRow: number): ParsedPeriodRange | null {
  let start: Date | null = null;
  let end: Date | null = null;
  for (let r = 0; r < Math.min(headerRow, 25); r++) {
    const cells = (grid[r] ?? []).map((c) => String(c ?? ""));
    const joined = cells.join(" ").trim();
    if (!joined) continue;
    if (/from/i.test(joined) && !start) start = parseEnvisijDate(joined.replace(/.*from:?/i, ""));
    if (/\bto\b/i.test(joined) && !end) end = parseEnvisijDate(joined.replace(/.*to:?/i, ""));
  }
  if (!start || !end) return null;
  return { startISO: isoOf(start), endISO: isoOf(end), label: labelFor(start, end) };
}

function extractProjectName(grid: unknown[][], headerRow: number): string | null {
  for (let r = 0; r < Math.min(headerRow, 25); r++) {
    for (const cell of grid[r] ?? []) {
      const s = String(cell ?? "");
      const m = /project\s*name:?\s*(.+)/i.exec(s);
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  return null;
}

function findHeaderRow(grid: unknown[][], kind: ReportKind): number {
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const first = normHeader((grid[r] ?? [])[0]);
    if (kind === "headline" && /project\s*groups?/.test(first)) return r;
    if (kind === "daynight" && (first === "date/time" || /date\s*\/\s*time/.test(first))) return r;
  }
  // Fallback: first row where at least 3 cells are non-empty strings
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const cells = (grid[r] ?? []).filter((c) => String(c ?? "").trim() !== "");
    if (cells.length >= (kind === "headline" ? 5 : 3)) return r;
  }
  return -1;
}

const HEADLINE_FIELDS: Array<{ key: keyof HeadlineRow; match: RegExp; required?: boolean }> = [
  { key: "usage_kwh", match: /^total usage/, required: true },
  { key: "co2_kg", match: /^total co/, required: true },
  { key: "blended_p_kwh", match: /^blended cost/ },
  { key: "day_p_kwh", match: /^day cost/ },
  { key: "night_p_kwh", match: /^night cost/ },
  { key: "total_cost_p", match: /^total cost/, required: true },
  { key: "usage_kwh_per_person", match: /^usage.*person/ },
  { key: "usage_kwh_per_m2", match: /^usage.*m²|^usage.*m2/ },
  { key: "cost_p_per_person", match: /^cost.*person/ },
  { key: "cost_p_per_m2", match: /^cost.*m²|^cost.*m2/ },
  { key: "co2_kg_per_person", match: /^co.*person/ },
  { key: "co2_kg_per_m2", match: /^co.*m²|^co.*m2/ },
];

export async function parseHeadlineReport(file: File): Promise<ParsedReport<HeadlineRow>> {
  const grid = await readGrid(file);
  const headerRow = findHeaderRow(grid, "headline");
  const missingColumns: string[] = [];
  const rows: HeadlineRow[] = [];
  if (headerRow < 0) {
    return {
      fileName: file.name,
      kind: "headline",
      projectName: null,
      range: null,
      rows,
      missingColumns: ["header row"],
    };
  }
  const headers = (grid[headerRow] ?? []).map(normHeader);
  const colOf = new Map<keyof HeadlineRow, number>();
  for (const f of HEADLINE_FIELDS) {
    const idx = headers.findIndex((h) => f.match.test(h));
    if (idx >= 0) colOf.set(f.key, idx);
    else if (f.required) missingColumns.push(f.key);
  }

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = String(row[0] ?? "").trim();
    if (!name || /^blank row/i.test(name)) continue;
    const pick = (key: keyof HeadlineRow) => {
      const idx = colOf.get(key);
      return idx == null ? null : toNum(row[idx]);
    };
    rows.push({
      name,
      usage_kwh: pick("usage_kwh"),
      co2_kg: pick("co2_kg"),
      blended_p_kwh: pick("blended_p_kwh"),
      day_p_kwh: pick("day_p_kwh"),
      night_p_kwh: pick("night_p_kwh"),
      total_cost_p: pick("total_cost_p"),
      usage_kwh_per_person: pick("usage_kwh_per_person"),
      usage_kwh_per_m2: pick("usage_kwh_per_m2"),
      cost_p_per_person: pick("cost_p_per_person"),
      cost_p_per_m2: pick("cost_p_per_m2"),
      co2_kg_per_person: pick("co2_kg_per_person"),
      co2_kg_per_m2: pick("co2_kg_per_m2"),
    });
  }

  return {
    fileName: file.name,
    kind: "headline",
    projectName: extractProjectName(grid, headerRow),
    range: extractRange(grid, headerRow),
    rows,
    missingColumns,
  };
}

export async function parseDayNightReport(file: File): Promise<ParsedReport<DayNightRow>> {
  const grid = await readGrid(file);
  const headerRow = findHeaderRow(grid, "daynight");
  const missingColumns: string[] = [];
  const rows: DayNightRow[] = [];
  if (headerRow < 0) {
    return {
      fileName: file.name,
      kind: "daynight",
      projectName: null,
      range: null,
      rows,
      missingColumns: ["header row"],
    };
  }
  const headers = (grid[headerRow] ?? []).map(normHeader);
  const dayIdx = headers.findIndex((h) => h === "day" || /^day\b/.test(h));
  const nightIdx = headers.findIndex((h) => h === "night" || /^night\b/.test(h));
  const totalIdx = headers.findIndex((h) => h === "total" || /^total\b/.test(h));
  if (dayIdx < 0) missingColumns.push("Day");
  if (nightIdx < 0) missingColumns.push("Night");
  if (totalIdx < 0) missingColumns.push("Total");

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = String(row[0] ?? "").trim();
    if (!name || /^blank row/i.test(name)) continue;
    const day = dayIdx >= 0 ? parseKwhPct(row[dayIdx]) : { kwh: null, pct: null };
    const night = nightIdx >= 0 ? parseKwhPct(row[nightIdx]) : { kwh: null, pct: null };
    const total = totalIdx >= 0 ? parseKwhPct(row[totalIdx]) : { kwh: null, pct: null };
    rows.push({
      name,
      day_kwh: day.kwh,
      day_pct: day.pct,
      night_kwh: night.kwh,
      night_pct: night.pct,
      total_kwh: total.kwh,
    });
  }

  return {
    fileName: file.name,
    kind: "daynight",
    projectName: extractProjectName(grid, headerRow),
    range: extractRange(grid, headerRow),
    rows,
    missingColumns,
  };
}

export function categorise(name: string): CircuitCategory {
  const n = name.toLowerCase();
  if (/invert|\bpv\b|export|solar/.test(n)) return "pv";
  if (/\btotal\b|incomer|mpan|^\d{8,}/.test(n)) return "totals";
  if (/\bev\b|ev charging|car charg/.test(n)) return "ev";
  if (/ahu|air handling/.test(n)) return "ahu";
  if (/hvac|air con|vrf|condenser/.test(n)) return "hvac";
  if (/heater|heating|ufh|under floor|mega flow|off peak/.test(n)) return "heating";
  if (/kitchen|oven|hob|extract hood|rationale/.test(n)) return "kitchen";
  if (/office|admin|reception|consult|governance|staff room|duty room/.test(n)) return "office";
  if (/store|storage|retail|furniture|outlet/.test(n)) return "storage";
  if (/light|small power|socket|\bdb\d|\bdb \d/.test(n)) return "lighting";
  return "other";
}

export function isAggregateName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /\btotal\b/.test(n) ||
    /incomer/.test(n) ||
    /invert/.test(n) ||
    /^mpan/.test(n) ||
    /^\d{8,}/.test(n) ||
    /\bexport\b/.test(n) ||
    /\bimport\b/.test(n) ||
    /\bpv l\d/.test(n)
  );
}

const NON_ESSENTIAL: CircuitCategory[] = ["office", "hvac", "heating", "storage", "lighting"];

export function isNonEssential(category: CircuitCategory): boolean {
  return NON_ESSENTIAL.includes(category);
}

function keyOf(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface MergeResult {
  circuits: MergedCircuit[];
  validation: ValidationReport;
  range: ParsedPeriodRange | null;
  projectName: string | null;
}

export function mergeReports(
  headline: ParsedReport<HeadlineRow>,
  daynight: ParsedReport<DayNightRow>,
): MergeResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!headline.rows.length) errors.push("Headline Usage Report has no data rows.");
  if (!daynight.rows.length) errors.push("Day/Night Group Overview Report has no data rows.");
  if (headline.missingColumns.length)
    errors.push(`Headline report is missing columns: ${headline.missingColumns.join(", ")}.`);
  if (daynight.missingColumns.length)
    errors.push(`Day/Night report is missing columns: ${daynight.missingColumns.join(", ")}.`);

  const range = headline.range ?? daynight.range;
  if (!range) errors.push("Could not read the reporting date range from either file header.");
  if (
    headline.range &&
    daynight.range &&
    (headline.range.startISO !== daynight.range.startISO ||
      headline.range.endISO !== daynight.range.endISO)
  ) {
    warnings.push(
      `Date ranges differ between files (${headline.range.startISO}–${headline.range.endISO} vs ${daynight.range.startISO}–${daynight.range.endISO}). Using the headline report range.`,
    );
  }

  const dnMap = new Map<string, DayNightRow>();
  for (const r of daynight.rows) dnMap.set(keyOf(r.name), r);
  const hlKeys = new Set(headline.rows.map((r) => keyOf(r.name)));

  const onlyInHeadline = headline.rows
    .filter((r) => !dnMap.has(keyOf(r.name)))
    .map((r) => r.name);
  const onlyInDayNight = daynight.rows.filter((r) => !hlKeys.has(keyOf(r.name))).map((r) => r.name);

  if (headline.rows.length !== daynight.rows.length) {
    warnings.push(
      `Meter counts differ: ${headline.rows.length} rows in the headline report vs ${daynight.rows.length} in the day/night report.`,
    );
  }
  if (onlyInHeadline.length)
    warnings.push(`${onlyInHeadline.length} circuit(s) have no day/night data and will show as day-only unknown.`);
  if (onlyInDayNight.length)
    warnings.push(`${onlyInDayNight.length} circuit(s) appear only in the day/night report and were skipped.`);

  const seen = new Set<string>();
  const circuits: MergedCircuit[] = [];
  for (const h of headline.rows) {
    const k = keyOf(h.name);
    if (seen.has(k)) continue;
    seen.add(k);
    const dn = dnMap.get(k);
    circuits.push({
      ...h,
      circuit_name: h.name,
      category: categorise(h.name),
      is_aggregate: isAggregateName(h.name),
      day_kwh: dn?.day_kwh ?? null,
      day_pct: dn?.day_pct ?? null,
      night_kwh: dn?.night_kwh ?? null,
      night_pct: dn?.night_pct ?? null,
      daynight_total_kwh: dn?.total_kwh ?? null,
    });
  }

  return {
    circuits,
    range,
    projectName: headline.projectName ?? daynight.projectName,
    validation: {
      errors,
      warnings,
      headlineCount: headline.rows.length,
      daynightCount: daynight.rows.length,
      onlyInHeadline,
      onlyInDayNight,
    },
  };
}