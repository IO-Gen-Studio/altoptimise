import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Droplet,
  Gauge,
  Leaf,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/launcher/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { APPS, canAccess, ROLE_LABEL, useLauncher, type MiniApp } from "@/lib/launcher-context";
import { useAppOrder } from "@/lib/app-order";
import { useMemo } from "react";
import { useBuildings, useConsumption, useOrganisations } from "@/lib/data-store";
import {
  classifyUtility,
  presetRange,
  prevYearRange,
  rowTotal,
  rowsInRange,
} from "@/lib/energy/league";
import { computeScope12 } from "@/lib/energy/emissions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Optimise Energy Suite" },
      {
        name: "description",
        content:
          "Your organisation's live energy KPIs and mini-app launcher: consumption, data coverage, carbon and offline meters.",
      },
      { property: "og:title", content: "Dashboard — Optimise Energy Suite" },
      {
        property: "og:description",
        content:
          "Live energy KPIs and the Optimise mini-app launcher for your organisation.",
      },
    ],
  }),
  component: LauncherHome,
});

const ICONS = {
  baseload: Gauge,
  sustainability: Leaf,
  completeness: ShieldCheck,
  league: Trophy,
  water: Droplet,
  pricing: Zap,
};

function LauncherHome() {
  const { persona, org, appAccess } = useLauncher();
  const { orderedApps } = useAppOrder();
  const { consumption } = useConsumption();
  const { organisations } = useOrganisations();
  const { buildings } = useBuildings(org.id);

  const stats = useMemo(() => computeOrgStats(consumption, organisations, org.id), [consumption, organisations, org.id]);
  const kpis = useMemo(
    () => computeAppKpis(consumption, org.id, buildings.length, stats),
    [consumption, org.id, buildings.length, stats],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-2 pb-8">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Launcher
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Welcome back, {persona.name.split(" ")[0]}.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            You're viewing <span className="font-medium text-foreground">{org.name}</span> as{" "}
            <span className="font-medium text-foreground">{ROLE_LABEL[persona.role]}</span>. Pick an
            app below — they all read from the same live energy data stream.
          </p>
        </div>

        <div className="grid gap-4 pb-8 md:grid-cols-4">
          <StatCard
            label="Total consumption (YTD)"
            value={stats.totalConsumption.value}
            trend={stats.totalConsumption.trend}
            positive={stats.totalConsumption.positive}
            icon={stats.totalConsumption.positive ? TrendingDown : TrendingUp}
          />
          <StatCard
            label="Data coverage"
            value={stats.coverage.value}
            trend={stats.coverage.trend}
            positive={stats.coverage.positive}
            icon={Gauge}
          />
          <StatCard
            label="Carbon (Scope 1+2)"
            value={stats.carbon.value}
            trend={stats.carbon.trend}
            positive={stats.carbon.positive}
            icon={Leaf}
          />
          <StatCard
            label="Offline meters (7d)"
            value={stats.offline.value}
            trend={stats.offline.trend}
            positive={stats.offline.positive}
            icon={stats.offline.positive ? TrendingDown : TrendingUp}
          />
        </div>

        <div className="flex items-center justify-between pb-4">
          <h2 className="text-lg font-semibold tracking-tight">Apps</h2>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            {APPS.filter((a) => canAccess(a, persona.role, appAccess)).length} of {APPS.length} accessible
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedApps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              allowed={canAccess(app, persona.role, appAccess)}
              kpi={kpis[app.slug]}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

interface Stat { value: string; trend: string; positive: boolean }
interface OrgStats {
  totalConsumption: Stat;
  coverage: Stat;
  carbon: Stat;
  offline: Stat;
}

function formatEnergy(kwh: number): string {
  if (kwh >= 1_000_000) return `${(kwh / 1_000_000).toFixed(2)} GWh`;
  if (kwh >= 1_000) return `${(kwh / 1_000).toFixed(1)} MWh`;
  return `${Math.round(kwh).toLocaleString()} kWh`;
}

function formatDelta(curr: number, prev: number): { trend: string; positive: boolean } {
  if (prev <= 0) {
    if (curr <= 0) return { trend: "No prior data", positive: true };
    return { trend: "New data", positive: true };
  }
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { trend: `${sign}${pct.toFixed(1)}% YoY`, positive: pct <= 0 };
}

function computeOrgStats(
  consumption: Array<import("@/lib/data-store").ConsumptionRow>,
  organisations: Array<import("@/lib/data-store").Organisation>,
  orgId: string,
): OrgStats {
  const empty: Stat = { value: "—", trend: "No data", positive: true };
  const org = organisations.find((o) => o.id === orgId);
  const rows = consumption.filter((r) => r.organization_id === orgId);
  if (!rows.length) {
    return { totalConsumption: empty, coverage: empty, carbon: empty, offline: empty };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const ytd = presetRange("ytd", today);
  const prev = prevYearRange(ytd);

  // Electricity totals for total-consumption card
  let elecCurr = 0;
  let elecPrev = 0;
  const rowsCurr = rowsInRange(rows, ytd);
  const rowsPrev = rowsInRange(rows, prev);
  for (const r of rowsCurr) {
    if (classifyUtility(r.variable_category) === "electricity") elecCurr += rowTotal(r);
  }
  for (const r of rowsPrev) {
    if (classifyUtility(r.variable_category) === "electricity") elecPrev += rowTotal(r);
  }

  // Carbon Scope 1+2 YTD vs previous year
  const scopeCurr = computeScope12(rows, org, ytd.startISO, ytd.endISO);
  const scopePrev = computeScope12(rows, org, prev.startISO, prev.endISO);

  // Data coverage: non-null HH slots / expected slots across YTD rows
  let present = 0;
  let expected = 0;
  for (const r of rowsCurr) {
    expected += 48;
    for (let i = 0; i < 48; i++) if (r.half_hourly_values[i] != null) present++;
  }
  const coveragePct = expected > 0 ? (present / expected) * 100 : 0;

  // Offline meters: meter_name with no data in last 7 days
  const sevenAgo = new Date(today);
  sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 6);
  const sevenAgoISO = sevenAgo.toISOString().slice(0, 10);
  const todayISO = today.toISOString().slice(0, 10);
  const allMeters = new Set<string>();
  const recentMeters = new Set<string>();
  for (const r of rows) {
    allMeters.add(r.meter_name);
    if (r.interval_date >= sevenAgoISO && r.interval_date <= todayISO) recentMeters.add(r.meter_name);
  }
  const offline = allMeters.size - recentMeters.size;

  const elecDelta = formatDelta(elecCurr, elecPrev);
  const carbDelta = formatDelta(scopeCurr.totalScope12Tco2e, scopePrev.totalScope12Tco2e);

  return {
    totalConsumption: {
      value: formatEnergy(elecCurr),
      trend: elecDelta.trend,
      positive: elecDelta.positive,
    },
    coverage: {
      value: `${coveragePct.toFixed(1)}%`,
      trend: coveragePct >= 90 ? "Healthy" : coveragePct >= 70 ? "Watch" : "Low",
      positive: coveragePct >= 90,
    },
    carbon: {
      value: `${scopeCurr.totalScope12Tco2e.toLocaleString(undefined, { maximumFractionDigits: 1 })} tCO₂e`,
      trend: carbDelta.trend,
      positive: carbDelta.positive,
    },
    offline: {
      value: offline.toString(),
      trend: `${allMeters.size} meters tracked`,
      positive: offline === 0,
    },
  };
}

function StatCard({
  label,
  value,
  trend,
  positive,
  icon: Icon,
}: {
  label: string;
  value: string;
  trend: string;
  positive: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          <div
            className={cn(
              "text-xs font-medium",
              positive ? "text-emerald-600" : "text-amber-600",
            )}
          >
            {trend}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AppKpi { value: string; label: string }

function computeAppKpis(
  consumption: Array<import("@/lib/data-store").ConsumptionRow>,
  orgId: string,
  siteCount: number,
  stats: OrgStats,
): Record<string, AppKpi> {
  const rows = consumption.filter((r) => r.organization_id === orgId);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const iso = (d: number) => {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - d);
    return dt.toISOString().slice(0, 10);
  };
  const from30 = iso(30);
  const from7 = iso(7);

  let overnightSum = 0;
  let overnightSlots = 0;
  let elec7 = 0;
  const elec7Days = new Set<string>();
  let waterNight = 0;
  const waterNights = new Set<string>();

  for (const r of rows) {
    const util = classifyUtility(r.variable_category);
    if (r.interval_date >= from30) {
      if (util === "electricity") {
        for (let i = 0; i < 10; i++) {
          const v = r.half_hourly_values[i];
          if (v != null) { overnightSum += Number(v); overnightSlots++; }
        }
      }
      if (util === "water") {
        let night = 0;
        let any = false;
        for (const i of [46, 47, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          const v = r.half_hourly_values[i];
          if (v != null) { night += Number(v); any = true; }
        }
        if (any) { waterNight += night; waterNights.add(r.interval_date); }
      }
    }
    if (r.interval_date >= from7 && util === "electricity") {
      elec7 += rowTotal(r);
      elec7Days.add(r.interval_date);
    }
  }

  const baseloadKw = overnightSlots ? (overnightSum / overnightSlots) * 2 : 0;
  const elecPerDay = elec7Days.size ? elec7 / elec7Days.size : 0;
  const waterPerNight = waterNights.size ? waterNight / waterNights.size : 0;

  return {
    baseload: {
      value: baseloadKw ? `${baseloadKw.toLocaleString(undefined, { maximumFractionDigits: baseloadKw < 10 ? 1 : 0 })} kW` : "—",
      label: "Avg baseload",
    },
    "data-validation": { value: stats.coverage.value, label: "Coverage" },
    sustainability: { value: stats.carbon.value, label: "YTD carbon" },
    "league-table": { value: `${siteCount}`, label: siteCount === 1 ? "Site ranked" : "Sites ranked" },
    "water-sentinel": {
      value: waterPerNight ? `${waterPerNight.toFixed(2)} m³` : "—",
      label: "Overnight/night",
    },
    "agile-pricing": {
      value: elecPerDay ? formatEnergy(elecPerDay) : "—",
      label: "Elec / day",
    },
  };
}

function AppCard({ app, allowed, kpi }: { app: MiniApp; allowed: boolean; kpi?: AppKpi }) {
  const Icon = ICONS[app.icon];
  const inner = (
    <Card
      className={cn(
        "group relative h-full overflow-hidden border-border/60 transition-all",
        allowed
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
          : "cursor-not-allowed opacity-60",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
          app.accent,
        )}
      />
      <CardContent className="relative flex h-full flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-background/90 shadow-sm ring-1 ring-border">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          {allowed ? (
            <div className="flex flex-col items-end text-right">
              {kpi ? (
                <div className="leading-none">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">{kpi.value}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
              <Lock className="h-3 w-3" /> Restricted
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {app.category}
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">{app.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{app.tagline}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
            {app.description}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </div>
          {allowed ? (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-primary hover:text-primary">
              Open
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span>Needs elevated role</span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!allowed) return inner;
  return (
    <Link to="/apps/$slug" params={{ slug: app.slug }} className="block h-full">
      {inner}
    </Link>
  );
}
