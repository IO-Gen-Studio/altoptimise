import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron every 30 minutes. Refreshes Octopus unit rates for every
// region referenced by a building or organisation default, so the day-ahead
// Agile publish (~16:00 UK) is picked up as soon as it lands.
export const Route = createFileRoute("/api/public/hooks/sync-agile-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { isAuthorizedCronRequest } = await import("@/lib/cron-auth.server");
          if (!isAuthorizedCronRequest(request)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const { syncAllPrices } = await import("@/lib/pricing.server");
          const results = await syncAllPrices();
          const rows = results.reduce((a, r) => a + r.rows, 0);
          const errors = results.filter((r) => r.status === "error").length;
          return Response.json({ ok: true, pairs: results.length, rows, errors });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});