import { CheckCircle2, FileUp, Loader2, Upload, AlertCircle, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildings, useConsumption, useIngestionSettings, useMeterOverrides, useOrganisations } from "@/lib/data-store";
import { cn } from "@/lib/utils";
import { parseCsv, pivotRows, type ParsedCsv } from "@/lib/csv-parser";

interface ParsedFile {
  fileName: string;
  parsed: ParsedCsv;
}

export function CsvIngestion() {
  const { organisations } = useOrganisations();
  const [orgId, setOrgId] = useState<string>("");
  const { buildings, addBuilding } = useBuildings(orgId);
  const { bulkInsertConsumption } = useConsumption();
  const { overrides } = useMeterOverrides(orgId);
  const { markSynced } = useIngestionSettings();
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [processing, setProcessing] = useState<{ current: number; total: number; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [selectedUnits, setSelectedUnits] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: File[]) => {
    if (!orgId) {
      toast.error("Select an organisation before uploading");
      return;
    }
    if (!fileList.length) return;
    const tId = toast.loading(`Parsing ${fileList.length} file(s)…`);
    const results: ParsedFile[] = [];
    let totalRows = 0;
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setProcessing({ current: i + 1, total: fileList.length, name: file.name });
        const parsed = await parseCsv(file);
        results.push({ fileName: file.name, parsed });
        totalRows += parsed.rows.length;
      }
      setFiles((prev) => [...prev, ...results]);
      toast.success(`Parsed ${totalRows} rows across ${fileList.length} file(s)`, { id: tId });
    } catch (e) {
      toast.error(`Failed to parse CSV: ${(e as Error).message}`, { id: tId });
    } finally {
      setProcessing(null);
    }
  }, [orgId]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = Array.from(e.dataTransfer.files ?? []);
    if (list.length) void handleFiles(list);
  };

  // Aggregate stats across all parsed files.
  const aggregate = useMemo(() => {
    const orgUnitToMeters = new Map<string, Set<string>>();
    let totalRows = 0;
    let totalTimestamps = 0;
    for (const { parsed } of files) {
      totalRows += parsed.rows.length;
      totalTimestamps += parsed.timestampColumns.length;
      for (const row of parsed.rows) {
        const unit = row["OrganizationalUnits.Name"] ?? "";
        const meter = row["Meters.Name"] ?? "";
        if (!unit) continue;
        if (!orgUnitToMeters.has(unit)) orgUnitToMeters.set(unit, new Set());
        if (meter) orgUnitToMeters.get(unit)!.add(meter);
      }
    }
    const uniqueOrgUnits = Array.from(orgUnitToMeters.keys()).sort();
    return { orgUnitToMeters, uniqueOrgUnits, totalRows, totalTimestamps };
  }, [files]);

  const matchMap = new Map(buildings.map((b) => [b.csv_matched_name, b]));
  const unmatchedUnits = aggregate.uniqueOrgUnits.filter((u) => !matchMap.has(u));
  const allUnmatchedSelected =
    unmatchedUnits.length > 0 && unmatchedUnits.every((u) => selectedUnits[u]);
  const selectedCount = unmatchedUnits.filter((u) => selectedUnits[u]).length;

  const toggleUnit = (u: string) =>
    setSelectedUnits((prev) => ({ ...prev, [u]: !prev[u] }));

  const toggleAll = () => {
    if (allUnmatchedSelected) {
      setSelectedUnits({});
    } else {
      const next: Record<string, boolean> = {};
      unmatchedUnits.forEach((u) => (next[u] = true));
      setSelectedUnits(next);
    }
  };

  const createSelectedBuildings = () => {
    const toCreate = unmatchedUnits.filter((u) => selectedUnits[u]);
    if (!toCreate.length) return;
    toCreate.forEach((u) =>
      addBuilding({
        organization_id: orgId,
        custom_display_name: u,
        csv_matched_name: u,
      }),
    );
    setSelectedUnits({});
    toast.success(`Created ${toCreate.length} building(s)`);
  };

  const createAllBuildings = () => {
    if (!unmatchedUnits.length) return;
    unmatchedUnits.forEach((u) =>
      addBuilding({
        organization_id: orgId,
        custom_display_name: u,
        csv_matched_name: u,
      }),
    );
    setSelectedUnits({});
    toast.success(`Created ${unmatchedUnits.length} building(s)`);
  };

  const confirmImport = async () => {
    if (!files.length || !orgId) return;
    setImporting(true);
    const tId = toast.loading(`Importing ${files.length} file(s)…`);
    try {
      const allRows: ReturnType<typeof pivotRows> = [];
      for (const f of files) {
        allRows.push(...pivotRows(f.parsed, orgId, buildings, overrides));
      }
      const n = await bulkInsertConsumption(allRows, importMode);
      markSynced();
      const applied = overrides.length
        ? allRows.filter((r) => overrides.some((o) => o.raw_meter_name === r.meter_name)).length
        : 0;
      if (n === 0) {
        toast.warning("No records imported — no timestamp columns matched", { id: tId });
      } else {
        toast.success(
          `Imported ${n} daily records${applied ? ` — ${applied} row(s) reconciled via meter overrides` : ""}`,
          { id: tId },
        );
      }
      setFiles([]);
      setSelectedUnits({});
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`, { id: tId });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold">Manual CSV upload</h2>
          <p className="text-xs text-muted-foreground">
            Drag one or more half-hourly exports. Files are parsed together and rows are auto-linked
            to buildings by <code className="rounded bg-muted px-1">OrganizationalUnits.Name</code>.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[280px_1fr]">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Target organisation <span className="text-destructive">*</span>
            </Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue placeholder="Select organisation" /></SelectTrigger>
              <SelectContent>
                {organisations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40",
              !orgId && "opacity-60",
            )}
          >
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <div className="text-sm font-medium">
              {files.length ? `${files.length} file(s) queued` : "Drop CSV files here or click to browse"}
            </div>
            <div className="text-xs text-muted-foreground">Multiple .csv files supported</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length) void handleFiles(list);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {(processing || importing) && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {importing
                ? `Importing ${files.length} file(s) into the database…`
                : `Parsing file ${processing!.current} of ${processing!.total}: ${processing!.name}`}
            </div>
            <Progress
              value={
                importing
                  ? undefined
                  : ((processing!.current - 1) / Math.max(processing!.total, 1)) * 100
              }
            />
          </div>
        )}

        {files.length > 0 && (
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Queued files
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setFiles([]); setSelectedUnits({}); }}
              >
                Clear all
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
                  <div className="flex items-center gap-2 truncate">
                    <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{f.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      · {f.parsed.rows.length} rows · {f.parsed.timestampColumns.length} intervals
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Building match summary</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <FileUp className="h-3 w-3" /> {aggregate.uniqueOrgUnits.length} unit(s)
                  </Badge>
                  {unmatchedUnits.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={!selectedCount}
                        onClick={createSelectedBuildings}
                      >
                        Create selected ({selectedCount})
                      </Button>
                      <Button size="sm" className="h-7" onClick={createAllBuildings}>
                        Create All Buildings ({unmatchedUnits.length})
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {unmatchedUnits.length > 0 && (
                <div className="mb-2 flex items-center gap-2 border-b pb-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allUnmatchedSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all unmatched"
                  />
                  <span>Select all unmatched to create as new buildings</span>
                </div>
              )}

              <ul className="space-y-1.5 text-sm">
                {aggregate.uniqueOrgUnits.map((u) => {
                  const b = matchMap.get(u);
                  const meterCount = aggregate.orgUnitToMeters.get(u)?.size ?? 0;
                  return (
                    <li key={u} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {!b && (
                          <Checkbox
                            checked={!!selectedUnits[u]}
                            onCheckedChange={() => toggleUnit(u)}
                            aria-label={`Select ${u}`}
                          />
                        )}
                        {b ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                        <code className="rounded bg-background px-1.5 py-0.5 text-xs">{u}</code>
                        {b && <span className="text-xs text-muted-foreground">→ {b.custom_display_name}</span>}
                        <Badge variant="secondary" className="ml-1 text-[10px]">
                          {meterCount} meter{meterCount === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      {!b && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => {
                            addBuilding({
                              organization_id: orgId,
                              custom_display_name: u,
                              csv_matched_name: u,
                            });
                            toast.success(`Created building "${u}"`);
                          }}
                        >
                          Create building
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Preview (first 10 rows of first file)</h3>
              <div className="max-h-[380px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {files[0].parsed.structuralColumns.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
                      ))}
                      {files[0].parsed.timestampColumns.slice(0, 8).map((c) => (
                        <TableHead key={c} className="whitespace-nowrap text-right">{c.split(" ")[1]}</TableHead>
                      ))}
                      <TableHead className="text-right text-muted-foreground">…</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files[0].parsed.rows.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        {files[0].parsed.structuralColumns.map((c) => (
                          <TableCell key={c} className="whitespace-nowrap text-xs">{r[c]}</TableCell>
                        ))}
                        {files[0].parsed.timestampColumns.slice(0, 8).map((c) => (
                          <TableCell key={c} className="whitespace-nowrap text-right font-mono text-xs">
                            {r[c] || "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-muted-foreground">…</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <Label className="text-sm font-medium">How should this data be applied?</Label>
              <RadioGroup
                value={importMode}
                onValueChange={(v) => setImportMode(v as "merge" | "replace")}
                className="mt-3 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="merge" id="mode-merge" className="mt-1" />
                  <Label htmlFor="mode-merge" className="cursor-pointer font-normal">
                    <span className="block text-sm font-medium">Merge with existing data</span>
                    <span className="block text-xs text-muted-foreground">
                      Only meters and dates present in the file are updated. Everything else stays untouched.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="replace" id="mode-replace" className="mt-1" />
                  <Label htmlFor="mode-replace" className="cursor-pointer font-normal">
                    <span className="block text-sm font-medium">Replace data for the dates in this file</span>
                    <span className="block text-xs text-muted-foreground">
                      Deletes all existing rows for this organisation on every date covered by the file — including
                      meters missing from it — then imports the file. Use this to re-import a bad month.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={importing} onClick={() => { setFiles([]); setSelectedUnits({}); }}>Cancel</Button>
              <Button onClick={confirmImport} disabled={importing || !files.length}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm import
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}