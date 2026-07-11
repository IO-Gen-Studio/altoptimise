import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTHS, MONTH_LABEL, useOrganisations, type Organisation } from "@/lib/data-store";
import { PROFILE_LABEL, presetForProfile, type ProfileType } from "@/lib/energy/profile";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props { org: Organisation | null; onOpenChange: (o: boolean) => void }

export function EditOrganisationDialog({ org, onOpenChange }: Props) {
  const { updateOrganisation } = useOrganisations();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("office");
  const [from, setFrom] = useState("08:30");
  const [to, setTo] = useState("17:30");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [peakMonths, setPeakMonths] = useState<number[]>([]);
  const [summerGas, setSummerGas] = useState<number[]>([5, 6, 7, 8, 9]);
  const [holidays, setHolidays] = useState<string>("");
  const [missingPct, setMissingPct] = useState(10);
  const [flatlineHrs, setFlatlineHrs] = useState(24);

  useEffect(() => {
    if (!org) return;
    setName(org.organization_name);
    setLocation(org.location ?? "");
    setProfileType((org.profile_type as ProfileType) ?? "office");
    setFrom((org.active_from ?? "08:30").slice(0, 5));
    setTo((org.active_to ?? "17:30").slice(0, 5));
    setDays(org.active_days ?? [1, 2, 3, 4, 5]);
    setPeakMonths(org.peak_season_months ?? []);
    setSummerGas(org.summer_gas_months ?? [5, 6, 7, 8, 9]);
    setHolidays((org.holidays ?? []).join(", "));
    setMissingPct(org.completeness_missing_pct ?? 10);
    setFlatlineHrs(org.completeness_flatline_hours ?? 24);
  }, [org]);

  if (!org) return null;

  const applyPreset = (p: ProfileType) => {
    setProfileType(p);
    const preset = presetForProfile(p);
    setFrom(preset.activeFrom);
    setTo(preset.activeTo);
    setDays(preset.activeDays);
    setPeakMonths(preset.peakSeasonMonths);
  };

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const save = () => {
    const holidayList = holidays
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    updateOrganisation(org.id, {
      organization_name: name.trim(),
      location: location.trim() || undefined,
      profile_type: profileType,
      active_from: from,
      active_to: to,
      active_days: [...days].sort((a, b) => a - b),
      peak_season_months: [...peakMonths].sort((a, b) => a - b),
      summer_gas_months: [...summerGas].sort((a, b) => a - b),
      holidays: holidayList,
      completeness_missing_pct: Number(missingPct),
      completeness_flatline_hours: Number(flatlineHrs),
    });
    toast.success("Organisation updated");
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Organisation</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Trading profile template</Label>
            <Select value={profileType} onValueChange={(v) => applyPreset(v as ProfileType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="office">{PROFILE_LABEL.office}</SelectItem>
                <SelectItem value="retail">{PROFILE_LABEL.retail}</SelectItem>
                <SelectItem value="evening_peak">{PROFILE_LABEL.evening_peak}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sets default active hours, weekdays and peak season. Buildings inherit this unless overridden.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Active from</Label>
              <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Active to</Label>
              <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Active weekdays</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d, i) => {
                const active = days.includes(i);
                return (
                  <button key={d} type="button" onClick={() => toggle(days, i, setDays)}
                    className={cn("rounded-md border px-3 py-1 text-xs font-medium",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Peak season months</Label>
            <MonthPicker value={peakMonths} onChange={setPeakMonths} />
            <p className="text-xs text-muted-foreground">Used by Evening Peak profile to raise the baseload floor to occupied-standby.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Summer gas months (flatline OK)</Label>
            <MonthPicker value={summerGas} onChange={setSummerGas} />
            <p className="text-xs text-muted-foreground">Gas meters recording 0 in these months are treated as valid, not offline.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Holiday dates</Label>
            <Input value={holidays} onChange={(e) => setHolidays(e.target.value)} placeholder="2026-12-25, 2026-12-26" />
            <p className="text-xs text-muted-foreground">Comma-separated ISO dates (YYYY-MM-DD). Treated as closed / baseload days.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Max missing intervals (%)</Label>
              <Input type="number" min={0} max={100} step={1} value={missingPct}
                onChange={(e) => setMissingPct(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Flatline threshold (hours)</Label>
              <Input type="number" min={1} step={1} value={flatlineHrs}
                onChange={(e) => setFlatlineHrs(Number(e.target.value))} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button className="gap-1.5" onClick={save} disabled={!name.trim()}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonthPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MONTHS.map((m) => {
        const active = value.includes(m);
        return (
          <button key={m} type="button"
            onClick={() => onChange(active ? value.filter((x) => x !== m) : [...value, m])}
            className={cn("rounded-md border px-2.5 py-1 text-xs font-medium",
              active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent")}>
            {MONTH_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}