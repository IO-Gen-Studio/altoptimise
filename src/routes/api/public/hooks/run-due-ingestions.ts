import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron every minute. Runs any enabled ingestion schedule whose
// scheduled_time (UTC HH:mm) matches the current minute and hasn't been
// successfully synced today.
export const Route = createFileRoute("/api/public/hooks/run-due-ingestions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
        const todayIso = now.toISOString().slice(0, 10);

        const { data: schedules, error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("ingestion_schedules" as any)
          .select("id, scheduled_time, enabled, last_synced_at, last_status")
          .eq("enabled", true)
          .eq("scheduled_time", hhmm);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        type Row = { id: string; last_synced_at: string | null; last_status: string | null };
        const rows = (schedules ?? []) as unknown as Row[];
        const due = rows.filter((s) => {
          if (!s.last_synced_at) return true;
          const lastDay = s.last_synced_at.slice(0, 10);
          if (lastDay !== todayIso) return true;
          return s.last_status !== "success";
        });

        const { runIngestionSchedule } = await import("@/lib/ingestion.server");
        const results: Array<{ id: string; ok: boolean; error?: string; rows?: number }> = [];
        for (const s of due) {
          const id = s.id;
          try {
            const r = await runIngestionSchedule(id);
            results.push({ id, ok: true, rows: r.rowsImported });
          } catch (e) {
            results.push({ id, ok: false, error: (e as Error).message });
          }
        }
        return Response.json({ hhmm, ran: results.length, results });
      },
    },
  },
});