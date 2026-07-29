import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Shield } from "lucide-react";

import { BuildingsPanel } from "@/components/admin/BuildingsPanel";
import { CsvIngestion } from "@/components/admin/CsvIngestion";
import { IngestionSchedulesPanel } from "@/components/admin/IngestionSchedulesPanel";
import { MeterRegistryPanel } from "@/components/admin/MeterRegistryPanel";
import { OrganisationsPanel } from "@/components/admin/OrganisationsPanel";
import { SchemaLabelsEditor } from "@/components/admin/SchemaLabelsEditor";
import { AppOrderPanel } from "@/components/admin/AppOrderPanel";
import { AppShell } from "@/components/launcher/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABEL, useLauncher } from "@/lib/launcher-context";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { persona } = useLauncher();
  const canView = persona.role === "super_admin" || persona.role === "admin";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <header className="mb-6 flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage organisations, buildings, data ingestion and global schema labels.
            </p>
          </div>
        </header>

        {!canView ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">Admin access required</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your role ({ROLE_LABEL[persona.role]}) doesn't include admin settings.
                Ask an admin to grant you access.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/dashboard">Return to launcher</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="orgs" className="space-y-4">
            <TabsList>
              <TabsTrigger value="orgs">Organisations</TabsTrigger>
              <TabsTrigger value="buildings">Buildings</TabsTrigger>
              <TabsTrigger value="meters">Meters</TabsTrigger>
              <TabsTrigger value="data">Data Update</TabsTrigger>
              <TabsTrigger value="apps">Apps</TabsTrigger>
            </TabsList>
            <TabsContent value="orgs"><OrganisationsPanel /></TabsContent>
            <TabsContent value="buildings"><BuildingsPanel /></TabsContent>
            <TabsContent value="meters"><MeterRegistryPanel /></TabsContent>
            <TabsContent value="data" className="space-y-4">
              <CsvIngestion />
              <IngestionSchedulesPanel />
              <SchemaLabelsEditor />
            </TabsContent>
            <TabsContent value="apps"><AppOrderPanel /></TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}