import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Category {
  id: string;
  code: string;
  name: string;
  scope: number;
  sort_order: number;
}

export interface Item {
  id: string;
  organization_id: string | null;
  category_id: string;
  name: string;
  unit: string;
  emission_factor: number;
  factor_source: string | null;
  is_preset: boolean;
  active: boolean;
}

export interface Entry {
  id: string;
  organization_id: string;
  item_id: string;
  entry_date: string;
  quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Target {
  id: string;
  organization_id: string;
  scope: number;
  category_id: string | null;
  period_start: string;
  period_end: string;
  target_tco2e: number;
}

export interface SustainabilityBundle {
  categories: Category[];
  items: Item[];
  entries: Entry[];
  targets: Target[];
}

const OrgIdInput = z.object({ orgId: z.string().uuid() });

export const loadSustainability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgIdInput.parse(d))
  .handler(async ({ data, context }): Promise<SustainabilityBundle> => {
    const { supabase } = context;
    const [cats, items, entries, targets] = await Promise.all([
      supabase.from("sustainability_categories").select("*").order("sort_order"),
      supabase
        .from("sustainability_items")
        .select("*")
        .or(`organization_id.is.null,organization_id.eq.${data.orgId}`)
        .eq("active", true)
        .order("name"),
      supabase
        .from("sustainability_entries")
        .select("*")
        .eq("organization_id", data.orgId)
        .order("entry_date", { ascending: false }),
      supabase
        .from("sustainability_targets")
        .select("*")
        .eq("organization_id", data.orgId),
    ]);
    return {
      categories: (cats.data ?? []) as Category[],
      items: (items.data ?? []) as Item[],
      entries: (entries.data ?? []) as Entry[],
      targets: (targets.data ?? []) as Target[],
    };
  });

const ItemInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(40),
  emission_factor: z.number().min(0),
  factor_source: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

export const upsertItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ItemInput.parse(d))
  .handler(async ({ data, context }): Promise<Item> => {
    const payload = { ...data, is_preset: false };
    if (payload.id) {
      const { data: row, error } = await context.supabase
        .from("sustainability_items")
        .update(payload)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as Item;
    }
    const { data: row, error } = await context.supabase
      .from("sustainability_items")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Item;
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sustainability_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const EntryInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  item_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().min(0),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EntryInput.parse(d))
  .handler(async ({ data, context }): Promise<Entry> => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("sustainability_entries")
        .update({
          item_id: data.item_id,
          entry_date: data.entry_date,
          quantity: data.quantity,
          notes: data.notes ?? null,
        })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as Entry;
    }
    const { data: row, error } = await context.supabase
      .from("sustainability_entries")
      .insert({
        organization_id: data.organization_id,
        item_id: data.item_id,
        entry_date: data.entry_date,
        quantity: data.quantity,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Entry;
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sustainability_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BulkInput = z.object({
  organization_id: z.string().uuid(),
  rows: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        quantity: z.number().min(0),
        notes: z.string().max(1000).nullable().optional(),
      }),
    )
    .max(2000),
});

export const bulkImportEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!data.rows.length) return { inserted: 0 };
    const payload = data.rows.map((r) => ({
      organization_id: data.organization_id,
      item_id: r.item_id,
      entry_date: r.entry_date,
      quantity: r.quantity,
      notes: r.notes ?? null,
      created_by: context.userId,
    }));
    const { error, count } = await context.supabase
      .from("sustainability_entries")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length };
  });

const TargetInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  scope: z.number().int().min(0).max(3),
  category_id: z.string().uuid().nullable().optional(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  target_tco2e: z.number().min(0),
});

export const upsertTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TargetInput.parse(d))
  .handler(async ({ data, context }): Promise<Target> => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("sustainability_targets")
        .update({
          scope: data.scope,
          category_id: data.category_id ?? null,
          period_start: data.period_start,
          period_end: data.period_end,
          target_tco2e: data.target_tco2e,
        })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as Target;
    }
    const { data: row, error } = await context.supabase
      .from("sustainability_targets")
      .insert({
        organization_id: data.organization_id,
        scope: data.scope,
        category_id: data.category_id ?? null,
        period_start: data.period_start,
        period_end: data.period_end,
        target_tco2e: data.target_tco2e,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Target;
  });

export const deleteTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sustainability_targets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });