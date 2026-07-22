import { ArrowDown, ArrowUp, LayoutGrid, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APPS } from "@/lib/launcher-context";
import { useAppOrder } from "@/lib/app-order";

export function AppOrderPanel() {
  const { orderedApps, setOrder } = useAppOrder();

  const move = (idx: number, dir: -1 | 1) => {
    const next = orderedApps.map((a) => a.id);
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <LayoutGrid className="h-4 w-4 text-primary" /> App grid order
            </h2>
            <p className="text-xs text-muted-foreground">
              Rearrange how mini-apps appear on the launcher home screen. Order is saved on this device.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setOrder(APPS.map((a) => a.id))}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>

        <ul className="divide-y rounded-md border">
          {orderedApps.map((app, idx) => (
            <li key={app.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <div>
                  <div className="text-sm font-medium">{app.name}</div>
                  <div className="text-xs text-muted-foreground">{app.category} · {app.tagline}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx === 0} onClick={() => move(idx, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx === orderedApps.length - 1} onClick={() => move(idx, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}