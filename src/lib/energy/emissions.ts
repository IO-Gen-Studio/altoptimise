import type { ConsumptionRow, Organisation } from "@/lib/data-store";
import { classifyUtility, orgCo2Factor, rowTotal, type Utility } from "./league";

export interface Scope12Breakdown {
  electricityKwh: number;
  gasKwh: number;
  waterM3: number;
  electricityTco2e: number;
  gasTco2e: number;
  waterTco2e: number;
  scope1Tco2e: number; // gas
  scope2Tco2e: number; // electricity
  waterScope3Tco2e: number; // often reported under Scope 3
  totalScope12Tco2e: number;
  monthly: number[]; // 12 slots (Jan..Dec) of total scope 1+2 tCO2e for the current year
  monthlyByUtility: { electricity: number[]; gas: number[]; water: number[] };
}

function emptyMonthly(): number[] {
  return new Array(12).fill(0);
}

/** Compute Scope 1 (gas) and Scope 2 (electricity) tCO2e from consumption rows */
export function computeScope12(
  rows: ConsumptionRow[],
  org: Organisation | undefined,
  fromISO: string,
  toISO: string,
): Scope12Breakdown {
  const f: Record<Utility, number> = {
    electricity: orgCo2Factor(org, "electricity"),
    gas: orgCo2Factor(org, "gas"),
    water: orgCo2Factor(org, "water"),
    solar: 0,
  };

  let elec = 0;
  let gas = 0;
  let water = 0;
  const monthlyE = emptyMonthly();
  const monthlyG = emptyMonthly();
  const monthlyW = emptyMonthly();

  for (const r of rows) {
    if (r.interval_date < fromISO || r.interval_date > toISO) continue;
    const u = classifyUtility(r.variable_category);
    if (!u || u === "solar") continue;
    const t = rowTotal(r);
    const m = Number(r.interval_date.slice(5, 7)) - 1;
    if (u === "electricity") { elec += t; monthlyE[m] += t; }
    else if (u === "gas") { gas += t; monthlyG[m] += t; }
    else if (u === "water") { water += t; monthlyW[m] += t; }
  }

  const eCo2 = (elec * f.electricity) / 1000;
  const gCo2 = (gas * f.gas) / 1000;
  const wCo2 = (water * f.water) / 1000;

  const monthly = emptyMonthly();
  const monthlyByUtility = {
    electricity: emptyMonthly(),
    gas: emptyMonthly(),
    water: emptyMonthly(),
  };
  for (let i = 0; i < 12; i++) {
    monthlyByUtility.electricity[i] = (monthlyE[i] * f.electricity) / 1000;
    monthlyByUtility.gas[i] = (monthlyG[i] * f.gas) / 1000;
    monthlyByUtility.water[i] = (monthlyW[i] * f.water) / 1000;
    monthly[i] = monthlyByUtility.electricity[i] + monthlyByUtility.gas[i];
  }

  return {
    electricityKwh: elec,
    gasKwh: gas,
    waterM3: water,
    electricityTco2e: eCo2,
    gasTco2e: gCo2,
    waterTco2e: wCo2,
    scope1Tco2e: gCo2,
    scope2Tco2e: eCo2,
    waterScope3Tco2e: wCo2,
    totalScope12Tco2e: eCo2 + gCo2,
    monthly,
    monthlyByUtility,
  };
}

export interface Scope3Entry {
  id: string;
  entry_date: string;
  quantity: number;
  emission_factor: number;
  category_id: string;
  item_name: string;
  unit: string;
  tco2e: number;
}

export interface Scope3Breakdown {
  totalTco2e: number;
  byCategory: Map<string, number>; // category_id -> tCO2e
  monthly: number[]; // 12 slots current year
  entries: Scope3Entry[];
}

export function computeScope3(
  entries: Array<{ id: string; item_id: string; entry_date: string; quantity: number }>,
  items: Array<{ id: string; name: string; unit: string; emission_factor: number; category_id: string }>,
  fromISO: string,
  toISO: string,
): Scope3Breakdown {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const byCat = new Map<string, number>();
  const monthly = emptyMonthly();
  const detailed: Scope3Entry[] = [];
  let total = 0;
  for (const e of entries) {
    if (e.entry_date < fromISO || e.entry_date > toISO) continue;
    const it = itemMap.get(e.item_id);
    if (!it) continue;
    const tco2e = (e.quantity * it.emission_factor) / 1000;
    total += tco2e;
    byCat.set(it.category_id, (byCat.get(it.category_id) ?? 0) + tco2e);
    const m = Number(e.entry_date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) monthly[m] += tco2e;
    detailed.push({
      id: e.id,
      entry_date: e.entry_date,
      quantity: e.quantity,
      emission_factor: it.emission_factor,
      category_id: it.category_id,
      item_name: it.name,
      unit: it.unit,
      tco2e,
    });
  }
  return { totalTco2e: total, byCategory: byCat, monthly, entries: detailed };
}