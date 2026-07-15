import { useServerFn } from "@tanstack/react-start";
import { Clock, Loader2, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { runIngestionScheduleNow } from "@/lib/ingestion.functions";
import { supabase } from "@/integrations/supabase/client";
import { useOrganisations, type IngestionSchedule } from "@/lib/data-store";

type Draft = {
  id?: string;
  organization_id: string;
  name: string;
  source_url: string;
  scheduled_time: string;
  enabled: boolean;
};

const EMPTY: Draft = {
  organization_id: "",
  name: "",
  source_url: "",
  scheduled_time: "10:00",
  enabled: true,
};

export function IngestionSchedulesPanel() {
  const { organisations } = useOrganisations();
  const [schedules, setSchedules] = useState<IngestionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const runNow = useServerFn(runIngestionScheduleNow);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("ingestion_schedules" as any)
      .select("*")
      .order("created_at");
    if (error) toast.error(error.message);
    else setSchedules((data ?? []) as unknown as IngestionSchedule[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const orgName = (id: string) =>
    organisations.find((o) => o.id === id)?.organization_name ?? "—";

  const save = async () => {
    if (!draft) return;
    if (!draft.organization_id || !draft.name.trim() || !draft.source_url.trim()) {
      toast.error("Organisation, name and URL are required");
      return;
    }
    const payload = {
      organization_id: draft.organization_id,
      name: draft.name.trim(),
      source_url: draft.source_url.trim(),
      scheduled_time: draft.scheduled_time,
      enabled: draft.enabled,
    };
    const q = draft.id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? supabase.from("ingestion_schedules" as any).update(payload).eq("id", draft.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : supabase.from("ingestion_schedules" as any).insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success(draft.id ? "Schedule updated" : "Schedule created");
    setDraft(null);
    void refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this scheduled upload?")) return;
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("ingestion_schedules" as any)
      .delete()
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    void refresh();
  };

  const toggle = async (row: IngestionSchedule) => {
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("ingestion_schedules" as any)
      .update({ enabled: !row.enabled })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    void refresh();
  };

  const trigger = async (id: string) => {
    setRunningId(id);
    const tId = toast.loading("Downloading & importing…");
    try {
      const r = await runNow({ data: { id } });
      toast.success(`Imported ${r.rowsImported} rows${r.unmatchedUnits.length ? ` — ${r.unmatchedUnits.length} unmatched unit(s)` : ""}`, { id: tId });
      void refresh();
    } catch (e) {
      toast.error(`Run failed: ${(e as Error).message}`, { id: tId });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Scheduled data uploads</h2>
            <p className="text-xs text-muted-foreground">
              Download each source URL daily at the configured UTC time and import into the assigned organisation. Existing rows for the same dates are replaced.
            </p>
          </div>
          <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" onClick={() => setDraft({ ...EMPTY })}>
                <Plus className="h-4 w-4" /> New schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{draft?.id ? "Edit schedule" : "New scheduled upload"}</DialogTitle>
              </DialogHeader>
              {draft && (
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label>Organisation *</Label>
                    <Select value={draft.organization_id} onValueChange={(v) => setDraft({ ...draft, organization_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select organisation" /></SelectTrigger>
                      <SelectContent>
                        {organisations.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Name *</Label>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Daily Erbis export" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Source URL *</Label>
                    <Input value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} placeholder="https://…/export.csv" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label><Clock className="mr-1 inline h-3.5 w-3.5" /> Daily time (UTC)</Label>
                      <Input type="time" value={draft.scheduled_time} onChange={(e) => setDraft({ ...draft, scheduled_time: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} id="sched-enabled" />
                      <Label htmlFor="sched-enabled" className="text-sm">Enabled</Label>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button onClick={save}>{draft?.id ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead className="w-52" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && schedules.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No scheduled uploads yet.</TableCell></TableRow>
            )}
            {schedules.map((s) => (
              <TableRow key={s.id} className={s.enabled ? "" : "opacity-60"}>
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground max-w-[320px]">{s.source_url}</div>
                </TableCell>
                <TableCell>{orgName(s.organization_id)}</TableCell>
                <TableCell className="font-mono text-xs">{s.scheduled_time}</TableCell>
                <TableCell>
                  {s.last_status === "success" && <Badge variant="secondary" className="text-[11px]">Success{s.last_rows_imported != null ? ` · ${s.last_rows_imported}` : ""}</Badge>}
                  {s.last_status === "error" && <Badge variant="destructive" className="text-[11px]" title={s.last_error ?? ""}>Error</Badge>}
                  {!s.last_status && <span className="text-xs text-muted-foreground">Never run</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={runningId === s.id || !s.enabled} onClick={() => trigger(s.id)}>
                    {runningId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Run
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggle(s)} aria-label="Toggle">
                    <Power className={`h-4 w-4 ${s.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraft({
                    id: s.id, organization_id: s.organization_id, name: s.name,
                    source_url: s.source_url, scheduled_time: s.scheduled_time, enabled: s.enabled,
                  })} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(s.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}