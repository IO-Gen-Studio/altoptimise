import { AlertTriangle, Plus, Trash2, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EditBuildingDialog } from "@/components/admin/EditBuildingDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBuildings, useConsumptionIndex, useDataStore, useMeterRegistry, useOrganisations,
  type Building,
} from "@/lib/data-store";
import { checkCompleteness, utilityKind } from "@/lib/energy/completeness";
import { resolveProfile } from "@/lib/energy/profile";

export function BuildingsPanel() {
  const { organisations } = useOrganisations();
  const [orgId, setOrgId] = useState<string>(organisations[0]?.id ?? "");
  const { buildings, addBuilding, deleteBuilding } = useBuildings(orgId);
  const { state } = useDataStore();
  const index = useConsumptionIndex(orgId);
  const registry = useMeterRegistry(orgId);
  const orgRecord = organisations.find((o) => o.id === orgId);
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("");
  const [match, setMatch] = useState("");
  const [editing, setEditing] = useState<Building | null>(null);

  useEffect(() => {
    if (!organisations.length) return;
    if (!orgId || !organisations.some((o) => o.id === orgId)) setOrgId(organisations[0].id);
  }, [organisations, orgId]);

  const linkedCount = (bid: string) =>
    registry
      .filter((m) => m.effective_building_id === bid)
      .reduce((total, m) => total + m.row_count, 0);

  const meterCount = (bid: string) =>
    registry.filter((m) => m.effective_building_id === bid).length;

  // Roll up validation alerts across the building's meters over last 30 days.
  const alertsByBuilding = useMemo(() => {
    const map = new Map<string, { kind: "spike" | "drop" | "offline"; label: string }[]>();
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    for (const m of registry) {
      if (!m.effective_building_id) continue;
      const building = buildings.find((b) => b.id === m.effective_building_id);
      const profile = resolveProfile(
        orgRecord, building,
        state.schedules.filter((s) => s.building_id === (building?.id ?? "")),
      );
      const utility = utilityKind(m.utility_category);
      const entry = index.byMeter.get(m.raw_meter_name);
      const allRows = entry?.rows ?? [];
      const firstSeen = entry?.firstSeen ?? undefined;
      const res = checkCompleteness(allRows, utility, start, end, orgRecord, profile, firstSeen);
      const label = m.custom_display_name ?? m.raw_meter_name;
      const list = map.get(m.effective_building_id) ?? [];
      if (res.integrity === "spike") list.push({ kind: "spike", label: `${label}: spike +${res.integrityDeltaPct.toFixed(0)}% vs 4-wk baseline` });
      if (res.integrity === "drop") list.push({ kind: "drop", label: `${label}: drop ${res.integrityDeltaPct.toFixed(0)}% vs 4-wk baseline` });
      if (res.stagnation === "offline") list.push({ kind: "offline", label: `${label}: ${res.offlineEventCount} offline event(s)` });
      if (list.length) map.set(m.effective_building_id, list);
    }
    return map;
  }, [registry, buildings, index, state.schedules, orgRecord]);

  return (
    <TooltipProvider delayDuration={150}>
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Organisation</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Select organisation" /></SelectTrigger>
              <SelectContent>
                {organisations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={!orgId}>
                <Plus className="h-4 w-4" /> Add Building
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register building / site</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-display">Display name</Label>
                  <Input id="b-display" value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="Main Warehouse" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-match">CSV matched name</Label>
                  <Input id="b-match" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="OU_FAC_ALPHA_01" />
                  <p className="text-xs text-muted-foreground">
                    Exact string from the CSV column <code className="rounded bg-muted px-1">OrganizationalUnits.Name</code>.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={!display.trim() || !match.trim()}
                  onClick={() => {
                    addBuilding({
                      organization_id: orgId,
                      custom_display_name: display.trim(),
                      csv_matched_name: match.trim(),
                    });
                    setDisplay(""); setMatch(""); setOpen(false);
                  }}
                >Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display Name</TableHead>
              <TableHead>Matched Name</TableHead>
              <TableHead className="text-right">Meters</TableHead>
              <TableHead>Linked CSV Rows</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {buildings.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer"
                onClick={() => setEditing(b)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-primary" /> {b.custom_display_name}
                    {alertsByBuilding.get(b.id)?.length ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs">
                          <div className="font-medium">Variance Alert</div>
                          <ul className="mt-1 space-y-0.5 text-muted-foreground">
                            {alertsByBuilding.get(b.id)!.map((a, i) => (
                              <li key={i}>{a.label}</li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{b.csv_matched_name}</code></TableCell>
                <TableCell className="text-right font-medium tabular-nums">{meterCount(b.id)}</TableCell>
                <TableCell>{linkedCount(b.id)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (confirm(`Delete building ${b.custom_display_name}?`)) deleteBuilding(b.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {buildings.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No buildings registered for this organisation.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {editing && (
          <EditBuildingDialog
            building={editing}
            onOpenChange={(o) => !o && setEditing(null)}
          />
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}