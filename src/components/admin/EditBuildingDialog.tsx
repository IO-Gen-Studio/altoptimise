import { ArrowRightLeft, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useBuildings,
  useDataStore,
  useMeterOverrides,
  useMeterRegistry,
  useSchedules,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type Building,
  type Schedule,
  type Weekday,
} from "@/lib/data-store";
import { cn } from "@/lib/utils";

interface Props {
  building: Building | null;
  onOpenChange: (open: boolean) => void;
}

export function EditBuildingDialog({ building, onOpenChange }: Props) {
  if (!building) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Building: {building.custom_display_name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info" className="mt-2">
          <TabsList>
            <TabsTrigger value="info">Building Information</TabsTrigger>
            <TabsTrigger value="meters">Meter List</TabsTrigger>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            <InfoTab building={building} />
          </TabsContent>
          <TabsContent value="meters">
            <MetersTab building={building} />
          </TabsContent>
          <TabsContent value="schedules">
            <SchedulesTab building={building} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function InfoTab({ building }: { building: Building }) {
  const { updateBuilding } = useBuildings(building.organization_id);
  const [display, setDisplay] = useState(building.custom_display_name);
  const [match, setMatch] = useState(building.csv_matched_name);
  const [address, setAddress] = useState(building.address ?? "");

  useEffect(() => {
    setDisplay(building.custom_display_name);
    setMatch(building.csv_matched_name);
    setAddress(building.address ?? "");
  }, [building.id, building.custom_display_name, building.csv_matched_name, building.address]);

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="eb-display">Custom Display Name</Label>
        <Input id="eb-display" value={display} onChange={(e) => setDisplay(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eb-match">CSV Matched Name</Label>
        <Input
          id="eb-match"
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Exact string from the CSV column <code className="rounded bg-muted px-1">OrganizationalUnits.Name</code>.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eb-address">Physical Address / Description</Label>
        <Textarea
          id="eb-address"
          rows={4}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, city, postcode. Notes about access, floor area, occupancy…"
        />
      </div>
      <div className="flex justify-end">
        <Button
          className="gap-1.5"
          disabled={!display.trim() || !match.trim()}
          onClick={() => {
            updateBuilding(building.id, {
              custom_display_name: display.trim(),
              csv_matched_name: match.trim(),
              address: address.trim() || undefined,
            });
            toast.success("Building updated");
          }}
        >
          <Save className="h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}

function MetersTab({ building }: { building: Building }) {
  const registry = useMeterRegistry(building.organization_id);
  const { buildings } = useBuildings(building.organization_id);
  const { upsertMeterOverride } = useMeterOverrides(building.organization_id);

  const meters = useMemo(
    () => registry.filter((m) => m.effective_building_id === building.id),
    [registry, building.id],
  );
  const otherBuildings = buildings.filter((b) => b.id !== building.id);

  const move = (m: (typeof meters)[number], targetId: string) => {
    const target = buildings.find((b) => b.id === targetId);
    const { reconciledRows } = upsertMeterOverride({
      raw_meter_name: m.raw_meter_name,
      organization_id: building.organization_id,
      custom_display_name: m.custom_display_name,
      assigned_building_id: targetId,
      calibrated_meter_factor:
        m.effective_meter_factor !== m.csv_meter_factor ? m.effective_meter_factor : null,
    });
    toast.success(
      `Moved ${m.custom_display_name ?? m.raw_meter_name} → ${target?.custom_display_name ?? "building"}` +
        (reconciledRows ? ` (${reconciledRows} record(s) reassigned)` : ""),
    );
  };

  return (
    <div className="py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Raw Meter Name</TableHead>
            <TableHead>Custom Display Name</TableHead>
            <TableHead>Utility Category</TableHead>
            <TableHead className="w-32 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meters.map((m) => (
            <TableRow key={m.raw_meter_name}>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{m.raw_meter_name}</code>
              </TableCell>
              <TableCell className="text-sm">{m.custom_display_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                <Badge variant="secondary">{m.utility_category || "Uncategorised"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={otherBuildings.length === 0}>
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Move
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1">
                    <div className="px-2 py-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                      Move to building
                    </div>
                    {otherBuildings.map((b) => (
                      <button
                        key={b.id}
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => move(m, b.id)}
                      >
                        {b.custom_display_name}
                      </button>
                    ))}
                    {otherBuildings.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No other buildings.</div>
                    )}
                  </PopoverContent>
                </Popover>
              </TableCell>
            </TableRow>
          ))}
          {meters.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                No meters routed to this building yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface ScheduleForm {
  id: string | null;
  name: string;
  days: Weekday[];
  from: string;
  to: string;
}

const emptyForm: ScheduleForm = { id: null, name: "", days: [], from: "09:00", to: "17:00" };

function SchedulesTab({ building }: { building: Building }) {
  const { schedules, addSchedules, updateSchedule, deleteSchedule } = useSchedules(building.id);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);

  const toggleDay = (d: Weekday) =>
    setForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d],
    }));

  const submit = () => {
    if (!form.name.trim() || form.days.length === 0) {
      toast.error("Add a name and at least one day");
      return;
    }
    if (form.from >= form.to) {
      toast.error("'From' time must be before 'To' time");
      return;
    }
    if (form.id) {
      // edit mode: keep the single row but retarget its day to the first selected
      updateSchedule(form.id, { name: form.name.trim(), day: form.days[0], from: form.from, to: form.to });
      const extras = form.days.slice(1);
      if (extras.length) {
        addSchedules(
          extras.map((day) => ({
            building_id: building.id,
            name: form.name.trim(),
            day,
            from: form.from,
            to: form.to,
          })),
        );
      }
      toast.success("Schedule updated");
    } else {
      addSchedules(
        form.days.map((day) => ({
          building_id: building.id,
          name: form.name.trim(),
          day,
          from: form.from,
          to: form.to,
        })),
      );
      toast.success(`Added ${form.days.length} schedule block(s)`);
    }
    setForm(emptyForm);
  };

  const startEdit = (s: Schedule) =>
    setForm({ id: s.id, name: s.name, days: [s.day], from: s.from, to: s.to });

  const copyToDays = (s: Schedule, targets: Weekday[]) => {
    const filtered = targets.filter((d) => d !== s.day);
    if (!filtered.length) return;
    addSchedules(
      filtered.map((day) => ({
        building_id: building.id,
        name: s.name,
        day,
        from: s.from,
        to: s.to,
      })),
    );
    toast.success(`Copied to ${filtered.length} day(s)`);
  };

  return (
    <div className="space-y-6 py-2">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {form.id ? "Edit schedule block" : "Add schedule block"}
          </h3>
          {form.id && (
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setForm(emptyForm)}>
              <X className="h-3.5 w-3.5" /> Cancel edit
            </Button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="sch-name">Description / Name</Label>
            <Input
              id="sch-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Standard Day Shift"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Day(s) of the Week</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = form.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent",
                    )}
                  >
                    {WEEKDAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Select multiple days to apply the same hours to each.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-from">From</Label>
            <Input id="sch-from" type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-to">To</Label>
            <Input id="sch-to" type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button className="gap-1.5" onClick={submit}>
            <Plus className="h-4 w-4" /> {form.id ? "Save schedule" : "Add schedule"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Saved schedules</h3>
        {schedules.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No operational schedules yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {schedules.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>{WEEKDAY_LABEL[s.day]}</Badge>
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.from} – {s.to}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <CopyToDaysPopover schedule={s} onCopy={(targets) => copyToDays(s, targets)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEdit(s)}
                    aria-label="Edit schedule"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteSchedule(s.id)}
                    aria-label="Delete schedule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CopyToDaysPopover({
  schedule,
  onCopy,
}: {
  schedule: Schedule;
  onCopy: (targets: Weekday[]) => void;
}) {
  const [selected, setSelected] = useState<Weekday[]>([]);
  const [open, setOpen] = useState(false);

  const toggle = (d: Weekday) =>
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSelected([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
          Copy to days
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Duplicate {schedule.from}–{schedule.to}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.filter((d) => d !== schedule.day).map((d) => {
            const active = selected.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent",
                )}
              >
                {WEEKDAY_LABEL[d]}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={() => {
              onCopy(selected);
              setSelected([]);
              setOpen(false);
            }}
          >
            Copy
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}