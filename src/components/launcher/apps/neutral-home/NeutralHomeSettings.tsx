import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  FileSpreadsheet,
  Home,
  Plus,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deleteNhPeriod,
  deleteNhSite,
  appendNhRoomHours,
  saveNhPeriod,
  setNhRoomMap,
  upsertNhSite,
  type NeutralHomeBundle,
  type NhSite,
  type NhPeriod,
} from "@/lib/neutral-home.functions";
import { NeutralHomeConfig } from "./NeutralHomeConfig";
import {
  mergeReports,
  parseDayNightReport,
  parseHeadlineReport,
  type MergeResult,
} from "@/lib/neutral-home/parse";
import {
  mergeTemperatureReports,
  parseTemperatureReport,
  type TemperatureReport,
} from "@/lib/neutral-home/temperature";
import { AUTO_MATCH_THRESHOLD, suggestMatches } from "@/lib/neutral-home/room-match";

interface Props {
  orgId: string;
  bundle: NeutralHomeBundle;
  canEdit: boolean;
  onChanged: () => void;
}

type SiteDraft = {
  id?: string;
  name: string;
  address: string;
  postcode: string;
  floor_area_m2: string;
  occupancy: string;
  hdd_base_c: string;
  notes: string;
};

const emptyDraft: SiteDraft = {
  name: "",
  address: "",
  postcode: "",
  floor_area_m2: "",
  occupancy: "",
  hdd_base_c: "",
  notes: "",
};

