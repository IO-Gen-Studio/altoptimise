import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Droplet,
  Gauge,
  Leaf,
  ShieldCheck,
  Trophy,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Optimise — Energy Management Suite for Multi-Site Portfolios" },
      {
        name: "description",
        content:
          "Optimise unifies half-hourly energy data into baseload scoring, data validation, consumption leagues, carbon tracking, leak detection and Agile pricing. Sign in to your workspace.",
      },
      { property: "og:title", content: "Optimise — Energy Management Suite" },
      {
        property: "og:description",
        content:
          "One shared half-hourly data stream powering baseload scoring, validation, carbon reporting, leak detection and Agile pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: Gauge, title: "Baseload scoring", copy: "Season-aware overnight baseload analysis against your operational profiles." },
  { icon: ShieldCheck, title: "Data validation", copy: "Completeness, stagnation and spike detection across every meter." },
  { icon: Trophy, title: "Consumption league", copy: "Rank sites by utility with year-on-year comparisons and cost estimates." },
  { icon: Leaf, title: "Sustainability tracker", copy: "Scope 1, 2 and customisable Scope 3 reporting with DEFRA factors." },
  { icon: Droplet, title: "Water sentinel", copy: "Overnight flow monitoring that surfaces persistent leaks and their cost." },
  { icon: Zap, title: "Agile pricing", copy: "Live Octopus Agile rates with day-ahead curves and load-shift advice." },
];

function LandingPage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) navigate({ to: "/dashboard", replace: true });
      else setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[image:var(--gradient-brand)] text-white shadow-sm">
              <Zap className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Optimise</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Energy Suite
              </div>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
          <div className="max-w-3xl">
            <div className="text-xs font-medium uppercase tracking-widest text-primary">
              Multi-site energy intelligence
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Every meter, every half hour, in one place.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-muted-foreground">
              Optimise turns raw half-hourly consumption into decisions — baseload scores,
              data integrity alerts, site league tables, carbon reporting, leak detection
              and Agile price optimisation, all over one shared data stream.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/auth">
                  Sign in to your workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {checked
                  ? "Accounts are provisioned by your administrator."
                  : "Checking your session…"}
              </span>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
            <h2 className="text-lg font-semibold tracking-tight">What's inside</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title} className="border-border/60 shadow-none">
                  <CardContent className="p-6">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-background shadow-sm ring-1 ring-border">
                      <f.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{f.copy}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground md:px-8">
          <span>© {new Date().getFullYear()} Optimise Energy Suite</span>
          <Link to="/auth" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
