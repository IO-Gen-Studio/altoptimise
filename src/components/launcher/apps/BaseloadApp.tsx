import { AlertTriangle, Gauge, Info, PauseCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBuildings, useConsumption, useDataStore, useOrganisations } from "@/lib/data-store";
import { checkCompleteness, utilityKind, type CompletenessResult } from "@/lib/energy/completeness";
import { inheritanceLabel, resolveProfile, type ResolvedProfile } from "@/lib/energy/profile";
import { computeBaseloadScore, type ScoreResult } from "@/lib/energy/scoring";
import { useLauncher } from "@/lib/launcher-context";

type WindowDays = 7 | 30 | 90;

export function BaseloadApp() {
  const { org } = useLauncher();
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);
  const { consumption } = useConsumption();
  const { state } = useDataStore();
  const [windowDays, setWindowDays] = useState<WindowDays>(7);

  const orgRecord = organisations.find((o) => o.id === org.id);

  // Determine window relative to most recent data date
  const { startISO, endISO, start, end } = useMemo(() => {
    const orgRows = consumption.filter((c) => c.organization_id === org.id);
    const dates = orgRows.map((r) => r.interval_date).sort();
    const last = dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
    const [y, m, d] = last.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const start = new Date(end);
    start.setDate(start.getDate() - (windowDays - 1));
    return {
      start,
      end,
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
    };
  }, [consumption, org.id, windowDays]);

  const analyses = useMemo(() => {
    return buildings.map((b) => {
      const buildingSchedules = state.schedules.filter((s) => s.building_id === b.id);
      const profile = resolveProfile(orgRecord, b, buildingSchedules);
      const rows = consumption.filter((c) => c.building_id === b.id);
      const utilities = Array.from(new Set(rows.map((r) => utilityKind(r.variable_category))))
        .filter((u) => u !== "other");
      const perUtility = utilities.map((u) => {
        const uRows = rows.filter((r) => utilityKind(r.variable_category) === u);
        const completeness = checkCompleteness(uRows, u, start, end, orgRecord, profile);
        const score = completeness.status === "ok"
          ? computeBaseloadScore(uRows, profile, startISO, endISO)
          : null;
        return { utility: u, completeness, score, rowCount: uRows.length };
      });
      return { building: b, profile, perUtility };
    });
  }, [buildings, consumption, state.schedules, orgRecord, start, end, startISO, endISO]);

  const scored = analyses.flatMap((a) =>
    a.perUtility
      .filter((u) => u.score && u.completeness.status === "ok")
      .map((u) => ({ building: a.building, ...u })),
  );
  const avgScore = scored.length
    ? scored.reduce((acc, x) => acc + (x.score?.score ?? 0), 0) / scored.length
    : 0;
  const totalAnomalies = scored.reduce((acc, x) => acc + (x.score?.anomalies.length ?? 0), 0);
  const pausedCount = analyses.reduce(
    (acc, a) => acc + a.perUtility.filter((u) => u.completeness.status !== "ok").length,
    0,
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10">
              <Gauge className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Baseload Scoring</h1>
              <p className="text-sm text-muted-foreground">
                Out-of-hours efficiency for {org.name} — last {windowDays} days.
              </p>
            </div>
          </div>
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as WindowDays)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard title="Portfolio avg score" value={avgScore.toFixed(0)} sub={`${scored.length} meter(s) scored`} />
          <SummaryCard title="Waste events" value={String(totalAnomalies)} sub="Baseload slots > threshold" />
          <SummaryCard title="Scoring paused" value={String(pausedCount)} sub="Meters with data issues" />
        </div>

        {analyses.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No buildings registered for {org.name}. Add buildings in Admin Settings.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {analyses.map((a) => (
            <BuildingCard key={a.building.id} name={a.building.custom_display_name} profile={a.profile} perUtility={a.perUtility} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</div>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

interface BuildingCardProps {
  name: string;
  profile: ResolvedProfile;
  perUtility: { utility: string; completeness: CompletenessResult; score: ScoreResult | null; rowCount: number }[];
}

function BuildingCard({ name, profile, perUtility }: BuildingCardProps) {
  const inheritance = inheritanceLabel(profile.source, profile.profileType);
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <Info className="h-3 w-3" /> {inheritance}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Baseline source: <span className="font-semibold">{profile.source}</span>. Active hours{" "}
                  {profile.activeFrom.slice(0, 5)}–{profile.activeTo.slice(0, 5)} on days{" "}
                  {profile.activeDays.join(", ")}.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {perUtility.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            No electricity, gas, or water meters routed to this building.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {perUtility.map((u) => (
              <UtilityTile key={u.utility} label={cap(u.utility)} completeness={u.completeness} score={u.score} profile={profile} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UtilityTile({
  label, completeness, score, profile,
}: {
  label: string;
  completeness: CompletenessResult;
  score: ScoreResult | null;
  profile: ResolvedProfile;
}) {
  if (completeness.status === "incomplete") {
    return (
      <DiagnosticTile
        label={label}
        title="Data Incomplete"
        reason={completeness.reason ?? "Insufficient interval coverage"}
        tone="amber"
        icon={AlertTriangle}
      />
    );
  }
  if (completeness.status === "telemetry_offline") {
    return (
      <DiagnosticTile
        label={label}
        title="Scoring Paused: Meter Inactive / Data Issues"
        reason={completeness.reason ?? "Meter offline"}
        tone="amber"
        icon={PauseCircle}
      />
    );
  }
  if (!score) return null;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{label} baseload</span>
        <span className="text-[10px] uppercase tracking-widest">{score.seasonMode === "peak" ? "Peak season" : "Off-peak"}</span>
      </div>
      <div className="mb-2 text-3xl font-semibold tracking-tight">{score.score.toFixed(0)}</div>
      <Progress value={score.score} className="h-1.5" />
      <div className="mt-2 text-[11px] text-muted-foreground">
        {score.anomalies.length} anomal{score.anomalies.length === 1 ? "y" : "ies"} · OOH energy{" "}
        {score.oohEnergy.toFixed(0)} · floor {score.floor.toFixed(1)}
      </div>
      {profile.profileType === "evening_peak" && (
        <BaseloadStrip highlightHours={[0, 16]} />
      )}
    </div>
  );
}

function BaseloadStrip({ highlightHours }: { highlightHours: [number, number] }) {
  const [from, to] = highlightHours;
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Daily baseload zone</div>
      <div className="relative h-2 overflow-hidden rounded bg-muted">
        <div
          className="absolute inset-y-0 bg-amber-500/40"
          style={{ left: `${(from / 24) * 100}%`, width: `${((to - from) / 24) * 100}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span>00:00</span><span>12:00</span><span>24:00</span>
      </div>
    </div>
  );
}

function DiagnosticTile({
  label, title, reason, tone, icon: Icon,
}: { label: string; title: string; reason: string; tone: "amber"; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === "amber" ? "border-amber-500/30 bg-amber-500/10" : ""}`}>
      <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
        <Icon className="h-4 w-4" /> {title}
      </div>
      <div className="text-[11px] text-muted-foreground">{reason}</div>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }