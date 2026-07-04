import { Building2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBuildings, useOrganisations } from "@/lib/data-store";

export function OrganisationsPanel() {
  const { organisations, addOrganisation, deleteOrganisation } = useOrganisations();
  const { buildings } = useBuildings();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const buildingCount = (id: string) => buildings.filter((b) => b.organization_id === id).length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Organisations</h2>
            <p className="text-xs text-muted-foreground">
              Tenants of the Optimise platform. New orgs appear immediately in the top navbar switcher.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Organisation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New organisation</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Organisation name</Label>
                  <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Haven Holidays" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-loc">Location (optional)</Label>
                  <Input id="org-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="United Kingdom" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={!name.trim()}
                  onClick={() => {
                    addOrganisation(name.trim(), location.trim() || undefined);
                    setName("");
                    setLocation("");
                    setOpen(false);
                  }}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Buildings</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {organisations.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {o.organization_name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{o.location ?? "—"}</TableCell>
                <TableCell>{buildingCount(o.id)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete ${o.organization_name}? This removes its buildings and data.`)) {
                        deleteOrganisation(o.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {organisations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No organisations yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}