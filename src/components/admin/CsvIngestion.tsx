import { CheckCircle2, FileUp, Upload, AlertCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildings, useConsumption, useIngestionSettings, useMeterOverrides, useOrganisations } from "@/lib/data-store";
import { cn } from "@/lib/utils";
import { parseCsv, pivotRows, type ParsedCsv } from "@/lib/csv-parser";

export function CsvIngestion() {
  const { organisations } = useOrganisations();
  const [orgId, setOrgId] = useState<string>("");
  const { buildings, addBuilding } = useBuildings(orgId);
  const { bulkInsertConsumption } = useConsumption();
  const { overrides } = useMeterOverrides(orgId);
  const { markSynced } = useIngestionSettings();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!orgId) {
      toast.error("Select an organisation before uploading");
      return;
    }
    const tId = toast.loading(`Parsing ${file.name}…`);
    try {
      const result = await parseCsv(file);
      setParsed(result);
      setFileName(file.name);
      if (result.timestampColumns.length === 0) {
        toast.warning("No half-hourly timestamp columns detected — check the file format", { id: tId });
      } else {
        toast.success(
          `Parsed ${result.rows.length} rows across ${result.timestampColumns.length} intervals`,
          { id: tId },
        );
      }
    } catch (e) {
      toast.error(`Failed to parse CSV: ${(e as Error).message}`, { id: tId });
    }
  }, [orgId]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const confirmImport = async () => {
    if (!parsed || !orgId) return;
    const tId = toast.loading("Importing data…");
    try {
      const rows = pivotRows(parsed, orgId, buildings, overrides);
      const n = await bulkInsertConsumption(rows);
      markSynced();
      const applied = overrides.length
        ? rows.filter((r) => overrides.some((o) => o.raw_meter_name === r.meter_name)).length
        : 0;
      if (n === 0) {
        toast.warning("No records imported — no timestamp columns matched", { id: tId });
      } else {
        toast.success(
          `Imported ${n} daily records${applied ? ` — ${applied} row(s) reconciled via meter overrides` : ""}`,
          { id: tId },
        );
      }
      setParsed(null);
      setFileName(null);
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`, { id: tId });
    }
  };

  const matchMap = new Map(buildings.map((b) => [b.csv_matched_name, b]));

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold">Manual CSV upload</h2>
          <p className="text-xs text-muted-foreground">
            Drag a half-hourly export in the standard multi-column format. Rows are auto-linked to
            buildings by <code className="rounded bg-muted px-1">OrganizationalUnits.Name</code>.
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
              {fileName ?? "Drop CSV here or click to browse"}
            </div>
            <div className="text-xs text-muted-foreground">.csv up to ~50MB</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {parsed && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Building match summary</h3>
                <Badge variant="outline" className="gap-1">
                  <FileUp className="h-3 w-3" /> {parsed.uniqueOrgUnits.length} unit(s)
                </Badge>
              </div>
              <ul className="space-y-1.5 text-sm">
                {parsed.uniqueOrgUnits.map((u) => {
                  const b = matchMap.get(u);
                  return (
                    <li key={u} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {b ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                        <code className="rounded bg-background px-1.5 py-0.5 text-xs">{u}</code>
                        {b && <span className="text-xs text-muted-foreground">→ {b.custom_display_name}</span>}
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
              <h3 className="mb-2 text-sm font-semibold">Preview (first 10 rows)</h3>
              <div className="max-h-[380px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parsed.structuralColumns.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
                      ))}
                      {parsed.timestampColumns.slice(0, 8).map((c) => (
                        <TableHead key={c} className="whitespace-nowrap text-right">{c.split(" ")[1]}</TableHead>
                      ))}
                      <TableHead className="text-right text-muted-foreground">…</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        {parsed.structuralColumns.map((c) => (
                          <TableCell key={c} className="whitespace-nowrap text-xs">{r[c]}</TableCell>
                        ))}
                        {parsed.timestampColumns.slice(0, 8).map((c) => (
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

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setParsed(null); setFileName(null); }}>Cancel</Button>
              <Button onClick={confirmImport}>Confirm import</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}