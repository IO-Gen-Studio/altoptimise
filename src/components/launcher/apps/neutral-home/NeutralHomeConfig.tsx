import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteNhCategory,
  deleteNhMetric,
  saveNhSiteSettings,
  setNhMeterCategory,
  setNhRoomMap,
  upsertNhCategory,
  upsertNhMetric,
  type NeutralHomeBundle,
  type NhMetric,
} from "@/lib/neutral-home.functions";
import {
  allMetricDefs,
  categoryOptions,
  disciplineKey,

  FIXED_METRICS,
  fixedMetricRow,
  METRIC_SOURCE_LABEL,
  METRIC_SOURCE_UNIT,
  normalizeMetricKeys,
  userMetricRows,
  type FixedMetricSlot,
  type MetricSource,
} from "@/lib/neutral-home/config";
import { classMap } from "@/lib/neutral-home/zones";
import { ZoneMappingTable } from "./ZoneMappingTable";

interface Props {
  orgId: string;
  bundle: NeutralHomeBundle;
  canEdit: boolean;
  onChanged: () => void;
  /** When provided, the panel is locked to this site and the site picker is hidden. */
  siteId?: string;
  /** Renders without the outer card chrome (for use inside a dialog). */
  embedded?: boolean;
}

const SOURCES = Object.keys(METRIC_SOURCE_LABEL) as MetricSource[];

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export function NeutralHomeConfig({
  orgId,
  bundle,
  canEdit,
  onChanged,
  siteId: fixedSiteId,
  embedded = false,
}: Props) {
  const [ownSiteId, setOwnSiteId] = useState(bundle.sites[0]?.id ?? "");
  const siteId = fixedSiteId ?? ownSiteId;
  const setSiteId = setOwnSiteId;
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [metricDialog, setMetricDialog] = useState<MetricDraft | null>(null);

  const siteCats = useMemo(
    () => bundle.categories.filter((c) => c.site_id === siteId),
    [bundle.categories, siteId],
  );
  const options = useMemo(() => categoryOptions(siteCats), [siteCats]);
  const siteMetrics = useMemo(
    () => bundle.metrics.filter((m) => m.site_id === siteId),
    [bundle.metrics, siteId],
  );
  const settings = bundle.settings.find((s) => s.site_id === siteId);

  const circuitNames = useMemo(() => {
    const periodIds = new Set(bundle.periods.filter((p) => p.site_id === siteId).map((p) => p.id));
    const map = new Map<string, string>();
    for (const c of bundle.circuits)
      if (periodIds.has(c.period_id)) map.set(c.circuit_name, c.category);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [bundle.circuits, bundle.periods, siteId]);

  const siteRooms = useMemo(
    () =>
      bundle.roomMap
        .filter((r) => r.site_id === siteId)
        .slice()
        .sort((a, b) => a.room_name.localeCompare(b.room_name)),
    [bundle.roomMap, siteId],
  );

  const classes = useMemo(() => classMap(bundle.meterCategories, siteId), [bundle.meterCategories, siteId]);

  const overrideOf = (name: string) =>
    bundle.meterCategories.find((o) => o.site_id === siteId && o.circuit_name === name)?.category ??
    "";

  const metricDefs = useMemo(() => allMetricDefs(siteMetrics), [siteMetrics]);
  const userRows = useMemo(() => userMetricRows(siteMetrics), [siteMetrics]);
  const selected = settings?.comparison_metrics?.length
    ? normalizeMetricKeys(settings.comparison_metrics, siteMetrics)
    : metricDefs.filter((d) => d.system).map((d) => d.key);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    const t = toast.loading(label);
    try {
      await fn();
      toast.success("Saved", { id: t });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save", { id: t });
    } finally {
      setBusy(false);
    }
  };

  if (!bundle.sites.length) return null;

  const disabled = !canEdit || busy || !siteId;

  const body = (
    <>
      {fixedSiteId ? null : (
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Site configuration</h2>
            <p className="text-sm text-muted-foreground">
              Categories, meter mapping and custom metrics are stored per site.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Site</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bundle.sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Sub-categories</TabsTrigger>
          <TabsTrigger value="meters">Circuits &amp; zones</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="rooms">Rooms &amp; comfort</TabsTrigger>
          <TabsTrigger value="comparison">Period comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">New category name</Label>
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="w-64"
                placeholder="e.g. Server room"
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={disabled || !newCat.trim()}
              onClick={() =>
                run("Adding category…", async () => {
                  await upsertNhCategory({
                    data: {
                      organization_id: orgId,
                      site_id: siteId,
                      code: slug(newCat) || `cat-${Date.now()}`,
                      label: newCat.trim(),
                      hidden: false,
                      sort_order: 200 + options.length,
                    },
                  });
                  setNewCat("");
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Label</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {options.map((o) => (
                  <CategoryRow
                    key={o.code}
                    option={o}
                    disabled={disabled}
                    onRename={(label) =>
                      run("Renaming category…", () =>
                        upsertNhCategory({
                          data: {
                            organization_id: orgId,
                            site_id: siteId,
                            code: o.code,
                            label,
                            hidden: false,
                            sort_order: o.row?.sort_order ?? 100,
                          },
                        }),
                      )
                    }
                    onRemove={() =>
                      run(o.builtin ? "Hiding category…" : "Removing category…", () =>
                        o.builtin
                          ? upsertNhCategory({
                              data: {
                                organization_id: orgId,
                                site_id: siteId,
                                code: o.code,
                                label: o.label,
                                hidden: true,
                                sort_order: o.row?.sort_order ?? 100,
                              },
                            })
                          : deleteNhCategory({ data: { id: o.row!.id } }),
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          {siteCats.some((c) => c.hidden) ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Hidden categories</Label>
              <div className="flex flex-wrap gap-2">
                {siteCats
                  .filter((c) => c.hidden)
                  .map((c) => (
                    <Button
                      key={c.id}
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        run("Restoring category…", () =>
                          upsertNhCategory({
                            data: {
                              organization_id: orgId,
                              site_id: siteId,
                              code: c.code,
                              label: c.label,
                              hidden: false,
                              sort_order: c.sort_order,
                            },
                          }),
                        )
                      }
                    >
                      {c.label} · restore
                    </Button>
                  ))}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="meters" className="mt-4">
          <ZoneMappingTable
            orgId={orgId}
            siteId={siteId}
            circuits={circuitNames}
            classes={classes}
            overrideOf={overrideOf}
            options={options}
            disabled={disabled}
            run={run}
          />
        </TabsContent>

        <TabsContent value="metrics" className="mt-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Fixed metrics</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              These five metrics exist on every site. Map each one to the circuits it should read.
            </p>
            <div className="mt-2 space-y-2">
              {FIXED_METRICS.map((f) => {
                const row = fixedMetricRow(siteMetrics, f.slot);
                return (
                  <div
                    key={f.slot}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {f.name} <span className="text-muted-foreground">({f.unit})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.derived
                          ? f.description
                          : `${row?.circuit_names.length ? `${row.circuit_names.length} meters mapped` : "No meters mapped yet"} · ${
                              (row?.lower_is_better ?? f.lowerIsBetter)
                                ? "decrease is good"
                                : "increase is good"
                            }`}
                      </div>
                    </div>
                    {f.derived ? (
                      <Badge variant="outline">Derived</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => setMetricDialog(fixedDraft(f, row))}
                      >
                        {row ? "Edit mapping" : "Map meters"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">System metrics</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {metricDefs
                .filter((d) => d.system && !d.slot)
                .map((d) => (
                  <Badge key={d.key} variant="outline">
                    {d.label} ({d.unit})
                  </Badge>
                ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">User metrics</h3>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={disabled}
                onClick={() => setMetricDialog(emptyMetric())}
              >
                <Plus className="h-3.5 w-3.5" /> New metric
              </Button>
            </div>
            {!userRows.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No user metrics yet. A user metric sums a chosen value across the meters you map to
                it.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {userRows.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {METRIC_SOURCE_LABEL[m.source as MetricSource] ?? m.source} · {m.unit} ·{" "}
                        {m.circuit_names.length
                          ? `${m.circuit_names.length} meters`
                          : "all sub-circuits"}
                        {" · "}
                        {m.lower_is_better ? "decrease is good" : "increase is good"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => setMetricDialog(draftFrom(m))}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={disabled}
                        onClick={() =>
                          run("Removing metric…", () => deleteNhMetric({ data: { id: m.id } }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>


        <TabsContent value="rooms" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Comfort band minimum (°C)</Label>
              <Input
                type="number"
                step="0.5"
                className="w-32"
                defaultValue={settings?.comfort_min_c ?? 19}
                disabled={disabled}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  void run("Saving comfort band…", () =>
                    saveNhSiteSettings({
                      data: {
                        organization_id: orgId,
                        site_id: siteId,
                        comparison_metrics: selected,
                        comfort_min_c: v,
                        comfort_max_c: settings?.comfort_max_c ?? 21,
                      },
                    }),
                  );
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Comfort band maximum (°C)</Label>
              <Input
                type="number"
                step="0.5"
                className="w-32"
                defaultValue={settings?.comfort_max_c ?? 21}
                disabled={disabled}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  void run("Saving comfort band…", () =>
                    saveNhSiteSettings({
                      data: {
                        organization_id: orgId,
                        site_id: siteId,
                        comparison_metrics: selected,
                        comfort_min_c: settings?.comfort_min_c ?? 19,
                        comfort_max_c: v,
                      },
                    }),
                  );
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Rooms outside this band are flagged on the Temperature tab.
            </p>
          </div>

          {!siteRooms.length ? (
            <p className="text-sm text-muted-foreground">
              Upload a Temperature History report for this site to map rooms to meters.
            </p>
          ) : (
            <ScrollArea className="h-[420px] rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Room (temperature file)</th>
                    <th className="px-4 py-2 font-medium">Mapped meter / circuit</th>
                    <th className="px-4 py-2 font-medium">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRooms.map((r) => (
                    <tr key={r.room_name} className="border-t">
                      <td className="px-4 py-2">{r.room_name}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={r.circuit_name ?? "none"}
                          disabled={disabled}
                          onValueChange={(v) =>
                            run("Updating room mapping…", () =>
                              setNhRoomMap({
                                data: {
                                  organization_id: orgId,
                                  site_id: siteId,
                                  entries: [
                                    {
                                      room_name: r.room_name,
                                      circuit_name: v === "none" ? null : v,
                                      auto_matched: false,
                                      confidence: null,
                                    },
                                  ],
                                },
                              }),
                            )
                          }
                        >
                          <SelectTrigger className="w-72">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not mapped</SelectItem>
                            {circuitNames.map(([name]) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        {r.circuit_name ? (
                          <Badge variant="outline">
                            {r.auto_matched ? "auto" : "manual"}
                            {r.confidence != null
                              ? ` · ${Math.round(r.confidence * 100)}%`
                              : ""}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="comparison" className="mt-4 space-y-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Energy Performance</h3>
              <p className="text-sm text-muted-foreground">
                Metrics shown in the first section of the Performance Metrics table.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {metricDefs.map((d) => (
                <label
                  key={d.key}
                  className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(d.key)}
                    disabled={disabled}
                    onCheckedChange={(v) => {
                      const next = v ? [...selected, d.key] : selected.filter((k) => k !== d.key);
                      void run("Saving comparison metrics…", () =>
                        saveNhSiteSettings({
                          data: {
                            organization_id: orgId,
                            site_id: siteId,
                            comparison_metrics: next,
                          },
                        }),
                      );
                    }}
                  />
                  <span>{d.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {d.system ? "system" : "user"} · {d.unit}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Main Consumers by Discipline</h3>
              <p className="text-sm text-muted-foreground">
                Choose which sub-categories are reported in the second section of the Performance
                Metrics table.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const key = disciplineKey(o.code);
                return (
                  <label key={key} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                    <Checkbox
                      checked={selected.includes(key)}
                      disabled={disabled}
                      onCheckedChange={(v) => {
                        const next = v ? [...selected, key] : selected.filter((k) => k !== key);
                        void run("Saving disciplines…", () =>
                          saveNhSiteSettings({
                            data: {
                              organization_id: orgId,
                              site_id: siteId,
                              comparison_metrics: next,
                            },
                          }),
                        );
                      }}
                    />
                    <span>{o.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">sub-category</span>
                  </label>
                );
              })}
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </>
  );

  return (
    <>
      {embedded ? (
        body
      ) : (
        <Card>
          <CardContent className="p-5">{body}</CardContent>
        </Card>
      )}
      {metricDialog ? (
        <MetricDialog
          draft={metricDialog}
          circuitNames={circuitNames.map(([n]) => n)}
          busy={busy}
          onClose={() => setMetricDialog(null)}
          onSave={(d) =>
            run("Saving metric…", async () => {
              await upsertNhMetric({
                data: {
                  id: d.id,
                  organization_id: orgId,
                  site_id: siteId,
                  name: d.name.trim(),
                  source: d.source,
                  unit: d.unit.trim() || METRIC_SOURCE_UNIT[d.source],
                  circuit_names: d.circuit_names,
                  lower_is_better: d.lower_is_better,
                  sort_order: 200,
                },
              });
              setMetricDialog(null);
            })
          }
        />
      ) : null}
    </>
  );
}

interface MetricDraft {
  id?: string;
  name: string;
  source: MetricSource;
  unit: string;
  circuit_names: string[];
  lower_is_better: boolean;
  /** Set for the fixed metrics — name, value and unit are locked. */
  fixed?: FixedMetricSlot;
}

const emptyMetric = (): MetricDraft => ({
  name: "",
  source: "usage_kwh",
  unit: "",
  circuit_names: [],
  lower_is_better: true,
});

const draftFrom = (m: NhMetric): MetricDraft => ({
  id: m.id,
  name: m.name,
  source: m.source as MetricSource,
  unit: m.unit,
  circuit_names: m.circuit_names,
  lower_is_better: m.lower_is_better,
});

const fixedDraft = (f: FixedMetricSlot, row?: NhMetric): MetricDraft => ({
  id: row?.id,
  name: f.name,
  source: f.source,
  unit: f.unit,
  circuit_names: row?.circuit_names ?? [],
  lower_is_better: row?.lower_is_better ?? f.lowerIsBetter,
  fixed: f,
});

function MetricDialog({
  draft,
  circuitNames,
  busy,
  onClose,
  onSave,
}: {
  draft: MetricDraft;
  circuitNames: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (d: MetricDraft) => void;
}) {
  const [d, setD] = useState(draft);
  const toggle = (name: string) =>
    setD((prev) => ({
      ...prev,
      circuit_names: prev.circuit_names.includes(name)
        ? prev.circuit_names.filter((n) => n !== name)
        : [...prev.circuit_names, name],
    }));

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {d.fixed ? `${d.fixed.name} — mapped meters` : d.id ? "Edit metric" : "New metric"}
          </DialogTitle>
          <DialogDescription>
            {d.fixed
              ? d.fixed.description
              : "A user metric sums the chosen value across the mapped meters. Leave all meters unchecked to use every sub-circuit."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {d.fixed ? null : (
            <>
              <div className="grid gap-1.5">
                <Label>Metric name</Label>
                <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Value</Label>
                <Select
                  value={d.source}
                  onValueChange={(v) => setD({ ...d, source: v as MetricSource })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {METRIC_SOURCE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Unit</Label>
                <Input
                  value={d.unit}
                  placeholder={METRIC_SOURCE_UNIT[d.source]}
                  onChange={(e) => setD({ ...d, unit: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label>Direction of a good change</Label>
            <Select
              value={d.lower_is_better ? "lower" : "higher"}
              onValueChange={(v) => setD({ ...d, lower_is_better: v === "lower" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lower">
                  A decrease is positive (green) — e.g. consumption, cost, carbon
                </SelectItem>
                <SelectItem value="higher">
                  An increase is positive (green) — e.g. solar generation
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls whether a rise vs. last year or baseline is shown as an improvement.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Mapped meters ({d.circuit_names.length})</Label>
            <ScrollArea className="h-56 rounded-lg border p-2">
              <div className="space-y-1">
                {circuitNames.map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={d.circuit_names.includes(n)}
                      onCheckedChange={() => toggle(n)}
                    />
                    <span className="truncate">{n}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button className="gap-1.5" disabled={busy || !d.name.trim()} onClick={() => onSave(d)}>
            <Save className="h-3.5 w-3.5" /> Save metric
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  option,
  disabled,
  onRename,
  onRemove,
}: {
  option: ReturnType<typeof categoryOptions>[number];
  disabled: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(option.label);
  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <Input
          value={label}
          disabled={disabled}
          className="w-56"
          onChange={(e) => setLabel(e.target.value)}
        />
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">{option.code}</td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {option.builtin ? "Built-in" : "User"}
      </td>
      <td className="px-4 py-2 text-right">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || label.trim() === option.label || !label.trim()}
          onClick={() => onRename(label.trim())}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