export function NeutralHomeSettings({ orgId, bundle, canEdit, onChanged }: Props) {
  const [siteDialog, setSiteDialog] = useState(false);
  const [draft, setDraft] = useState<SiteDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [uploadSite, setUploadSite] = useState<NhSite | null>(null);
  const [configSite, setConfigSite] = useState<NhSite | null>(null);

  const openNew = () => {
    setDraft(emptyDraft);
    setSiteDialog(true);
  };
  const openEdit = (s: NhSite) => {
    setDraft({
      id: s.id,
      name: s.name,
      address: s.address ?? "",
      postcode: s.postcode ?? "",
      floor_area_m2: s.floor_area_m2 == null ? "" : String(s.floor_area_m2),
      occupancy: s.occupancy == null ? "" : String(s.occupancy),
      hdd_base_c: s.hdd_base_c == null ? "" : String(s.hdd_base_c),
      notes: s.notes ?? "",
    });
    setSiteDialog(true);
  };

  const saveSite = async () => {
    if (!draft.name.trim()) {
      toast.error("Site name is required");
      return;
    }
    setSaving(true);
    try {
      await upsertNhSite({
        data: {
          id: draft.id,
          organization_id: orgId,
          name: draft.name.trim(),
          address: draft.address.trim() || null,
          postcode: draft.postcode.trim().toUpperCase() || null,
          floor_area_m2: draft.floor_area_m2 ? Number(draft.floor_area_m2) : null,
          occupancy: draft.occupancy ? Number(draft.occupancy) : null,
          hdd_base_c: draft.hdd_base_c ? Number(draft.hdd_base_c) : null,
          notes: draft.notes.trim() || null,
        },
      });
      toast.success(draft.id ? "Site updated" : "Site created");
      setSiteDialog(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save site");
    } finally {
      setSaving(false);
    }
  };

  const removeSite = async (s: NhSite) => {
    if (!window.confirm(`Delete "${s.name}" and all of its uploaded periods?`)) return;
    try {
      await deleteNhSite({ data: { id: s.id } });
      toast.success("Site deleted");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete site");
    }
  };

  const removePeriod = async (id: string) => {
    if (!window.confirm("Delete this period and its circuit data?")) return;
    try {
      await deleteNhPeriod({ data: { id } });
      toast.success("Period deleted");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete period");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Sites</h2>
              <p className="text-sm text-muted-foreground">
                Create a site first, then upload its Envisij reports.
              </p>
            </div>
            {canEdit ? (
              <Button size="sm" onClick={openNew} className="gap-1.5">
                <Plus className="h-4 w-4" /> New site
              </Button>
            ) : null}
          </div>

          {!bundle.sites.length ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
              <Home className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No sites yet for this organisation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bundle.sites.map((s) => {
                const periods = bundle.periods.filter((p) => p.site_id === s.id);
                return (
                  <div key={s.id} className="rounded-lg border">
                    <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {periods.length} {periods.length === 1 ? "period" : "periods"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {[s.address, s.postcode].filter(Boolean).join(", ") || "No address"}
                          {s.floor_area_m2
                            ? ` · ${Number(s.floor_area_m2).toLocaleString()} m²`
                            : ""}
                          {s.occupancy
                            ? ` · ${Number(s.occupancy).toLocaleString()} occupants`
                            : ""}
                        </div>
                      </div>
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setUploadSite(s)}
                          >
                            <Upload className="h-3.5 w-3.5" /> Upload reports
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setConfigSite(s)}
                          >
                            <Settings2 className="h-3.5 w-3.5" /> Configure
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => removeSite(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {periods.length ? (
                      <div className="border-t">
                        <PeriodsTable
                          periods={periods}
                          circuitCount={(id) =>
                            bundle.circuits.filter((c) => c.period_id === id).length
                          }
                          canEdit={canEdit}
                          onDelete={removePeriod}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={siteDialog} onOpenChange={setSiteDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit site" : "New site"}</DialogTitle>
            <DialogDescription>
              Floor area and occupancy are stored for reference. Postcode will drive degree-day
              analysis later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nh-name">Site name</Label>
              <Input
                id="nh-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nh-address">Address</Label>
              <Input
                id="nh-address"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="nh-postcode">Postcode</Label>
                <Input
                  id="nh-postcode"
                  value={draft.postcode}
                  onChange={(e) => setDraft({ ...draft, postcode: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nh-area">Floor area (m²)</Label>
                <Input
                  id="nh-area"
                  type="number"
                  value={draft.floor_area_m2}
                  onChange={(e) => setDraft({ ...draft, floor_area_m2: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nh-occ">Occupancy</Label>
                <Input
                  id="nh-occ"
                  type="number"
                  value={draft.occupancy}
                  onChange={(e) => setDraft({ ...draft, occupancy: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nh-hdd">HDD base temperature (°C)</Label>
                <Input
                  id="nh-hdd"
                  type="number"
                  step="0.1"
                  placeholder="15.5"
                  value={draft.hdd_base_c}
                  onChange={(e) => setDraft({ ...draft, hdd_base_c: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nh-notes">Notes</Label>
              <Textarea
                id="nh-notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveSite} disabled={saving}>
              {saving ? "Saving…" : "Save site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {uploadSite ? (
        <UploadDrawer
          site={uploadSite}
          orgId={orgId}
          mappedRooms={
            new Set(
              bundle.roomMap
                .filter((r) => r.site_id === uploadSite.id && r.circuit_name)
                .map((r) => r.room_name),
            )
          }
          onClose={() => setUploadSite(null)}
          onSaved={() => {
            setUploadSite(null);
            onChanged();
          }}
        />
      ) : null}

      <Dialog open={!!configSite} onOpenChange={(o) => !o && setConfigSite(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Site configuration — {configSite?.name}</DialogTitle>
            <DialogDescription>
              Categories, meter mapping and custom metrics for this site.
            </DialogDescription>
          </DialogHeader>
          {configSite ? (
            <NeutralHomeConfig
              orgId={orgId}
              bundle={bundle}
              canEdit={canEdit}
              onChanged={onChanged}
              siteId={configSite.id}
              embedded
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type PeriodSortKey = "label" | "range" | "circuits" | "files";

function PeriodsTable({
  periods,
  circuitCount,
  canEdit,
  onDelete,
}: {
  periods: NhPeriod[];
  circuitCount: (id: string) => number;
  canEdit: boolean;
  onDelete: (id: string) => void;
}) {
  const [key, setKey] = useState<PeriodSortKey>("range");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const mult = dir === "asc" ? 1 : -1;
    const files = (p: NhPeriod) =>
      [p.source_headline_filename, p.source_daynight_filename, p.source_temperature_filename]
        .filter(Boolean)
        .join(" · ");
    return [...periods].sort((a, b) => {
      if (key === "circuits") return (circuitCount(a.id) - circuitCount(b.id)) * mult;
      if (key === "range") return a.period_start.localeCompare(b.period_start) * mult;
      if (key === "files") return files(a).localeCompare(files(b)) * mult;
      return a.label.localeCompare(b.label) * mult;
    });
  }, [periods, key, dir, circuitCount]);

  const toggle = (k: PeriodSortKey) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir(k === "circuits" || k === "range" ? "desc" : "asc");
    }
  };

  const Th = ({ label, col }: { label: string; col: PeriodSortKey }) => (
    <th className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => toggle(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          key === col ? "text-foreground" : "",
        )}
      >
        {label}
        {key === col ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <Th label="Period" col="label" />
          <Th label="Range" col="range" />
          <Th label="Circuits" col="circuits" />
          <Th label="Files" col="files" />
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.id} className="border-t">
            <td className="px-4 py-2 font-medium">{p.label}</td>
            <td className="px-4 py-2 text-muted-foreground">
              {p.period_start} → {p.period_end}
            </td>
            <td className="px-4 py-2 text-muted-foreground">{circuitCount(p.id)}</td>
            <td className="px-4 py-2 text-xs text-muted-foreground">
              {[
                p.source_headline_filename,
                p.source_daynight_filename,
                p.source_temperature_filename,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </td>
            <td className="px-4 py-2 text-right">
              {canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onDelete(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FileSlot({
  label,
  file,
  onPick,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "cursor-pointer rounded-lg border border-dashed p-4 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "hover:border-primary/50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <FileSpreadsheet className="mx-auto h-5 w-5 text-muted-foreground" />
      <div className="mt-2 text-sm font-medium">{label}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {file ? file.name : "Drop .xlsx or .csv here, or click to browse"}
      </div>
    </div>
  );
}

function MultiFileSlot({
  label,
  files,
  onPick,
}: {
  label: string;
  files: File[];
  onPick: (f: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dropped = Array.from(e.dataTransfer.files ?? []);
        if (dropped.length) onPick([...files, ...dropped]);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "cursor-pointer rounded-lg border border-dashed p-4 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "hover:border-primary/50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => onPick([...files, ...Array.from(e.target.files ?? [])])}
      />
      <FileSpreadsheet className="mx-auto h-5 w-5 text-muted-foreground" />
      <div className="mt-2 text-sm font-medium">{label}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {files.length
          ? files.map((f) => f.name).join(", ")
          : "Drop one or more .csv / .xlsx here, or click to browse"}
      </div>
      {files.length ? (
        <button
          type="button"
          className="mt-1 text-xs text-destructive underline"
          onClick={(e) => {
            e.stopPropagation();
            onPick([]);
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-07-01" -> "Jul 2026" */
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const name = MONTH_NAMES[Number(m) - 1] ?? m;
  return `${name} ${y}`;
}

function UploadDrawer({
  site,
  orgId,
  mappedRooms,
  onClose,
  onSaved,
}: {
  site: NhSite;
  orgId: string;
  mappedRooms: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [headline, setHeadline] = useState<File | null>(null);
  const [daynight, setDaynight] = useState<File | null>(null);
  const [temps, setTemps] = useState<File[]>([]);
  const [tempResult, setTempResult] = useState<TemperatureReport | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [mode, setMode] = useState<"merge" | "replace">("replace");
  const [result, setResult] = useState<MergeResult | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const analyse = async () => {
    if (!headline && !daynight && !temps.length) {
      toast.error("Pick at least one report to upload");
      return;
    }
    setBusy(true);
    const t = toast.loading("Parsing reports…");
    try {
      const [h, d] = await Promise.all([
        headline ? parseHeadlineReport(headline) : Promise.resolve(null),
        daynight ? parseDayNightReport(daynight) : Promise.resolve(null),
      ]);
      const merged = h || d ? mergeReports(h, d) : null;
      setResult(merged);
      if (merged?.range) setLabel(merged.range.label);

      let temp: TemperatureReport | null = null;
      if (temps.length) {
        const parsed: TemperatureReport[] = [];
        for (const f of temps) {
          toast.loading(`Reading ${f.name}…`, { id: t });
          parsed.push(
            await parseTemperatureReport(f, (rows) =>
              setProgress(`${f.name}: ${rows.toLocaleString()} readings`),
            ),
          );
        }
        temp = mergeTemperatureReports(parsed);
        setProgress("");
      }
      setTempResult(temp);
      if (!merged?.range && temp?.startISO && temp.endISO) {
        setLabel((l) => l || monthLabel(temp!.startISO!));
      }
      toast.success(
        merged
          ? `Parsed ${merged.circuits.length} circuits`
          : `Parsed ${temp?.rooms.length ?? 0} rooms`,
        { id: t },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse the files", { id: t });
    } finally {
      setBusy(false);
    }
  };

  /** Period range: from the usage reports when present, otherwise from the temperature file. */
  const range = result?.range
    ? result.range
    : tempResult?.startISO && tempResult.endISO
      ? {
          startISO: tempResult.startISO,
          endISO: tempResult.endISO,
          label: monthLabel(tempResult.startISO),
        }
      : null;

  const commit = async () => {
    if (!range) return;
    setBusy(true);
    const t = toast.loading("Saving period…");
    try {
      const res = await saveNhPeriod({
        data: {
          organization_id: orgId,
          site_id: site.id,
          label: label.trim() || range.label,
          period_start: range.startISO,
          period_end: range.endISO,
          source_headline_filename: headline?.name ?? null,
          source_daynight_filename: daynight?.name ?? null,
          source_temperature_filename: tempResult?.fileName ?? null,
          hasTemperature: !!tempResult?.hours.length,
          mode,
          circuits: (result?.circuits ?? []).map((c) => ({
            circuit_name: c.circuit_name,
            category: c.category,
            is_aggregate: c.is_aggregate,
            usage_kwh: c.usage_kwh,
            co2_kg: c.co2_kg,
            blended_p_kwh: c.blended_p_kwh,
            day_p_kwh: c.day_p_kwh,
            night_p_kwh: c.night_p_kwh,
            total_cost_p: c.total_cost_p,
            day_kwh: c.day_kwh,
            day_pct: c.day_pct,
            night_kwh: c.night_kwh,
            night_pct: c.night_pct,
            daynight_total_kwh: c.daynight_total_kwh,
            usage_kwh_per_person: c.usage_kwh_per_person,
            usage_kwh_per_m2: c.usage_kwh_per_m2,
            cost_p_per_person: c.cost_p_per_person,
            cost_p_per_m2: c.cost_p_per_m2,
            co2_kg_per_person: c.co2_kg_per_person,
            co2_kg_per_m2: c.co2_kg_per_m2,
          })),
        },
      });

      const hours = tempResult?.hours ?? [];
      for (let i = 0; i < hours.length; i += 2000) {
        toast.loading(
          `Saving temperature data… ${Math.min(i + 2000, hours.length).toLocaleString()} / ${hours.length.toLocaleString()}`,
          { id: t },
        );
        await appendNhRoomHours({
          data: {
            organization_id: orgId,
            site_id: site.id,
            period_id: res.periodId,
            rows: hours.slice(i, i + 2000),
          },
        });
      }

      let autoMapped = 0;
      if (tempResult?.rooms.length) {
        const fresh = tempResult.rooms.filter((r) => !mappedRooms.has(r));
        const entries = suggestMatches(
          fresh,
          (result?.circuits ?? []).map((c) => c.circuit_name),
        ).map((s) => {
          const auto = !!s.circuit && s.confidence >= AUTO_MATCH_THRESHOLD;
          if (auto) autoMapped += 1;
          return {
            room_name: s.room,
            circuit_name: auto ? s.circuit : null,
            auto_matched: auto,
            confidence: s.circuit ? s.confidence : null,
          };
        });
        if (entries.length) {
          await setNhRoomMap({
            data: { organization_id: orgId, site_id: site.id, entries },
          });
        }
      }

      toast.success(
        [
          res.circuits ? `Saved ${res.circuits} circuits` : `Saved period ${label.trim() || range.label}`,
          hours.length ? `${hours.length.toLocaleString()} hourly temperature rows` : null,
          autoMapped ? `${autoMapped} rooms auto-mapped` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        { id: t },
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the period", { id: t });
    } finally {
      setBusy(false);
    }
  };

  const v = result?.validation;
  const tempErrors = tempResult?.missingColumns.length
    ? [`Temperature report is missing required columns: ${tempResult.missingColumns.join(", ")}`]
    : [];
  const tempWarnings: string[] = [];
  if (tempResult) {
    if (tempResult.roomsWithoutReadings.length)
      tempWarnings.push(
        `${tempResult.roomsWithoutReadings.length} room(s) had no readings and were skipped: ${tempResult.roomsWithoutReadings.join(", ")}`,
      );
    if (tempResult.rowsDropped)
      tempWarnings.push(
        `${tempResult.rowsDropped.toLocaleString()} temperature row(s) could not be read and were ignored.`,
      );
    if (
      result?.range &&
      tempResult.startISO &&
      tempResult.endISO &&
      (tempResult.endISO < result.range.startISO || tempResult.startISO > result.range.endISO)
    )
      tempWarnings.push(
        "The temperature date range does not overlap the usage period — combined analysis will be empty.",
      );
  }
  const analysed = !!result || !!tempResult;
  if (analysed && !range)
    tempErrors.push("Could not read a reporting date range from the uploaded file(s).");
  const blocked = !analysed || !range || !!v?.errors.length || !!tempErrors.length;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Envisij reports — {site.name}</DialogTitle>
          <DialogDescription>
            Upload any combination of the three reports — each one can be uploaded on its own. The
            Headline report carries cost, carbon and intensity, the Day/Night report adds the
            day/night split, and the Temperature History adds room-level comfort analysis.
            Temperature files are aggregated to hourly averages in your browser before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FileSlot
            label="1. Headline Usage Report (optional)"
            file={headline}
            onPick={setHeadline}
          />
          <FileSlot
            label="2. Day/Night Group Overview (optional)"
            file={daynight}
            onPick={setDaynight}
          />
          <MultiFileSlot
            label="3. Temperature History (optional)"
            files={temps}
            onPick={setTemps}
          />
        </div>
        {progress ? <p className="text-xs text-muted-foreground">{progress}</p> : null}

        <div className="grid gap-2">
          <Label>If this period already exists</Label>
          <RadioGroup
            value={mode}
            onValueChange={(v2) => setMode(v2 as "merge" | "replace")}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="replace" id="nh-replace" />
              <Label htmlFor="nh-replace" className="font-normal">
                Replace existing circuits
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="merge" id="nh-merge" />
              <Label htmlFor="nh-merge" className="font-normal">
                Merge (update matching, keep the rest)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {analysed ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {result ? (
                <>
                  <Badge variant="outline">{v?.headlineCount} headline rows</Badge>
                  <Badge variant="outline">{v?.daynightCount} day/night rows</Badge>
                  <Badge variant="outline">{result.circuits.length} joined circuits</Badge>
                </>
              ) : null}
              {range ? (
                <Badge variant="outline">
                  {range.startISO} → {range.endISO}
                </Badge>
              ) : null}
              {tempResult ? (
                <>
                  <Badge variant="outline">{tempResult.rooms.length} rooms</Badge>
                  <Badge variant="outline">
                    {tempResult.hours.length.toLocaleString()} hourly rows
                  </Badge>
                  {tempResult.startISO ? (
                    <Badge variant="outline">
                      temp {tempResult.startISO} → {tempResult.endISO}
                    </Badge>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nh-label">Period label</Label>
              <Input id="nh-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>

            {[...(v?.errors ?? []), ...tempErrors].length ? (
              <ul className="space-y-1 text-sm text-destructive">
                {[...(v?.errors ?? []), ...tempErrors].map((e) => (
                  <li key={e} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            ) : null}
            {[...(v?.warnings ?? []), ...tempWarnings].length ? (
              <ul className="space-y-1 text-sm text-amber-600">
                {[...(v?.warnings ?? []), ...tempWarnings].map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}
            {!v?.errors.length && !v?.warnings.length && !tempErrors.length && !tempWarnings.length ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Everything parsed cleanly.
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={analyse} disabled={busy || (!headline && !daynight && !temps.length)}>
            {busy ? "Working…" : "Validate"}
          </Button>
          <Button onClick={commit} disabled={busy || blocked}>
            Save period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
