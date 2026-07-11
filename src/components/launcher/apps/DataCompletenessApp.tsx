import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildings, useConsumption, useDataStore, useOrganisations } from "@/lib/data-store";
import { checkCompleteness, utilityKind } from "@/lib/energy/completeness";
import { resolveProfile } from "@/lib/energy/profile";
import { useLauncher } from "@/lib/launcher-context";

type Days = 7 | 30 | 90;

export function DataCompletenessApp() {
  const { org } = useLauncher();
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);
  const { consumption } = useConsumption();
  const { state } = useDataStore();
  const [days, setDays] = useState<Days>(7);
  const orgRecord = organisations.find((o) => o.id === org.id);

  const { start, end } = useMemo(() => {
    const orgRows = consumption.filter((c) => c.organization_id === org.id);
    const dates = orgRows.map((r) => r.interval_date).sort();
    const last = dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
    const [y, m, d] = last.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return { start, end };
  }, [consumption, org.id, days]);

  const rows = useMemo(() => {
    return buildings.flatMap((b) => {
      const profile = resolveProfile(
        orgRecord,
        b,
        state.schedules.filter((s) => s.building_id === b.id),
      );
      const bRows = consumption.filter((c) => c.building_id === b.id);
      const utilities = Array.from(new Set(bRows.map((r) => utilityKind(r.variable_category)))).filter((u) => u !== "other");
      return utilities.map((u) => {
        const uRows = bRows.filter((r) => utilityKind(r.variable_category) === u);
        const result = checkCompleteness(uRows, u, start, end, orgRecord, profile);
        return { building: b.custom_display_name, utility: u, ...result };
      });
    });
  }, [buildings, consumption, state.schedules, orgRecord, start, end]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data Completeness Check</h1>
            <p className="text-sm text-muted-foreground">
              Interval coverage and telemetry health for {org.name} — last {days} days.
            </p>
          </div>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as Days)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Building</TableHead>
                <TableHead>Utility</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Missing</TableHead>
                <TableHead>Longest flatline</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.building}-${r.utility}`}>
                  <TableCell className="font-medium">{r.building}</TableCell>
                  <TableCell className="capitalize">{r.utility}</TableCell>
                  <TableCell>
                    {r.status === "ok" ? (
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">OK</Badge>
                    ) : r.status === "incomplete" ? (
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">Data Incomplete</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">Telemetry Offline</Badge>
                    )}
                  </TableCell>
                  <TableCell>{r.missingPct.toFixed(1)}%</TableCell>
                  <TableCell>{r.longestFlatlineHours.toFixed(1)}h</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No meter data yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}