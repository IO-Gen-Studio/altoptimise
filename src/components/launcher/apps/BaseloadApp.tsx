import { AlertTriangle, Gauge, TrendingDown, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useLauncher } from "@/lib/launcher-context";

const ANOMALIES = [
  { site: "Line 3 compressor", type: "Electricity", severity: "High", delta: "+41%", when: "2h ago" },
  { site: "HVAC — Block B", type: "Gas", severity: "Medium", delta: "+18%", when: "Yesterday" },
  { site: "Overnight lighting", type: "Electricity", severity: "Low", delta: "+7%", when: "3 days ago" },
];

export function BaseloadApp() {
  const { org } = useLauncher();
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10">
          <Gauge className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Baseload Scoring</h1>
          <p className="text-sm text-muted-foreground">
            Electricity and gas baseload analysis for {org.name}.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <ScoreCard title="Electricity baseload" score={87} trend="-4% vs last month" icon={Zap} />
        <ScoreCard title="Gas baseload" score={72} trend="+2% vs last month" icon={TrendingDown} />
        <ScoreCard title="Combined score" score={82} trend="Healthy" icon={Gauge} />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Recent anomalies</h2>
              <p className="text-xs text-muted-foreground">Unusual usage detected in the last 7 days.</p>
            </div>
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {ANOMALIES.length} active
            </Badge>
          </div>
          <div className="divide-y divide-border">
            {ANOMALIES.map((a) => (
              <div key={a.site} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium">{a.site}</div>
                  <div className="text-xs text-muted-foreground">{a.type} · {a.when}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-amber-600">{a.delta}</span>
                  <Badge
                    variant="outline"
                    className={
                      a.severity === "High"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : a.severity === "Medium"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                          : "border-border bg-muted text-muted-foreground"
                    }
                  >
                    {a.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCard({
  title,
  score,
  trend,
  icon: Icon,
}: {
  title: string;
  score: number;
  trend: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{title}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="text-3xl font-semibold tracking-tight">{score}</div>
        <Progress value={score} className="h-1.5" />
        <div className="text-xs text-muted-foreground">{trend}</div>
      </CardContent>
    </Card>
  );
}