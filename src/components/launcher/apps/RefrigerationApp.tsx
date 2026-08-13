import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Snowflake,
  Thermometer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLauncher } from "@/lib/launcher-context";
import { useBuildings } from "@/lib/data-store";
import {
  loadBuildingRefrigeration,
  loadRefrigerationOverview,
} from "@/lib/refrigeration.functions";
import {
  caseOptionFromRow,
  EFFICIENCY_CONFIG,
  getEfficiencyFlag,
  type CaseOption,
  type RefrigerationCaseRow,
} from "@/lib/refrigeration/types";
import {
  parseRefrigerationCSV,
  type RefrigerationReading,
} from "@/lib/refrigeration/parse";
import { parseAlarmCSV, buildAlarmIndex, type AlarmEntry } from "@/lib/refrigeration/alarms";
import { countMissingReadings } from "@/lib/refrigeration/missing-readings";
import { exportToExcel } from "@/lib/refrigeration/export-excel";
import { StatCard } from "./refrigeration/StatCard";
import { TemperatureChart } from "./refrigeration/TemperatureChart";
import { DailyRangeChart } from "./refrigeration/DailyRangeChart";
import { DailySummaryTable } from "./refrigeration/DailySummaryTable";
import { ControlStateTimeline } from "./refrigeration/ControlStateTimeline";
import { AlarmAnalysisWidget } from "./refrigeration/AlarmAnalysisWidget";
import { RecoveryAnalysisWidget } from "./refrigeration/RecoveryAnalysisWidget";
import { DefrostAnalysisWidget } from "./refrigeration/DefrostAnalysisWidget";
import { HeatmapWidget } from "./refrigeration/CaseHeatmapView";
import { DateRangePicker } from "./refrigeration/DateRangePicker";
import {
  HourlyTemperatureView,
  type HourlyTemperatureViewHandle,
} from "./refrigeration/SiteTemperatureTable";

interface CaseSummary {
  rowId: string;
  caseId: string;
  label: string;
  readings: RefrigerationReading[];
  avgTemp: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  exceedances: number;
  totalReadings: number;
  missingReadings: number;
  alarmCount: number;
  maxSafeTemp: number;
  efficiencyRed: number;
  efficiencyAmber: number;
  offline: boolean;
}

const SEVEN_DAYS = 7 * 86400000;

function summarize(
  row: RefrigerationCaseRow,
  readings: RefrigerationReading[],
  alarmIndex: Map<string, Map<string, AlarmEntry[]>>,
  range: [Date, Date],
): CaseSummary {
  const inRange = readings.filter((r) => r.time >= range[0] && r.time <= range[1]);
  const temps = inRange
    .map((r) => r.controlTemp)
    .filter((t): t is number => t !== null);
  const latest = readings.length
    ? Math.max(...readings.map((r) => r.time.getTime()))
    : 0;
  let alarmCount = 0;
  alarmIndex.get(row.case_id)?.forEach((entries) => {
    alarmCount += entries.filter(
      (e) => e.occurred >= range[0] && e.occurred <= range[1],
    ).length;
  });
  return {
    rowId: row.id,
    caseId: row.case_id,
    label: row.label || row.description || row.case_id,
    readings,
    avgTemp: temps.length
      ? +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
      : null,
    minTemp: temps.length ? Math.min(...temps) : null,
    maxTemp: temps.length ? Math.max(...temps) : null,
    exceedances: temps.filter((t) => t > row.max_safe_temp).length,
    totalReadings: temps.length,
    missingReadings: countMissingReadings(readings, range[0], range[1]).missing,
    alarmCount,
    maxSafeTemp: row.max_safe_temp,
    efficiencyRed: row.efficiency_red,
    efficiencyAmber: row.efficiency_amber,
    offline: latest < Date.now() - SEVEN_DAYS,
  };
}

