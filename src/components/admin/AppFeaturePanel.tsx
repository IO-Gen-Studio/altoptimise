import { Power, PowerOff } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { FEATURES, useAppFeatures } from "@/lib/app-features";
import { useLauncher } from "@/lib/launcher-context";

export function AppFeaturePanel() {
  const { isSuperAdmin } = useLauncher();
  const { isEnabled, setEnabled, isLoading, isSaving } = useAppFeatures();

  if (!isSuperAdmin) return null;

  const onToggle = async (key: string, name: string, next: boolean) => {
    try {
      await setEnabled(key, next);
      toast.success(next ? `${name} activated` : `${name} deactivated`);
    } catch {
      toast.error("Couldn't save that change. Please try again.");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Power className="h-4 w-4 text-primary" /> Activate or deactivate apps
          </h2>
          <p className="text-xs text-muted-foreground">
            Applies to everyone. A deactivated app stops running in the background and stops
            using cloud usage until you switch it back on.
          </p>
        </div>

        <ul className="divide-y rounded-md border">
          {FEATURES.map((f) => {
            const on = isEnabled(f.key);
            return (
              <li key={f.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className={on ? "" : "opacity-60"}>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {f.name}
                    {!on && (
                      <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <PowerOff className="h-3 w-3" /> Deactivated
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{f.detail}</div>
                </div>
                <Switch
                  checked={on}
                  disabled={isLoading || isSaving}
                  onCheckedChange={(next) => void onToggle(f.key, f.name, next)}
                  aria-label={on ? `Deactivate ${f.name}` : `Activate ${f.name}`}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
