import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Files, Snowflake, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuildings } from "@/lib/data-store";
import { useLauncher } from "@/lib/launcher-context";
import { parseRefrigerationCSV } from "@/lib/refrigeration/parse";
import type { RefrigerationCaseRow } from "@/lib/refrigeration/types";
import {
  deleteRefrigerationCase,
  loadRefrigerationOverview,
  saveRefrigerationAlarmLog,
  saveRefrigerationCase,
  saveRefrigerationSettings,
  updateRefrigerationCase,
} from "@/lib/refrigeration.functions";

export function RefrigerationPanel() {
  const { org } = useLauncher();
  const { buildings } = useBuildings(org.id);
  const overviewFn = useServerFn(loadRefrigerationOverview);
  const saveCaseFn = useServerFn(saveRefrigerationCase);
  const updateCaseFn = useServerFn(updateRefrigerationCase);
  const deleteCaseFn = useServerFn(deleteRefrigerationCase);
  const saveAlarmFn = useServerFn(saveRefrigerationAlarmLog);
  const saveSettingsFn = useServerFn(saveRefrigerationSettings);

  const [cases, setCases] = useState<RefrigerationCaseRow[]>([]);
  const [buildingId, setBuildingId] = useState<string>("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [defaults, setDefaults] = useState({ temp: "8", red: "5", amber: "2" });
  const caseInput = useRef<HTMLInputElement>(null);
  const alarmInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!org.id || org.id === "none") return;
    const res = await overviewFn({ data: { orgId: org.id } });
    setCases(res.cases);
    if (res.settings) {
      setDefaults({
        temp: String(res.settings.default_max_safe_temp),
        red: String(res.settings.default_efficiency_red),
        amber: String(res.settings.default_efficiency_amber),
      });
    }
  }, [org.id, overviewFn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!buildingId && buildings[0]) setBuildingId(buildings[0].id);
  }, [buildings, buildingId]);

  const handleCaseFiles = async (files: FileList) => {
    if (!buildingId) {
      toast.error("Select a site first");
      return;
    }
    setBusy(true);
    const id = toast.loading(`Uploading 0 of ${files.length} case files…`);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      toast.loading(`Uploading ${i + 1} of ${files.length} case files…`, { id });
      try {
        const text = await file.text();
        const { site } = parseRefrigerationCSV(text);
        const caseId = site.controller || file.name.replace(/\.csv$/i, "");
        await saveCaseFn({
          data: {
            orgId: org.id,
            buildingId,
            caseId,
            label: site.controllerDescription || caseId,
            description: site.controllerDescription || "",
            controller: site.controller || "",
            controllerDescription: site.controllerDescription || "",
            csvText: text,
            sourceFilename: file.name,
            mode,
          },
        });
        ok++;
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    toast.success(`${ok} of ${files.length} case files imported`, { id });
    await refresh();
    setBusy(false);
  };

  const handleAlarmFile = async (file: File) => {
    if (!buildingId) {
      toast.error("Select a site first");
      return;
    }
    setBusy(true);
    try {
      await saveAlarmFn({
        data: {
          orgId: org.id,
          buildingId,
          alarmCsv: await file.text(),
          sourceFilename: file.name,
        },
      });
      toast.success("Alarm log saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const siteCases = cases.filter((c) => c.building_id === buildingId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Snowflake className="h-4 w-4 text-primary" /> Refrigeration data upload
          </CardTitle>
          <CardDescription>
            Upload controller case exports and alarm logs per site. Cases appear in the
            Refrigeration Monitoring app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.custom_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Import mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge with existing readings</SelectItem>
                  <SelectItem value="replace">Replace case data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => caseInput.current?.click()}
                className="gap-1.5"
              >
                <Files className="h-4 w-4" /> Case CSVs
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => alarmInput.current?.click()}
                className="gap-1.5"
              >
                <AlertTriangle className="h-4 w-4" /> Alarm log
              </Button>
            </div>
          </div>
          <input
            ref={caseInput}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleCaseFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={alarmInput}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAlarmFile(f);
              e.target.value = "";
            }}
          />

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Case</th>
                  <th className="px-3 py-2 text-left font-medium">Label</th>
                  <th className="px-3 py-2 text-right font-medium">Cut-in °C</th>
                  <th className="px-3 py-2 text-right font-medium">Red %</th>
                  <th className="px-3 py-2 text-right font-medium">Amber %</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {siteCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No cases for this site yet.
                    </td>
                  </tr>
                ) : (
                  siteCases.map((c) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-3 py-2 font-medium">{c.case_id}</td>
                      <td className="px-3 py-2">
                        <Input
                          defaultValue={c.label}
                          className="h-8"
                          onBlur={async (e) => {
                            if (e.target.value === c.label) return;
                            await updateCaseFn({
                              data: { id: c.id, label: e.target.value },
                            });
                            toast.success("Case updated");
                            void refresh();
                          }}
                        />
                      </td>
                      {(
                        [
                          ["maxSafeTemp", c.max_safe_temp],
                          ["efficiencyRed", c.efficiency_red],
                          ["efficiencyAmber", c.efficiency_amber],
                        ] as const
                      ).map(([key, val]) => (
                        <td key={key} className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="0.1"
                            defaultValue={val}
                            className="h-8 w-20 text-right"
                            onBlur={async (e) => {
                              const num = parseFloat(e.target.value);
                              if (!isFinite(num) || num === val) return;
                              await updateCaseFn({ data: { id: c.id, [key]: num } });
                              toast.success("Case updated");
                              void refresh();
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete case ${c.case_id}`}
                          onClick={async () => {
                            await deleteCaseFn({ data: { id: c.id } });
                            toast.success("Case deleted");
                            void refresh();
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Default thresholds</CardTitle>
          <CardDescription>
            Applied to newly imported cases for this organisation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Cut-in temp (°C)</Label>
            <Input
              type="number"
              step="0.1"
              value={defaults.temp}
              onChange={(e) => setDefaults((d) => ({ ...d, temp: e.target.value }))}
              className="w-28"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Red ≥ %</Label>
            <Input
              type="number"
              value={defaults.red}
              onChange={(e) => setDefaults((d) => ({ ...d, red: e.target.value }))}
              className="w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Amber ≥ %</Label>
            <Input
              type="number"
              value={defaults.amber}
              onChange={(e) => setDefaults((d) => ({ ...d, amber: e.target.value }))}
              className="w-24"
            />
          </div>
          <Button
            onClick={async () => {
              await saveSettingsFn({
                data: {
                  orgId: org.id,
                  defaultMaxSafeTemp: parseFloat(defaults.temp) || 8,
                  defaultEfficiencyRed: parseFloat(defaults.red) || 5,
                  defaultEfficiencyAmber: parseFloat(defaults.amber) || 2,
                },
              });
              toast.success("Defaults saved");
            }}
          >
            Save defaults
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
