import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";

import { AppShell } from "@/components/launcher/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APPS, canAccess, ROLE_LABEL, useLauncher } from "@/lib/launcher-context";
import { BaseloadApp } from "@/components/launcher/apps/BaseloadApp";
import { SustainabilityApp } from "@/components/launcher/apps/SustainabilityApp";
import { DataCompletenessApp } from "@/components/launcher/apps/DataCompletenessApp";

export const Route = createFileRoute("/_authenticated/apps/$slug")({
  loader: ({ params }) => {
    const app = APPS.find((a) => a.slug === params.slug);
    if (!app) throw notFound();
    return { app };
  },
  component: AppView,
});

function AppView() {
  const { app } = Route.useLoaderData();
  const { persona } = useLauncher();
  const allowed = canAccess(app, persona.role);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Back to Launcher
            </Link>
          </Button>
          <div className="text-xs text-muted-foreground">
            Running as <span className="font-medium text-foreground">{ROLE_LABEL[persona.role]}</span>
          </div>
        </div>

        {!allowed ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">Access restricted</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your role ({ROLE_LABEL[persona.role]}) doesn't include access to{" "}
                <span className="font-medium text-foreground">{app.name}</span>. Switch persona to
                try again.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/">Return to launcher</Link>
              </Button>
            </CardContent>
          </Card>
        ) : app.slug === "baseload" ? (
          <BaseloadApp />
        ) : app.slug === "sustainability" ? (
          <SustainabilityApp />
        ) : app.slug === "data-completeness" ? (
          <DataCompletenessApp />
        ) : (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">
              This app is coming soon.
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}