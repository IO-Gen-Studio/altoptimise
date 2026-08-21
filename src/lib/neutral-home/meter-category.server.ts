/* eslint-disable @typescript-eslint/no-explicit-any */
export type NhCircuitKindValue = "zone" | "equipment" | "other";

export interface MeterCategoryPatch {
  organization_id: string;
  site_id: string;
  circuit_name: string;
  category?: string | null;
  kind?: NhCircuitKindValue;
  zone_circuit_name?: string | null;
}

/**
 * Applies a partial classification change (sub-category, kind, zone link) to a
 * single circuit, keeping any fields the caller did not send.
 */
export async function applyMeterCategory(
  supabase: any,
  patch: MeterCategoryPatch,
): Promise<void> {
  const table = () => supabase.from("neutral_home_meter_categories");
  const { data: existing, error: findErr } = await table()
    .select("category,kind,zone_circuit_name")
    .eq("site_id", patch.site_id)
    .eq("circuit_name", patch.circuit_name)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  const row = (existing ?? null) as {
    category: string | null;
    kind: string | null;
    zone_circuit_name: string | null;
  } | null;

  const next = {
    category: patch.category !== undefined ? patch.category : (row?.category ?? null),
    kind: (patch.kind ?? row?.kind ?? "other") as NhCircuitKindValue,
    zone_circuit_name:
      patch.zone_circuit_name !== undefined
        ? patch.zone_circuit_name
        : (row?.zone_circuit_name ?? null),
  };
  if (next.kind !== "equipment") next.zone_circuit_name = null;

  // Nothing worth storing — drop the row so the circuit falls back to defaults.
  if (!next.category && next.kind === "other" && !next.zone_circuit_name) {
    if (row) {
      const { error } = await table()
        .delete()
        .eq("site_id", patch.site_id)
        .eq("circuit_name", patch.circuit_name);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const { error } = await table().upsert(
    {
      organization_id: patch.organization_id,
      site_id: patch.site_id,
      circuit_name: patch.circuit_name,
      ...next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_id,circuit_name" },
  );
  if (error) throw new Error(error.message);
}
