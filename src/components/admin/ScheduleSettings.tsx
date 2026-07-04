import { Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIngestionSettings } from "@/lib/data-store";

export function ScheduleSettings() {
  const { ingestion, setIngestion, markSynced } = useIngestionSettings();

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold">Automated ingestion</h2>
          <p className="text-xs text-muted-foreground">
            Configure the daily fetch schedule and source URL. Runs server-side once Cloud is enabled.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sched-time" className="text-xs uppercase tracking-widest text-muted-foreground">
              <Clock className="mr-1 inline h-3.5 w-3.5" /> Daily update time
            </Label>
            <Input
              id="sched-time"
              type="time"
              value={ingestion.scheduled_time}
              onChange={(e) => setIngestion({ scheduled_time: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sched-url" className="text-xs uppercase tracking-widest text-muted-foreground">
              Source URL
            </Label>
            <Input
              id="sched-url"
              placeholder="https://data.example.com/exports/latest.csv"
              value={ingestion.source_url}
              onChange={(e) => setIngestion({ source_url: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-4">
          <div className="text-sm">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Last successfully updated</div>
            <div className="mt-0.5 font-medium">
              {ingestion.last_synced_at
                ? new Date(ingestion.last_synced_at).toLocaleString()
                : "Never"}
            </div>
          </div>
          <Button
            className="gap-1.5"
            onClick={() => {
              markSynced();
              toast.success("Sync triggered (simulated)");
            }}
          >
            <RefreshCw className="h-4 w-4" /> Sync Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}