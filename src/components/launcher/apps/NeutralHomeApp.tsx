import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLauncher } from "@/lib/launcher-context";
import { loadNeutralHome, type NeutralHomeBundle } from "@/lib/neutral-home.functions";
import { NeutralHomeDashboard } from "./neutral-home/NeutralHomeDashboard";
import { NeutralHomeSettings } from "./neutral-home/NeutralHomeSettings";

const EMPTY: NeutralHomeBundle = {
  sites: [], periods: [], circuits: [], categories: [], meterCategories: [], metrics: [], settings: [],
};

export function NeutralHomeApp() {
  const { org, persona } = useLauncher();
  const canEdit = persona.role === "super_admin" || persona.role === "admin";
  const [bundle, setBundle] = useState<NeutralHomeBundle>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!org.id || org.id === "none") { setBundle(EMPTY); setLoading(false); return; }
    setLoading(true);
    loadNeutralHome({ data: { orgId: org.id } })
      .then((b) => { if (!cancelled) setBundle(b); })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not load Neutral Home data");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [org.id, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Neutral Home</h1>
        <p className="text-sm text-muted-foreground">
          Reporting for Excel Utilities
        </p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
          ) : (
            <NeutralHomeDashboard bundle={bundle} />
          )}
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <NeutralHomeSettings orgId={org.id} bundle={bundle} canEdit={canEdit} onChanged={reload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}