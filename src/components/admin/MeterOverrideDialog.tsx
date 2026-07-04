import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBuildings, useMeterOverrides, type MeterRegistryRow } from "@/lib/data-store";

interface Props {
  orgId: string;
  meter: MeterRegistryRow | null;
  onClose: () => void;
}

const UNASSIGNED = "__unassigned";

export function MeterOverrideDialog({ orgId, meter, onClose }: Props) {
  const { buildings } = useBuildings(orgId);
  const { upsertMeterOverride, deleteMeterOverride } = useMeterOverrides(orgId);
  const [displayName, setDisplayName] = useState("");
  const [buildingId, setBuildingId] = useState<string>(UNASSIGNED);
  const [factor, setFactor] = useState<string>("");

  useEffect(() => {
    if (!meter) return;
    setDisplayName(meter.custom_display_name ?? "");
    setBuildingId(meter.effective_building_id ?? UNASSIGNED);
    setFactor(String(meter.effective_meter_factor ?? ""));
  }, [meter]);

  if (!meter) return null;

  const factorChanged = Number(factor) !== meter.csv_meter_factor;

  const save = () => {
    const parsed = Number(factor);
    const { reconciledRows } = upsertMeterOverride({
      raw_meter_name: meter.raw_meter_name,
      organization_id: orgId,
      custom_display_name: displayName.trim() || null,
      assigned_building_id: buildingId === UNASSIGNED ? null : buildingId,
      calibrated_meter_factor: Number.isFinite(parsed) && parsed !== meter.csv_meter_factor ? parsed : null,
    });
    toast.success(
      reconciledRows
        ? `Meter override saved — ${reconciledRows} historical record(s) reconciled`
        : "Meter override saved",
    );
    onClose();
  };

  const reset = () => {
    const { reconciledRows } = deleteMeterOverride(meter.raw_meter_name, orgId);
    toast.success(
      reconciledRows
        ? `Reset to CSV defaults — ${reconciledRows} record(s) reverted`
        : "Reset to CSV defaults",
    );
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit meter override</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Raw meter</div>
            <code className="text-sm">{meter.raw_meter_name}</code>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-name">Custom display name</Label>
            <Input
              id="m-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Main incoming meter"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Assigned building</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.custom_display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Reassigning moves this meter and all its historical & future data to the new building.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-factor">Calibrated meter factor</Label>
            <Input
              id="m-factor"
              type="number"
              step="0.0001"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">CSV default: {meter.csv_meter_factor}</div>
            {factorChanged && (
              <div className="flex items-start gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Altering this factor permanently scales all calculated metrics for this meter.</span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset} disabled={!meter.has_override}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to CSV defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>Save override</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}