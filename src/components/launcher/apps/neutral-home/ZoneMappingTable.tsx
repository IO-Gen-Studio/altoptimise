import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  setNhMeterCategoriesBulk,
  setNhMeterCategory,
} from "@/lib/neutral-home.functions";
import type { CategoryOption } from "@/lib/neutral-home/config";
import { KIND_LABEL, KIND_OPTIONS, type ClassMap, type CircuitKind } from "@/lib/neutral-home/zones";

interface Props {
  orgId: string;
  siteId: string;
  /** [circuit name, auto-detected sub-category] */
  circuits: [string, string][];
  classes: ClassMap;
  overrideOf: (name: string) => string;
  options: CategoryOption[];
  disabled: boolean;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}

/**
 * Classification editor: each circuit gets a Category (Zone / Equipment /
 * Other), an optional Sub-Category, and — for equipment — the zone it belongs
 * to. Supports bulk edits so large sites can be classified quickly.
 */
export function ZoneMappingTable({
  orgId,
  siteId,
  circuits,
  classes,
  overrideOf,
  options,
  disabled,
  run,
}: Props) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<CircuitKind | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const zones = useMemo(
    () =>
      circuits
        .map(([n]) => n)
        .filter((n) => (classes.get(n)?.kind ?? "other") === "zone")
        .sort((a, b) => a.localeCompare(b)),
    [circuits, classes],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return circuits.filter(([name]) => {
      const kind = classes.get(name)?.kind ?? "other";
      if (kindFilter !== "all" && kind !== kindFilter) return false;
      return !q || name.toLowerCase().includes(q);
    });
  }, [circuits, classes, kindFilter, query]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allShownSelected = rows.length > 0 && rows.every(([n]) => selected.has(n));

  const bulk = (patch: {
    kind?: CircuitKind;
    category?: string | null;
    zone_circuit_name?: string | null;
  }) =>
    run("Updating circuits…", async () => {
      await setNhMeterCategoriesBulk({
        data: {
          organization_id: orgId,
          site_id: siteId,
          circuit_names: Array.from(selected),
          ...patch,
        },
      });
      setSelected(new Set());
    });

  const single = (
    name: string,
    patch: { kind?: CircuitKind; category?: string | null; zone_circuit_name?: string | null },
  ) =>
    run("Updating circuit…", () =>
      setNhMeterCategory({
        data: {
          organization_id: orgId,
          site_id: siteId,
          circuit_name: name,
          ...patch,
        },
      }),
    );

  if (!circuits.length) {
    return <p className="text-sm text-muted-foreground">Upload a period for this site first.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Search</Label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter circuits"
            className="w-56"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Category filter</Label>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as CircuitKind | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline">{rows.length} shown</Badge>
        <Badge variant="outline">{zones.length} zones</Badge>
      </div>

      {selected.size ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="grid gap-1.5">
            <Label className="text-xs">Set category</Label>
            <Select value="" disabled={disabled} onValueChange={(v) => bulk({ kind: v as CircuitKind })}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Set sub-category</Label>
            <Select
              value=""
              disabled={disabled}
              onValueChange={(v) => bulk({ category: v === "auto" ? null : v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sub-category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Map to zone</Label>
            <Select
              value=""
              disabled={disabled || !zones.length}
              onValueChange={(v) =>
                bulk({ kind: "equipment", zone_circuit_name: v === "none" ? null : v })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={zones.length ? "Zone" : "No zones yet"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <ScrollArea className="h-[420px] rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allShownSelected}
                  aria-label="Select all shown circuits"
                  onCheckedChange={(v) =>
                    setSelected(v ? new Set(rows.map(([n]) => n)) : new Set())
                  }
                />
              </th>
              <th className="px-3 py-2 font-medium">Meter / circuit</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Sub-category</th>
              <th className="px-3 py-2 font-medium">Zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, autoCat]) => {
              const cls = classes.get(name);
              const kind = cls?.kind ?? "other";
              const override = overrideOf(name);
              return (
                <tr key={name} className="border-t">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(name)}
                      aria-label={`Select ${name}`}
                      onCheckedChange={() => toggle(name)}
                    />
                  </td>
                  <td className="px-3 py-2">{name}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={kind}
                      disabled={disabled}
                      onValueChange={(v) => single(name, { kind: v as CircuitKind })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KIND_OPTIONS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {KIND_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={override || "auto"}
                      disabled={disabled}
                      onValueChange={(v) => single(name, { category: v === "auto" ? null : v })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto ({autoCat})</SelectItem>
                        {options.map((o) => (
                          <SelectItem key={o.code} value={o.code}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    {kind === "equipment" ? (
                      <Select
                        value={cls?.zone ?? "none"}
                        disabled={disabled || !zones.length}
                        onValueChange={(v) =>
                          single(name, { zone_circuit_name: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder={zones.length ? "Zone" : "No zones yet"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {zones.map((z) => (
                            <SelectItem key={z} value={z}>
                              {z}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : kind === "zone" ? (
                      <span className="text-xs text-muted-foreground">Zone itself</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
