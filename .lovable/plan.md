# Meter Registry + Non-Destructive Reconciliation Layer

Extend the existing admin engine with a **Meter Overrides** persistence layer, a **Meter Registry** management screen, and a **reconciliation pipeline** so user-edited meter names, building assignments, and calibration factors survive every future CSV upload.

The Organisations, Buildings, and CSV upload surfaces already exist and stay as-is — this pass adds the meter layer on top and rewires ingestion to consult it.

## 1. Data layer additions (`src/lib/data-store.tsx`)

New table + hook, matching a Supabase-shaped row:

```text
meter_overrides (
  raw_meter_name        TEXT PK,       -- exact CSV "Meters.Name"
  organization_id       UUID FK,       -- scopes the override
  custom_display_name   TEXT,          -- user-defined friendly label
  assigned_building_id  UUID FK NULL,  -- permanent building reassignment
  calibrated_meter_factor NUMERIC NULL,-- override for Meters.Meterfactor
  updated_at            TIMESTAMPTZ
)
```

Hook: `useMeterOverrides(orgId?)` → `{ overrides, upsertOverride, deleteOverride, getOverride(rawName) }`. Persisted alongside existing state under `optimise:store:v1` (bump nothing — additive field).

Derived selector `useMeterRegistry(orgId)` returns one row per unique `raw_meter_name` seen in `consumption` for that org, joined with its override (if any) and its currently-effective building. Shape:

```ts
{ raw_meter_name, utility_category, custom_display_name, effective_building_id, effective_building_name, effective_meter_factor, has_override }
```

## 2. Reconciliation pipeline (`src/lib/csv-parser.ts` → `pivotRows`)

Rewrite `pivotRows` to accept `overrides: MeterOverride[]` and apply this per-row pipeline:

1. Read `raw = row["Meters.Name"]`.
2. Look up `override = overridesByRaw.get(raw)`.
3. If found:
   - `building_id = override.assigned_building_id` (ignore CSV `OrganizationalUnits.Name`).
   - `meter_factor = override.calibrated_meter_factor ?? Number(row["Meters.Meterfactor"])`.
   - Store `override.custom_display_name` as the display name on the consumption row (new optional field `meter_display_name`).
4. If not found: existing fallback — match `OrganizationalUnits.Name` → `buildings.csv_matched_name`, use CSV `Meters.Meterfactor`, leave display name null (registry will show raw name).

`CsvIngestion.confirmImport` passes `overrides` into `pivotRows`. The match summary panel additionally shows an "N meter override(s) applied" badge computed from the row set.

## 3. Meter Registry screen (new tab under `/admin`)

Add a fourth tab **"Meters"** in `src/routes/admin.tsx` with a new component `src/components/admin/MeterRegistryPanel.tsx`.

Layout:
- Org picker at top (mirrors Buildings tab).
- Search input filtering by raw name / display name.
- Data table columns: **Raw Meter Name** (mono), **Custom Display Name**, **Utility Category** (badge), **Assigned Building** (name), **Meter Factor** (numeric, shows override in bold + tiny "was X" if changed), **Actions** (Edit).
- Empty state: "No meters discovered yet — upload a CSV in the Data Update tab."

Edit dialog (`MeterOverrideDialog`):
- **Custom display name** — free text.
- **Assigned building** — Select populated with all buildings in the active org (cross-building mobility).
- **Calibrated meter factor** — numeric input with amber inline warning: *"Altering this factor permanently scales all calculated metrics for this meter."*
- **Reset to CSV defaults** button (deletes the override row).
- Save calls `upsertOverride({...})`, then triggers a one-shot **re-reconciliation** of existing consumption rows for that `raw_meter_name` in this org (updates `building_id`, `meter_factor`, `meter_display_name` on the already-imported rows so historical charts reflect the move immediately). Toast: *"Meter reassigned — N historical records updated."*

## 4. Wiring

- `admin.tsx` gains the `<TabsTrigger value="meters">Meters</TabsTrigger>` + `<TabsContent>` block.
- `ConsumptionRow` type gains optional `meter_display_name?: string | null`.
- Existing mini-apps that read consumption keep working; they can opt-in to `meter_display_name ?? meter_name` when displaying labels (out of scope for this plan — no mini-app UI changes here).

## Technical notes

- Pure client mock, same `localStorage` store. Schema mirrors Supabase 1:1 so a later Cloud enablement is a hook-body swap.
- `raw_meter_name` is treated as globally unique in this prototype; scoping is by `organization_id` filter in the hook (matches how real RLS would apply).
- Re-reconciliation on override save is O(consumption rows for that raw name) — fine for prototype volumes; documented as a `pg_notify` / server job in the production port.
- No backend, no new deps, no design tokens — reuses shadcn `Dialog`, `Table`, `Select`, `Input`, `Badge`.

## Files

- edit `src/lib/data-store.tsx` — add `MeterOverride` type, state slice, `useMeterOverrides`, `useMeterRegistry`, `meter_display_name` on `ConsumptionRow`, re-reconcile action.
- edit `src/lib/csv-parser.ts` — extend `pivotRows` signature to accept overrides + apply pipeline.
- edit `src/components/admin/CsvIngestion.tsx` — pass overrides into `pivotRows`, surface applied-override count.
- add `src/components/admin/MeterRegistryPanel.tsx`.
- add `src/components/admin/MeterOverrideDialog.tsx`.
- edit `src/routes/admin.tsx` — add "Meters" tab.
