import { AlertTriangle, ArrowUpDown, ChevronRight, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBuildings, useConsumption, useDataStore, useMeterRegistry, useOrganisations,
} from "@/lib/data-store";
import {
  checkCompleteness, utilityKind,
  type CompletenessStatus, type IntegrityStatus, type StagnationStatus,
} from "@/lib/energy/completeness";
import { resolveProfile } from "@/lib/energy/profile";
import { useLauncher } from "@/lib/launcher-context";

import { MeterDashboard } from "./MeterDashboard";

type Days = 7 | 30 | 90;
type SortKey = "building" | "meter" | "utility" | "rows" | "firstSeen" | "lastSeen" | "coverage" | "flatline" | "integrity" | "offlineEvents" | "status";

interface MeterRow {
  raw: string;
  meterLabel: string;
  buildingLabel: string;
  buildingId: string | null;
  utility: "electricity" | "gas" | "water" | "other";
  rows: number;
  firstSeen: string | null;
  lastSeen: string | null;
  coveragePct: number;
  flatlineHours: number;
  status: CompletenessStatus;
  reason?: string;
  integrity: IntegrityStatus;
  integrityDeltaPct: number;
  integrityBaselineKwh: number;
  integrityTodayKwh: number;
  integrityTodayISO: string | null;
  stagnation: StagnationStatus;
  offlineEvents: number;
}

const STATUS_ORDER: Record<CompletenessStatus, number> = { ok: 0, incomplete: 1, telemetry_offline: 2 };
const INTEGRITY_ORDER: Record<IntegrityStatus, number> = {
  ok: 0, insufficient_history: 1, skipped: 2, drop: 3, spike: 4,
};

