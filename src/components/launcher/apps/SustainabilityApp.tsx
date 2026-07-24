import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Leaf, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useConsumption, useOrganisations } from "@/lib/data-store";
import { computeScope12, computeScope3 } from "@/lib/energy/emissions";
import { useLauncher } from "@/lib/launcher-context";
import {
  bulkImportEntries,
  deleteEntry,
  deleteItem,
  deleteTarget,
  loadSustainability,
  upsertEntry,
  upsertItem,
  upsertTarget,
  type Category,
  type Entry,
  type Item,
  type SustainabilityBundle,
  type Target,
} from "@/lib/sustainability.functions";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAT_COLORS = ["#8b5cf6", "#f97316", "#3b82f6", "#10b981", "#eab308", "#ec4899", "#06b6d4", "#84cc16", "#f43f5e", "#a855f7", "#0ea5e9", "#22c55e", "#f59e0b", "#6366f1", "#14b8a6"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function yearStartISO() {
  return `${new Date().getUTCFullYear()}-01-01`;
}
function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function SustainabilityApp() {
  const { org, isAdmin } = useLauncher();
  const { organisations } = useOrganisations();
  const { consumption } = useConsumption();
  const orgFull = organisations.find((o) => o.id === org.id);

  const [bundle, setBundle] = useState<SustainabilityBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useServerFn(loadSustainability);

  useEffect(() => {
    if (!org.id || org.id === "none") return;
    setLoading(true);
    load({ data: { orgId: org.id } })
      .then((b) => setBundle(b))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [org.id, load]);

  const refresh = () => load({ data: { orgId: org.id } }).then(setBundle).catch(() => undefined);

  const fromISO = yearStartISO();
  const toISO = todayISO();

  const scope12 = useMemo(() => {
    const rows = consumption.filter((r) => r.organization_id === org.id);
    return computeScope12(rows, orgFull, fromISO, toISO);
  }, [consumption, org.id, orgFull, fromISO, toISO]);

  const scope3 = useMemo(() => {
    if (!bundle) return null;
    return computeScope3(bundle.entries, bundle.items, fromISO, toISO);
  }, [bundle, fromISO, toISO]);

  const totalTco2e = scope12.totalScope12Tco2e + (scope3?.totalTco2e ?? 0);

  if (org.id === "none") {
    return <div className="text-sm text-muted-foreground">Select an organisation to view sustainability data.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10">
          <Leaf className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sustainability Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Scope 1, 2 and 3 carbon footprint for {org.name} · YTD {fromISO.slice(0, 4)}
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Total YTD" value={`${fmt(totalTco2e)} tCO₂e`} sub="All scopes" />
        <Metric label="Scope 1 (gas)" value={`${fmt(scope12.scope1Tco2e)} tCO₂e`} sub={`${fmt(scope12.gasKwh, 0)} kWh gas`} />
        <Metric label="Scope 2 (electricity)" value={`${fmt(scope12.scope2Tco2e)} tCO₂e`} sub={`${fmt(scope12.electricityKwh, 0)} kWh elec`} />
        <Metric label="Scope 3" value={`${fmt(scope3?.totalTco2e ?? 0)} tCO₂e`} sub={`${scope3?.entries.length ?? 0} entries logged`} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scope12">Scope 1 & 2</TabsTrigger>
          <TabsTrigger value="scope3">Scope 3 log</TabsTrigger>
          {isAdmin && <TabsTrigger value="catalogue">Catalogue</TabsTrigger>}
          {isAdmin && <TabsTrigger value="targets">Targets</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <OverviewTab scope12={scope12} scope3={scope3} bundle={bundle} totalTco2e={totalTco2e} />
        </TabsContent>

        <TabsContent value="scope12" className="space-y-4 pt-4">
          <Scope12Tab scope12={scope12} />
        </TabsContent>

        <TabsContent value="scope3" className="space-y-4 pt-4">
          {bundle && (
            <Scope3Tab
              bundle={bundle}
              orgId={org.id}
              scope3={scope3}
              onRefresh={refresh}
              canManageAll={isAdmin}
            />
          )}
        </TabsContent>

        {isAdmin && bundle && (
          <TabsContent value="catalogue" className="space-y-4 pt-4">
            <CatalogueTab bundle={bundle} orgId={org.id} onRefresh={refresh} />
          </TabsContent>
        )}

        {isAdmin && bundle && (
          <TabsContent value="targets" className="space-y-4 pt-4">
            <TargetsTab bundle={bundle} orgId={org.id} totalTco2e={totalTco2e} onRefresh={refresh} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

// ---------------- Overview -----------------

function OverviewTab({
  scope12,
  scope3,
  bundle,
  totalTco2e,
}: {
  scope12: ReturnType<typeof computeScope12>;
  scope3: ReturnType<typeof computeScope3> | null;
  bundle: SustainabilityBundle | null;
  totalTco2e: number;
}) {
  const monthly = MONTH_LABELS.map((m, i) => ({
    month: m,
    Scope1: scope12.monthlyByUtility.gas[i],
    Scope2: scope12.monthlyByUtility.electricity[i],
    Scope3: scope3?.monthly[i] ?? 0,
  }));

  const catMap = new Map(bundle?.categories.map((c) => [c.id, c.name]) ?? []);
  const donutData = scope3
    ? Array.from(scope3.byCategory.entries()).map(([id, v]) => ({ name: catMap.get(id) ?? "Other", value: v }))
    : [];

  const targetTotal = bundle?.targets.find((t) => t.scope === 0)?.target_tco2e;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h2 className="text-base font-semibold">Monthly emissions</h2>
            <p className="text-xs text-muted-foreground">tCO₂e by scope, current year</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <RTooltip formatter={(v: number) => `${fmt(v)} tCO₂e`} />
                <Legend />
                <Bar dataKey="Scope1" stackId="a" fill="#f97316" />
                <Bar dataKey="Scope2" stackId="a" fill="#8b5cf6" />
                <Bar dataKey="Scope3" stackId="a" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h2 className="text-base font-semibold">Scope 3 by category</h2>
            <p className="text-xs text-muted-foreground">
              {donutData.length ? `${fmt(scope3?.totalTco2e ?? 0)} tCO₂e across ${donutData.length} categories` : "No Scope 3 entries yet"}
            </p>
          </div>
          <div className="h-72">
            {donutData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v: number) => `${fmt(v)} tCO₂e`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Log Scope 3 entries to see this breakdown.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {bundle && bundle.targets.length > 0 && (
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-base font-semibold">Target progress</h2>
              <p className="text-xs text-muted-foreground">
                YTD vs target · Total footprint {fmt(totalTco2e)} tCO₂e
                {targetTotal ? ` / ${fmt(targetTotal)} tCO₂e` : ""}
              </p>
            </div>
            {bundle.targets.map((t) => {
              const actual =
                t.scope === 1 ? scope12.scope1Tco2e :
                t.scope === 2 ? scope12.scope2Tco2e :
                t.scope === 3 ? (scope3?.totalTco2e ?? 0) :
                totalTco2e;
              const pct = t.target_tco2e > 0 ? Math.min(100, (actual / t.target_tco2e) * 100) : 0;
              const label =
                t.scope === 0 ? "All scopes" :
                t.scope === 1 ? "Scope 1" :
                t.scope === 2 ? "Scope 2" : "Scope 3";
              return (
                <div key={t.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{label} · {t.period_start} → {t.period_end}</span>
                    <span className={pct > 100 ? "text-destructive" : "text-muted-foreground"}>
                      {fmt(actual)} / {fmt(t.target_tco2e)} tCO₂e ({fmt(pct, 0)}%)
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------- Scope 1 & 2 -----------------

function Scope12Tab({ scope12 }: { scope12: ReturnType<typeof computeScope12> }) {
  const rows = [
    { util: "Electricity (Scope 2)", usage: scope12.electricityKwh, unit: "kWh", tco2e: scope12.scope2Tco2e, color: "bg-violet-500" },
    { util: "Gas (Scope 1)", usage: scope12.gasKwh, unit: "kWh", tco2e: scope12.scope1Tco2e, color: "bg-orange-500" },
    { util: "Water (Scope 3 upstream)", usage: scope12.waterM3, unit: "m³", tco2e: scope12.waterScope3Tco2e, color: "bg-blue-500" },
  ];
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utility</TableHead>
              <TableHead className="text-right">Consumption YTD</TableHead>
              <TableHead className="text-right">tCO₂e</TableHead>
              <TableHead>Monthly trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => {
              const monthly =
                idx === 0 ? scope12.monthlyByUtility.electricity :
                idx === 1 ? scope12.monthlyByUtility.gas :
                scope12.monthlyByUtility.water;
              const max = Math.max(...monthly, 1);
              return (
                <TableRow key={r.util}>
                  <TableCell className="font-medium">{r.util}</TableCell>
                  <TableCell className="text-right">{fmt(r.usage, 0)} {r.unit}</TableCell>
                  <TableCell className="text-right">{fmt(r.tco2e)}</TableCell>
                  <TableCell>
                    <div className="flex h-6 items-end gap-0.5">
                      {monthly.map((v, i) => (
                        <div
                          key={i}
                          className={`${r.color} w-2 rounded-sm opacity-80`}
                          style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                          title={`${MONTH_LABELS[i]}: ${fmt(v)} tCO₂e`}
                        />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------- Scope 3 log -----------------

function Scope3Tab({
  bundle,
  orgId,
  scope3,
  onRefresh,
  canManageAll,
}: {
  bundle: SustainabilityBundle;
  orgId: string;
  scope3: ReturnType<typeof computeScope3> | null;
  onRefresh: () => Promise<unknown>;
  canManageAll: boolean;
}) {
  void canManageAll;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const del = useServerFn(deleteEntry);
  const catMap = new Map(bundle.categories.map((c) => [c.id, c]));
  const itemMap = new Map(bundle.items.map((i) => [i.id, i]));

  const handleDelete = async (id: string) => {
    try {
      await del({ data: { id } });
      toast.success("Entry deleted");
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-4 w-4" /> Import CSV
        </Button>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add entry
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">tCO₂e</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundle.entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No Scope 3 entries yet. Log business travel, waste, purchased goods, and more.
                  </TableCell>
                </TableRow>
              )}
              {bundle.entries.map((e) => {
                const it = itemMap.get(e.item_id);
                const cat = it ? catMap.get(it.category_id) : undefined;
                const inRange = scope3?.entries.find((x) => x.id === e.id);
                return (
                  <TableRow key={e.id}>
                    <TableCell>{e.entry_date}</TableCell>
                    <TableCell><Badge variant="secondary">{cat?.name ?? "—"}</Badge></TableCell>
                    <TableCell>{it?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-right">{fmt(Number(e.quantity), 2)} {it?.unit}</TableCell>
                    <TableCell className="text-right">{fmt(inRange?.tco2e ?? (Number(e.quantity) * (it?.emission_factor ?? 0)) / 1000)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{e.notes}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(e); setOpen(true); }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(e.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        orgId={orgId}
        items={bundle.items}
        categories={bundle.categories}
        onSaved={onRefresh}
      />
      <ImportCsvDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        items={bundle.items}
        orgId={orgId}
        onSaved={onRefresh}
      />
    </div>
  );
}

function EntryDialog({
  open, onOpenChange, editing, orgId, items, categories, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Entry | null;
  orgId: string; items: Item[]; categories: Category[]; onSaved: () => Promise<unknown>;
}) {
  const save = useServerFn(upsertEntry);
  const [itemId, setItemId] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [qty, setQty] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setItemId(editing?.item_id ?? items[0]?.id ?? "");
      setDate(editing?.entry_date ?? todayISO());
      setQty(editing ? String(editing.quantity) : "0");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing, items]);

  const item = items.find((i) => i.id === itemId);
  const cat = item ? categories.find((c) => c.id === item.category_id) : undefined;
  const preview = item ? (Number(qty || 0) * item.emission_factor) / 1000 : 0;

  const submit = async () => {
    if (!itemId) return toast.error("Select an item");
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity < 0) return toast.error("Invalid quantity");
    setSaving(true);
    try {
      await save({
        data: {
          id: editing?.id,
          organization_id: orgId,
          item_id: itemId,
          entry_date: date,
          quantity,
          notes: notes || null,
        },
      });
      toast.success(editing ? "Entry updated" : "Entry added");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit entry" : "Add Scope 3 entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Pick an item" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {items.map((i) => {
                  const c = categories.find((x) => x.id === i.category_id);
                  return (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} <span className="text-muted-foreground">· {c?.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {item && (
              <p className="text-xs text-muted-foreground">
                {item.emission_factor} kgCO₂e / {item.unit} · {cat?.name}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity ({item?.unit ?? ""})</Label>
              <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            Estimated impact: <span className="font-semibold">{fmt(preview)} tCO₂e</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({
  open, onOpenChange, items, orgId, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  items: Item[]; orgId: string; onSaved: () => Promise<unknown>;
}) {
  const bulk = useServerFn(bulkImportEntries);
  const [text, setText] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return toast.error("Paste CSV rows first");
    const header = lines[0].toLowerCase();
    const startIdx = header.includes("date") ? 1 : 0;
    const byName = new Map(items.map((i) => [i.name.toLowerCase(), i.id]));
    const rows: Array<{ item_id: string; entry_date: string; quantity: number; notes: string | null }> = [];
    const unmatched: string[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(",").map((s) => s.trim());
      const [date, name, qty, notes] = parts;
      if (!date || !name || !qty) continue;
      const id = byName.get(name.toLowerCase());
      if (!id) { unmatched.push(name); continue; }
      const q = Number(qty);
      if (!Number.isFinite(q)) continue;
      rows.push({ item_id: id, entry_date: date, quantity: q, notes: notes || null });
    }
    if (!rows.length) return toast.error("No valid rows found");
    setBusy(true);
    try {
      const res = await bulk({ data: { organization_id: orgId, rows } });
      toast.success(`Imported ${res.inserted} entries${unmatched.length ? ` · ${unmatched.length} unmatched` : ""}`);
      onOpenChange(false);
      setText("");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import entries from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Columns: <code>date,item,quantity,notes</code>. Item name must match the catalogue exactly.
          </p>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            placeholder={"date,item,quantity,notes\n2026-01-05,Car — average petrol,120,Client visit"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Importing…" : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Catalogue -----------------

function CatalogueTab({
  bundle, orgId, onRefresh,
}: {
  bundle: SustainabilityBundle; orgId: string; onRefresh: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const del = useServerFn(deleteItem);
  const catMap = new Map(bundle.categories.map((c) => [c.id, c.name]));

  const custom = bundle.items.filter((i) => !i.is_preset && i.organization_id === orgId);
  const presets = bundle.items.filter((i) => i.is_preset);

  const handleDelete = async (id: string) => {
    try {
      await del({ data: { id } });
      toast.success("Item deleted");
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> New custom item
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Factor (kgCO₂e/unit)</TableHead>
                <TableHead>Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {custom.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No custom items yet — use presets below or add your own.</TableCell></TableRow>
              )}
              {custom.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>{catMap.get(i.category_id)}</TableCell>
                  <TableCell>{i.unit}</TableCell>
                  <TableCell className="text-right">{i.emission_factor}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{i.factor_source}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            Presets ({presets.length}) · read-only, available to every organisation
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Factor</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {presets.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell className="text-xs">{catMap.get(i.category_id)}</TableCell>
                  <TableCell>{i.unit}</TableCell>
                  <TableCell className="text-right">{i.emission_factor}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing({ ...i, id: "", is_preset: false, organization_id: orgId, name: `${i.name} (custom)` }); setOpen(true); }}
                    >
                      Copy
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ItemDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        orgId={orgId}
        categories={bundle.categories}
        onSaved={onRefresh}
      />
    </div>
  );
}

function ItemDialog({
  open, onOpenChange, editing, orgId, categories, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Item | null;
  orgId: string; categories: Category[]; onSaved: () => Promise<unknown>;
}) {
  const save = useServerFn(upsertItem);
  const [name, setName] = useState("");
  const [catId, setCatId] = useState("");
  const [unit, setUnit] = useState("");
  const [factor, setFactor] = useState("0");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCatId(editing?.category_id ?? categories[0]?.id ?? "");
      setUnit(editing?.unit ?? "");
      setFactor(editing ? String(editing.emission_factor) : "0");
      setSource(editing?.factor_source ?? "");
    }
  }, [open, editing, categories]);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (!unit.trim()) return toast.error("Unit required");
    const f = Number(factor);
    if (!Number.isFinite(f) || f < 0) return toast.error("Invalid factor");
    setBusy(true);
    try {
      await save({
        data: {
          id: editing?.id && editing.id !== "" ? editing.id : undefined,
          organization_id: orgId,
          category_id: catId,
          name: name.trim(),
          unit: unit.trim(),
          emission_factor: f,
          factor_source: source || null,
        },
      });
      toast.success("Item saved");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing?.id ? "Edit item" : "New custom item"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Company car — hybrid" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={catId} onValueChange={setCatId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="km, kg, night, gbp…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Emission factor (kgCO₂e / unit)</Label>
              <Input type="number" step="0.0001" value={factor} onChange={(e) => setFactor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="DEFRA 2024, supplier PCF, …" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Targets -----------------

function TargetsTab({
  bundle, orgId, totalTco2e, onRefresh,
}: {
  bundle: SustainabilityBundle; orgId: string; totalTco2e: number; onRefresh: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const del = useServerFn(deleteTarget);
  void totalTco2e;

  const handleDelete = async (id: string) => {
    try {
      await del({ data: { id } });
      toast.success("Target deleted");
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> New target
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Target tCO₂e</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundle.targets.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No targets set.</TableCell></TableRow>
              )}
              {bundle.targets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.scope === 0 ? "All scopes" : `Scope ${t.scope}`}</TableCell>
                  <TableCell>{t.period_start} → {t.period_end}</TableCell>
                  <TableCell className="text-right">{fmt(Number(t.target_tco2e))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TargetDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        orgId={orgId}
        onSaved={onRefresh}
      />
    </div>
  );
}

function TargetDialog({
  open, onOpenChange, editing, orgId, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Target | null;
  orgId: string; onSaved: () => Promise<unknown>;
}) {
  const save = useServerFn(upsertTarget);
  const year = new Date().getUTCFullYear();
  const [scope, setScope] = useState<string>("0");
  const [start, setStart] = useState<string>(`${year}-01-01`);
  const [end, setEnd] = useState<string>(`${year}-12-31`);
  const [tval, setTval] = useState<string>("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setScope(String(editing?.scope ?? 0));
      setStart(editing?.period_start ?? `${year}-01-01`);
      setEnd(editing?.period_end ?? `${year}-12-31`);
      setTval(editing ? String(editing.target_tco2e) : "0");
    }
  }, [open, editing, year]);

  const submit = async () => {
    const v = Number(tval);
    if (!Number.isFinite(v) || v < 0) return toast.error("Invalid target");
    setBusy(true);
    try {
      await save({
        data: {
          id: editing?.id,
          organization_id: orgId,
          scope: Number(scope),
          category_id: null,
          period_start: start,
          period_end: end,
          target_tco2e: v,
        },
      });
      toast.success("Target saved");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit target" : "New target"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">All scopes</SelectItem>
                <SelectItem value="1">Scope 1</SelectItem>
                <SelectItem value="2">Scope 2</SelectItem>
                <SelectItem value="3">Scope 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Period end</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Target (tCO₂e)</Label>
            <Input type="number" step="0.1" value={tval} onChange={(e) => setTval(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}