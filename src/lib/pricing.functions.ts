import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UnitRate } from "@/lib/energy/pricing";

const RatesInput = z.object({
  regions: z.array(z.string().min(1).max(2)).min(1).max(14),
  products: z.array(z.string().min(3).max(64)).min(1).max(6),
  fromISO: z.string().min(10),
  toISO: z.string().min(10),
});

export interface RatesBundle {
  rates: UnitRate[];
  lastSyncedAt: string | null;
}

export const getUnitRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RatesInput.parse(d))
  .handler(async ({ data, context }): Promise<RatesBundle> => {
    const { supabase } = context;
    const pageSize = 1000;
    const rates: UnitRate[] = [];
    for (let page = 0; page < 40; page++) {
      const { data: rows, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("energy_unit_rates" as any)
        .select("product_code, region_code, valid_from, valid_to, value_inc_vat, value_exc_vat")
        .in("region_code", data.regions)
        .in("product_code", data.products)
        .gte("valid_from", data.fromISO)
        .lte("valid_from", data.toISO)
        .order("valid_from", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = (rows ?? []) as unknown as UnitRate[];
      rates.push(...batch);
      if (batch.length < pageSize) break;
    }

    const { data: log } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("energy_price_sync_log" as any)
      .select("created_at")
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      rates,
      lastSyncedAt: (log as { created_at?: string } | null)?.created_at ?? null,
    };
  });

const SyncInput = z.object({
  regions: z.array(z.string().min(1).max(2)).max(14).optional(),
  daysBack: z.number().int().min(1).max(90).optional(),
});

export const syncPricesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: manager, error } = await supabase.rpc("is_manager", { _user_id: userId });
    if (error) throw new Error(error.message);
    if (!manager) throw new Error("Only admins can sync prices");

    const { syncAllPrices } = await import("@/lib/pricing.server");
    const results = await syncAllPrices({ regions: data.regions, daysBack: data.daysBack });
    const rows = results.reduce((a, r) => a + r.rows, 0);
    const failures = results.filter((r) => r.status === "error");
    return { rows, failures: failures.map((f) => `${f.productCode}/${f.regionCode}: ${f.error}`) };
  });