export function DataValidationApp() {
  const { org } = useLauncher();
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);
  const { consumption } = useConsumption();
  const { state } = useDataStore();
  const registry = useMeterRegistry(org.id);
  const [days, setDays] = useState<Days>(30);
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [utilityFilter, setUtilityFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("building");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedMeter, setSelectedMeter] = useState<string | null>(null);

  const orgRecord = organisations.find((o) => o.id === org.id);

  const { start, end } = useMemo(() => {
    const orgRows = consumption.filter((c) => c.organization_id === org.id);
    const dates = orgRows.map((r) => r.interval_date).sort();
    const last = dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
    const [y, m, d] = last.split("-").map(Number);
    const endD = new Date(y, m - 1, d);
    const startD = new Date(endD);
    startD.setDate(startD.getDate() - (days - 1));
    return { start: startD, end: endD };
  }, [consumption, org.id, days]);

  const meterRows: MeterRow[] = useMemo(() => {
    const buildingsById = new Map(buildings.map((b) => [b.id, b] as const));
    return registry.map((m) => {
      const building = m.effective_building_id ? buildingsById.get(m.effective_building_id) : undefined;
      const profile = resolveProfile(
        orgRecord, building,
        state.schedules.filter((s) => s.building_id === (building?.id ?? "")),
      );
      const utility = utilityKind(m.utility_category);
      const allRows = consumption.filter((c) => c.meter_name === m.raw_meter_name);
      const sortedDates = allRows.map((r) => r.interval_date).sort();
      const firstSeen = sortedDates[0] ?? null;
      const lastSeen = sortedDates[sortedDates.length - 1] ?? null;
      const res = checkCompleteness(allRows, utility, start, end, orgRecord, profile, firstSeen ?? undefined);
      return {
        raw: m.raw_meter_name,
        meterLabel: m.custom_display_name ?? m.raw_meter_name,
        buildingLabel: building?.custom_display_name ?? "Unassigned",
        buildingId: m.effective_building_id,
        utility,
        rows: m.row_count,
        firstSeen, lastSeen,
        coveragePct: 100 - res.missingPct,
        flatlineHours: res.longestFlatlineHours,
        status: res.status,
        reason: res.reason,
        integrity: res.integrity,
        integrityDeltaPct: res.integrityDeltaPct,
        integrityBaselineKwh: res.integrityBaselineKwh,
        integrityTodayKwh: res.integrityTodayKwh,
        integrityTodayISO: res.integrityTodayISO,
        stagnation: res.stagnation,
        offlineEvents: res.offlineEventCount,
      };
    });
  }, [registry, buildings, consumption, state.schedules, orgRecord, start, end]);

  const filtered = useMemo(() => {
    return meterRows.filter((r) => {
      if (buildingFilter !== "all" && r.buildingId !== buildingFilter) return false;
      if (utilityFilter !== "all" && r.utility !== utilityFilter) return false;
      return true;
    });
  }, [meterRows, buildingFilter, utilityFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "building": return a.buildingLabel.localeCompare(b.buildingLabel) || a.meterLabel.localeCompare(b.meterLabel);
          case "meter": return a.meterLabel.localeCompare(b.meterLabel);
          case "utility": return a.utility.localeCompare(b.utility);
          case "rows": return a.rows - b.rows;
          case "firstSeen": return (a.firstSeen ?? "").localeCompare(b.firstSeen ?? "");
          case "lastSeen": return (a.lastSeen ?? "").localeCompare(b.lastSeen ?? "");
          case "coverage": return a.coveragePct - b.coveragePct;
          case "flatline": return a.flatlineHours - b.flatlineHours;
          case "integrity": return INTEGRITY_ORDER[a.integrity] - INTEGRITY_ORDER[b.integrity] || a.integrityDeltaPct - b.integrityDeltaPct;
          case "offlineEvents": return a.offlineEvents - b.offlineEvents;
          case "status": return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        }
      })();
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  function statusBadge(s: CompletenessStatus) {
    if (s === "ok") return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">OK</Badge>;
    if (s === "incomplete") return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">Incomplete</Badge>;
    return <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700">Meter Offline</Badge>;
  }

  function integrityBadge(r: MeterRow) {
    if (r.integrity === "ok") return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">OK</Badge>;
    if (r.integrity === "insufficient_history") return <Badge variant="outline" className="text-muted-foreground">Insufficient history</Badge>;
    if (r.integrity === "skipped") return <Badge variant="outline" className="text-muted-foreground">Summer season</Badge>;
    const sign = r.integrityDeltaPct >= 0 ? "+" : "";
    const label = r.integrity === "spike" ? "Spike" : "Drop";
    const Icon = r.integrity === "spike" ? TrendingUp : TrendingDown;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            <Badge variant="outline" className="border-muted-foreground/40 bg-muted text-foreground gap-1">
              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
              <Icon className="h-3 w-3" />
              {label} {sign}{r.integrityDeltaPct.toFixed(0)}%
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>Variance Alert: Unexpectedly {r.integrity === "spike" ? "High" : "Low"} Consumption Detected</div>
          <div className="mt-1 text-muted-foreground">
            {r.integrityTodayISO ?? "today"}: {r.integrityTodayKwh.toFixed(0)} kWh vs 4-wk same-day baseline {r.integrityBaselineKwh.toFixed(0)} kWh
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  const utilities = Array.from(new Set(meterRows.map((r) => r.utility)));

  if (selectedMeter) {
    return (
      <MeterDashboard
        orgId={org.id}
        rawMeterName={selectedMeter}
        windowDays={days}
        onBack={() => setSelectedMeter(null)}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data Validation Engine</h1>
            <p className="text-sm text-muted-foreground">
              Structural completeness, statistical integrity and stagnation checks for {org.name} — last {days} days. Click any meter to open its dashboard.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All buildings" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.custom_display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={utilityFilter} onValueChange={setUtilityFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All utilities</SelectItem>
              {utilities.map((u) => (
                <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as Days)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead k="building" label="Building" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="meter" label="Meter" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="utility" label="Utility" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="rows" label="Rows" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="firstSeen" label="First seen" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="lastSeen" label="Last seen" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="coverage" label="Coverage" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="flatline" label="Longest 0-run (active hrs)" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="offlineEvents" label="Offline events" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="integrity" label="Integrity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead k="status" label="Status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow
                  key={r.raw}
                  className="cursor-pointer"
                  onClick={() => setSelectedMeter(r.raw)}
                >
                  <TableCell className="font-medium">{r.buildingLabel}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={r.raw}>{r.meterLabel}</TableCell>
                  <TableCell className="capitalize">{r.utility}</TableCell>
                  <TableCell>{r.rows}</TableCell>
                  <TableCell className="text-xs">{r.firstSeen ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.lastSeen ?? "—"}</TableCell>
                  <TableCell>{r.coveragePct.toFixed(1)}%</TableCell>
                  <TableCell>{r.flatlineHours.toFixed(1)}h</TableCell>
                  <TableCell>{r.offlineEvents}</TableCell>
                  <TableCell>{integrityBadge(r)}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow><TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">No meters match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}

function SortableHead({
  k, label, sortKey, sortDir, onClick,
}: {
  k: SortKey; label: string; sortKey: SortKey; sortDir: "asc" | "desc"; onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => onClick(k)}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </Button>
    </TableHead>
  );
}