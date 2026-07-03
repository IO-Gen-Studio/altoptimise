import { Flame, Leaf, Sun, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useLauncher } from "@/lib/launcher-context";

const BREAKDOWN = [
  { label: "Electricity", value: 62, tco2e: "2,554", icon: Zap },
  { label: "Gas", value: 28, tco2e: "1,153", icon: Flame },
  { label: "Solar PV offset", value: 10, tco2e: "-412", icon: Sun },
];

export function SustainabilityApp() {
  const { org } = useLauncher();
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10">
          <Leaf className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sustainability Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Scope 1 & 2 carbon footprint for {org.name}.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="YTD emissions" value="4,120 tCO₂e" sub="-6.1% vs prior year" />
        <Metric label="Intensity" value="0.31 tCO₂e / MWh" sub="Below sector avg" />
        <Metric label="Net-zero target" value="2035" sub="On track" />
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div>
            <h2 className="text-base font-semibold">Emissions by source</h2>
            <p className="text-xs text-muted-foreground">Last 12 months, aggregated across sites.</p>
          </div>
          {BREAKDOWN.map((b) => (
            <div key={b.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <b.icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{b.label}</span>
                </div>
                <span className="text-muted-foreground">{b.tco2e} tCO₂e</span>
              </div>
              <Progress value={b.value} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-emerald-600">{sub}</div>
      </CardContent>
    </Card>
  );
}