export function RefrigerationApp() {
  const { org } = useLauncher();
  const { buildings } = useBuildings();
  const overviewFn = useServerFn(loadRefrigerationOverview);
  const [cases, setCases] = useState<RefrigerationCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [buildingId, setBuildingId] = useState<string | null>(null);

  useEffect(() => {
    if (!org.id || org.id === "none") return;
    let alive = true;
    setLoading(true);
    overviewFn({ data: { orgId: org.id } })
      .then((res) => {
        if (!alive) return;
        setCases(res.cases);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [org.id, overviewFn]);

  const byBuilding = useMemo(() => {
    const m = new Map<string, RefrigerationCaseRow[]>();
    cases.forEach((c) => {
      const list = m.get(c.building_id) ?? [];
      list.push(c);
      m.set(c.building_id, list);
    });
    return m;
  }, [cases]);

  if (buildingId) {
    const building = buildings.find((b) => b.id === buildingId);
    return (
      <BuildingRefrigerationView
        buildingId={buildingId}
        buildingName={building?.custom_display_name ?? "Site"}
        orgId={org.id}
        onBack={() => setBuildingId(null)}
      />
    );
  }

  const sites = buildings.filter((b) => (byBuilding.get(b.id)?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Snowflake className="h-5 w-5 text-primary" /> Refrigeration Monitoring
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Temperature performance, alarms, defrost and recovery analysis for every
          refrigeration case across your sites.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading refrigeration cases…
          </CardContent>
        </Card>
      ) : sites.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No refrigeration cases uploaded yet. Add case CSV exports in Settings →
            Refrigeration.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((b) => {
            const list = byBuilding.get(b.id) ?? [];
            return (
              <Card
                key={b.id}
                onClick={() => setBuildingId(b.id)}
                className="cursor-pointer transition-shadow hover:shadow-md"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      {b.custom_display_name}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-6 text-sm">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {list.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Cases</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {(
                        list.reduce((a, c) => a + c.max_safe_temp, 0) / list.length
                      ).toFixed(1)}
                      °C
                    </div>
                    <div className="text-xs text-muted-foreground">Avg cut-in</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BuildingRefrigerationView({
  buildingId,
  buildingName,
  orgId,
  onBack,
}: {
  buildingId: string;
  buildingName: string;
  orgId: string;
  onBack: () => void;
}) {
  const loadFn = useServerFn(loadBuildingRefrigeration);
  const [rows, setRows] = useState<RefrigerationCaseRow[]>([]);
  const [alarms, setAlarms] = useState<AlarmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"summary" | "hourly">("summary");
  const [activeCase, setActiveCase] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);
  const hourlyRef = useRef<HourlyTemperatureViewHandle>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadFn({ data: { orgId, buildingId } })
      .then((res) => {
        if (!alive) return;
        setRows(res.cases);
        setAlarms(res.alarmCsv ? parseAlarmCSV(res.alarmCsv) : []);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orgId, buildingId, loadFn]);

  const parsed = useMemo(() => {
    const m = new Map<string, RefrigerationReading[]>();
    rows.forEach((r) => {
      try {
        m.set(r.id, r.csv_text ? parseRefrigerationCSV(r.csv_text).readings : []);
      } catch {
        m.set(r.id, []);
      }
    });
    return m;
  }, [rows]);

  const bounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    parsed.forEach((readings) => {
      readings.forEach((r) => {
        const t = r.time.getTime();
        if (t < min) min = t;
        if (t > max) max = t;
      });
    });
    if (!isFinite(min)) return { min: new Date(), max: new Date() };
    return { min: new Date(min), max: new Date(max) };
  }, [parsed]);

  useEffect(() => {
    setDateRange([new Date(bounds.max.getTime() - 86400000), bounds.max]);
  }, [bounds.max]);

  const range: [Date, Date] = dateRange ?? [
    new Date(bounds.max.getTime() - 86400000),
    bounds.max,
  ];

  const alarmIndex = useMemo(() => buildAlarmIndex(alarms), [alarms]);

  const summaries = useMemo(
    () =>
      rows.map((r) => summarize(r, parsed.get(r.id) ?? [], alarmIndex, range)),
    [rows, parsed, alarmIndex, range],
  );

  const caseOptions: CaseOption[] = useMemo(
    () => rows.map((r) => caseOptionFromRow(r)),
    [rows],
  );

  if (activeCase) {
    const row = rows.find((r) => r.case_id === activeCase);
    if (row) {
      return (
        <CaseDashboard
          row={row}
          readings={parsed.get(row.id) ?? []}
          caseOptions={caseOptions}
          onSelectCase={setActiveCase}
          onBack={() => setActiveCase(null)}
          buildingName={buildingName}
        />
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> All sites
          </Button>
          <div>
            <h2 className="text-lg font-semibold leading-tight">{buildingName}</h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} case{rows.length === 1 ? "" : "s"} ·{" "}
              {alarms.length} alarm{alarms.length === 1 ? "" : "s"} loaded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="summary">Case summary</TabsTrigger>
              <TabsTrigger value="hourly">Hourly grid</TabsTrigger>
            </TabsList>
          </Tabs>
          <DateRangePicker
            dateRange={range}
            onDateRangeChange={setDateRange}
            minDate={bounds.min}
            maxDate={bounds.max}
          />
          {tab === "hourly" && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Export hourly grid"
              onClick={() =>
                exportToExcel(
                  hourlyRef.current?.getExportData() ?? [],
                  `${buildingName}-hourly`,
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading case data…
            </div>
          ) : tab === "hourly" ? (
            <HourlyTemperatureView
              ref={hourlyRef}
              cases={caseOptions}
              dateRange={range}
              alarms={alarms}
              showLabels
              onCaseClick={(cid) => setActiveCase(cid)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Case</th>
                    <th className="px-4 py-3 text-center font-medium">TPI</th>
                    <th className="px-4 py-3 text-right font-medium">Avg °C</th>
                    <th className="px-4 py-3 text-right font-medium">Min °C</th>
                    <th className="px-4 py-3 text-right font-medium">Max °C</th>
                    <th className="px-4 py-3 text-right font-medium">Cut-in</th>
                    <th className="px-4 py-3 text-right font-medium">Exceedances</th>
                    <th className="px-4 py-3 text-right font-medium">Missing</th>
                    <th className="px-4 py-3 text-right font-medium">Alarms</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => {
                    const flag = getEfficiencyFlag(
                      s.exceedances,
                      s.totalReadings,
                      s.efficiencyRed,
                      s.efficiencyAmber,
                    );
                    const cfg = EFFICIENCY_CONFIG[flag];
                    const pct =
                      s.totalReadings > 0
                        ? (100 - (s.exceedances / s.totalReadings) * 100).toFixed(1)
                        : "100.0";
                    return (
                      <tr
                        key={s.rowId}
                        onClick={() => setActiveCase(s.caseId)}
                        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium">{s.caseId}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.offline ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-status-warn/10 px-2 py-0.5 text-xs font-medium text-status-warn">
                              Offline
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color} ${cfg.bgColor}`}
                            >
                              <Circle className="h-2 w-2 fill-current" />
                              {pct}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {s.avgTemp?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {s.minTemp?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {s.maxTemp?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {s.maxSafeTemp}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono ${s.exceedances > 0 ? "font-medium text-status-error" : "text-muted-foreground"}`}
                        >
                          {s.exceedances}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono ${s.missingReadings > 0 ? "font-medium text-status-warn" : "text-muted-foreground"}`}
                        >
                          {s.missingReadings}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono ${s.alarmCount > 0 ? "font-medium text-status-error" : "text-muted-foreground"}`}
                        >
                          {s.alarmCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CaseDashboard({
  row,
  readings,
  caseOptions,
  onSelectCase,
  onBack,
  buildingName,
}: {
  row: RefrigerationCaseRow;
  readings: RefrigerationReading[];
  caseOptions: CaseOption[];
  onSelectCase: (id: string) => void;
  onBack: () => void;
  buildingName: string;
}) {
  const maxDate = useMemo(
    () => (readings.length ? readings[readings.length - 1]!.time : new Date()),
    [readings],
  );
  const minDate = useMemo(
    () => (readings.length ? readings[0]!.time : new Date()),
    [readings],
  );
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);
  useEffect(() => {
    setDateRange([new Date(maxDate.getTime() - 86400000), maxDate]);
  }, [maxDate]);
  const range: [Date, Date] = dateRange ?? [
    new Date(maxDate.getTime() - 86400000),
    maxDate,
  ];
  const maxSafe = row.max_safe_temp;

  const stats = useMemo(() => {
    const filtered = readings.filter(
      (r) => r.time >= range[0] && r.time <= range[1],
    );
    const temps = filtered
      .map((r) => r.controlTemp)
      .filter((t): t is number => t !== null);
    const above = temps.filter((t) => t > maxSafe);
    return {
      avgTemp: temps.length
        ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
        : "—",
      maxTemp: temps.length ? Math.max(...temps).toFixed(1) : "—",
      exceedances: above.length,
      exceedancePct: temps.length
        ? ((above.length / temps.length) * 100).toFixed(1)
        : "0",
      missingReadings: countMissingReadings(readings, range[0], range[1]).missing,
    };
  }, [readings, range, maxSafe]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> {buildingName}
          </Button>
          <Select value={row.case_id} onValueChange={onSelectCase}>
            <SelectTrigger className="h-9 w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {caseOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label} · {c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateRangePicker
          dateRange={range}
          onDateRangeChange={setDateRange}
          minDate={minDate}
          maxDate={maxDate}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Avg Temperature"
          value={stats.avgTemp}
          unit="°C"
          icon={<Thermometer size={18} />}
          trend={parseFloat(stats.avgTemp) > maxSafe ? "error" : "ok"}
        />
        <StatCard
          label="Peak Temperature"
          value={stats.maxTemp}
          unit="°C"
          icon={<AlertTriangle size={18} />}
          trend={parseFloat(stats.maxTemp) > maxSafe ? "warn" : "ok"}
          delay={60}
        />
        <StatCard
          label="Threshold Exceedances"
          value={stats.exceedances}
          unit={`(${stats.exceedancePct}%)`}
          icon={<Activity size={18} />}
          trend={stats.exceedances > 0 ? "error" : "ok"}
          delay={120}
        />
        <StatCard
          label="Missing Readings"
          value={stats.missingReadings}
          icon={<Clock size={18} />}
          trend={stats.missingReadings > 0 ? "warn" : "ok"}
          delay={180}
        />
      </div>

      <TemperatureChart readings={readings} dateRange={range} maxSafeTemp={maxSafe} />

      <div className="grid gap-6 lg:grid-cols-2">
        <DailyRangeChart readings={readings} dateRange={range} maxSafeTemp={maxSafe} />
        <ControlStateTimeline readings={readings} dateRange={range} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <AlarmAnalysisWidget readings={readings} dateRange={range} />
        <RecoveryAnalysisWidget
          readings={readings}
          dateRange={range}
          maxSafeTemp={maxSafe}
        />
        <DefrostAnalysisWidget
          readings={readings}
          dateRange={range}
          maxSafeTemp={maxSafe}
        />
      </div>

      <HeatmapWidget readings={readings} dateRange={range} />
      <DailySummaryTable readings={readings} dateRange={range} />
    </div>
  );
}
