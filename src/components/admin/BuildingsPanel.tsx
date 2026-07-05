import { Plus, Trash2, Warehouse } from "lucide-react";
import { useState } from "react";

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
import { useBuildings, useConsumption, useOrganisations, type Building } from "@/lib/data-store";

export function BuildingsPanel() {
  const { organisations } = useOrganisations();
  const [orgId, setOrgId] = useState<string>(organisations[0]?.id ?? "");
  const { buildings, addBuilding, deleteBuilding } = useBuildings(orgId);
  const { consumption } = useConsumption();
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("");
  const [match, setMatch] = useState("");
  const [editing, setEditing] = useState<Building | null>(null);

  const linkedCount = (bid: string) => consumption.filter((c) => c.building_id === bid).length;

  return (
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
              <TableHead>Display name</TableHead>
              <TableHead>CSV matched name</TableHead>
              <TableHead>Linked CSV rows</TableHead>
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
                  </div>
                </TableCell>
                <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{b.csv_matched_name}</code></TableCell>
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
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
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
  );
}