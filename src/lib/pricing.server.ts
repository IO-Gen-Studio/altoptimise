/**
 * Server-only Octopus Energy price sync.
 * Pulls half-hourly unit rates from the public Octopus REST API (no auth) and
 * upserts them into public.energy_unit_rates.
 */

const OCTOPUS_BASE = "https://api.octopus.energy/v1";

export interface OctopusRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string | null;
  payment_method: string | null;
}

export interface SyncOutcome {
  productCode: string;
  regionCode: string;
  rows: number;
  status: "ok" | "error";
  error?: string;
}

const PRODUCT_CODES = {
  agile: "AGILE-24-10-01",
  outgoing: "AGILE-OUTGOING-19-05-13",
  tracker: "SILVER-24-12-31",
  flexible: "VAR-22-11-01",
} as const;

const PAYMENT_FILTER: Record<string, string | undefined> = {
  "VAR-22-11-01": "DIRECT_DEBIT",
};

export const SYNC_PRODUCTS = Object.values(PRODUCT_CODES);

async function fetchRates(productCode: string, region: string, fromISO: string, toISO: string) {
  const tariff = `E-1R-${productCode}-${region}`;
  const url = new URL(
    `${OCTOPUS_BASE}/products/${productCode}/electricity-tariffs/${tariff}/standard-unit-rates/`,
  );
  url.searchParams.set("period_from", fromISO);
  url.searchParams.set("period_to", toISO);
  url.searchParams.set("page_size", "1500");

  const out: OctopusRate[] = [];
  let next: string | null = url.toString();
  let guard = 0;
  while (next && guard++ < 10) {
    const res: Response = await fetch(next, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Octopus ${productCode}/${region} failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { results: OctopusRate[]; next: string | null };
    out.push(...(json.results ?? []));
    next = json.next;
  }
  const pm = PAYMENT_FILTER[productCode];
  return pm ? out.filter((r) => r.payment_method == null || r.payment_method === pm) : out;
}

/**
 * Sync one product/region pair. Window defaults to the last 3 days plus every
 * published future rate (Octopus publishes tomorrow's Agile ~16:00 UK).
 */
export async function syncProductRegion(
  productCode: string,
  region: string,
  opts?: { daysBack?: number; daysForward?: number },
): Promise<SyncOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const from = new Date(now - (opts?.daysBack ?? 3) * 86_400_000).toISOString();
  const to = new Date(now + (opts?.daysForward ?? 3) * 86_400_000).toISOString();

  try {
    const rates = await fetchRates(productCode, region, from, to);
    const rows = rates.map((r) => ({
      product_code: productCode,
      region_code: region,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      value_inc_vat: r.value_inc_vat,
      value_exc_vat: r.value_exc_vat,
    }));
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("energy_unit_rates" as any)
          .upsert(rows.slice(i, i + 500), { onConflict: "product_code,region_code,valid_from" });
        if (error) throw new Error(error.message);
      }
    }
    await logSync(productCode, region, rows.length, "ok");
    return { productCode, regionCode: region, rows: rows.length, status: "ok" };
  } catch (e) {
    const message = (e as Error).message;
    await logSync(productCode, region, 0, "error", message);
    return { productCode, regionCode: region, rows: 0, status: "error", error: message };
  }
}

async function logSync(
  productCode: string,
  region: string,
  rows: number,
  status: string,
  error?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Successes are logged at most once per product/region/day; failures always.
  // Logging every 30-minute success grew this table without adding signal.
  if (status === "ok") {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("energy_price_sync_log" as any)
      .select("id", { count: "exact", head: true })
      .eq("product_code", productCode)
      .eq("region_code", region)
      .eq("status", "ok")
      .gte("created_at", since.toISOString());
    if ((count ?? 0) > 0) return;
  }
  await supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("energy_price_sync_log" as any)
    .insert({ product_code: productCode, region_code: region, rows_written: rows, status, error: error ?? null });
}


/** Every region referenced by a building or organisation default. */
export async function activeRegions(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const set = new Set<string>();
  const [b, o] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseAdmin.from("buildings" as any).select("gsp_region_code"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseAdmin.from("organisations" as any).select("default_gsp_region_code"),
  ]);
  for (const r of (b.data ?? []) as unknown as Array<{ gsp_region_code: string | null }>) {
    if (r.gsp_region_code) set.add(r.gsp_region_code);
  }
  for (const r of (o.data ?? []) as unknown as Array<{ default_gsp_region_code: string | null }>) {
    if (r.default_gsp_region_code) set.add(r.default_gsp_region_code);
  }
  if (set.size === 0) set.add("C"); // London fallback so the app always has data
  return Array.from(set);
}

export async function syncAllPrices(opts?: { regions?: string[]; daysBack?: number }): Promise<SyncOutcome[]> {
  const regions = opts?.regions?.length ? opts.regions : await activeRegions();
  const out: SyncOutcome[] = [];
  for (const region of regions) {
    for (const product of SYNC_PRODUCTS) {
      out.push(await syncProductRegion(product, region, { daysBack: opts?.daysBack }));
    }
  }
  return out;
}