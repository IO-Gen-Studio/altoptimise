import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runIngestionScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Read the schedule through the RLS-scoped client so cross-org UUIDs are invisible.
    const { data: schedule, error: schedErr } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("ingestion_schedules" as any)
      .select("id, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (schedErr) throw new Error(schedErr.message);
    const orgId = (schedule as { organization_id?: string } | null)?.organization_id;
    if (!orgId) throw new Error("Forbidden: schedule not found");

    // Require manage rights on the schedule's own organisation.
    const { data: canManage, error: roleErr } = await context.supabase
      .rpc("can_manage_org", { _user_id: context.userId, _org_id: orgId });
    if (roleErr) throw new Error(roleErr.message);
    if (!canManage) throw new Error("Forbidden: you cannot manage this organisation");

    const { runIngestionSchedule } = await import("@/lib/ingestion.server");
    const result = await runIngestionSchedule(data.id);
    return result;
  });