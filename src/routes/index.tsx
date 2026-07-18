import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Gauge,
  Leaf,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AppShell } from "@/components/launcher/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { APPS, canAccess, ROLE_LABEL, useLauncher, type MiniApp } from "@/lib/launcher-context";

export const Route = createFileRoute("/")({
  component: LauncherHome,
});

const ICONS = {
  baseload: Gauge,
  sustainability: Leaf,
  completeness: ShieldCheck,
};

function LauncherHome() {
  const { persona, org } = useLauncher();

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
          <StatCard label="Total consumption" value="18.4 GWh" trend="-4.2%" positive icon={TrendingDown} />
          <StatCard label="Baseload health" value="87 / 100" trend="+3 pts" positive icon={Gauge} />
          <StatCard label="Carbon (Scope 1+2)" value="4,120 tCO₂e" trend="-6.1%" positive icon={Leaf} />
          <StatCard label="Active anomalies" value="3" trend="+1 today" positive={false} icon={TrendingUp} />
        </div>

        <div className="flex items-center justify-between pb-4">
          <h2 className="text-lg font-semibold tracking-tight">Apps</h2>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            {APPS.filter((a) => canAccess(a, persona.role, appAccess)).length} of {APPS.length} accessible
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {APPS.map((app) => (
            <AppCard key={app.id} app={app} allowed={canAccess(app, persona.role, appAccess)} />
          ))}
        </div>
      </div>
    </AppShell>
  );
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

function AppCard({ app, allowed }: { app: MiniApp; allowed: boolean }) {
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
            <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
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
