import { Gauge, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMeterRegistry, useOrganisations, type MeterRegistryRow } from "@/lib/data-store";

import { MeterOverrideDialog } from "./MeterOverrideDialog";

export function MeterRegistryPanel() {
  const { organisations } = useOrganisations();
  const [orgId, setOrgId] = useState<string>(organisations[0]?.id ?? "");
  const registry = useMeterRegistry(orgId);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MeterRegistryRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registry;
    return registry.filter(
      (r) =>
        r.raw_meter_name.toLowerCase().includes(q) ||
        (r.custom_display_name ?? "").toLowerCase().includes(q),
    );
  }, [registry, query]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Meter registry</h2>
            <p className="text-xs text-muted-foreground">
              All unique meters discovered from ingested CSVs. Overrides persist across future uploads.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Organisation</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="w-60"><SelectValue placeholder="Select organisation" /></SelectTrigger>
                <SelectContent>
                  {organisations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search meters…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56 pl-8"
              />
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raw meter name</TableHead>
              <TableHead>Custom display name</TableHead>
              <TableHead>Utility</TableHead>
              <TableHead>Assigned building</TableHead>
              <TableHead className="text-right">Meter factor</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.raw_meter_name}>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.raw_meter_name}</code>
                </TableCell>
                <TableCell className="font-medium">
                  {r.custom_display_name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {r.utility_category ? <Badge variant="outline">{r.utility_category}</Badge> : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                    {r.effective_building_name}
                    {r.has_override && r.effective_building_id && (
                      <Badge variant="secondary" className="ml-1 text-[10px]">override</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.has_override && r.effective_meter_factor !== r.csv_meter_factor ? (
                    <span>
                      <strong>{r.effective_meter_factor}</strong>{" "}
                      <span className="text-muted-foreground">(was {r.csv_meter_factor})</span>
                    </span>
                  ) : (
                    r.effective_meter_factor
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.row_count}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {registry.length === 0
                    ? "No meters discovered yet — upload a CSV in the Data Update tab."
                    : "No meters match your search."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <MeterOverrideDialog orgId={orgId} meter={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}