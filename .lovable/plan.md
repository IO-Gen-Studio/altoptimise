
# Sustainability Tracker

Turn the placeholder Sustainability app into a real one: Scope 1 & 2 computed from existing `consumption_rows`, plus a flexible Scope 3 module with presets, custom items, manual + CSV entry, and annual targets.

## 1. Emission factors

- Ship UK DEFRA 2024 defaults in `src/lib/energy/emission-factors.ts`:
  - Electricity: 0.20705 kgCO2e/kWh (Scope 2, location-based)
  - Natural gas: 0.18293 kgCO2e/kWh
  - Water supply: 0.149 kgCO2e/m³; treatment: 0.272 kgCO2e/m³
- Extend `organisations` with optional overrides (`carbon_factor_electricity`, `_gas`, `_water` already partially exist — reuse; add missing).
- Editable in `EditOrganisationDialog` under a "Carbon factors" section. Empty = use DEFRA default.

## 2. Scope 3 data model (new tables)

```text
sustainability_categories (seed: 15 GHG Protocol categories, read-only)
  id, code, name, scope (fixed = 3), sort_order

sustainability_items          -- the catalogue (presets + custom)
  id, organization_id (nullable = global preset), category_id,
  name, unit (e.g. km, kg, night, £), emission_factor (kgCO2e/unit),
  factor_source, is_preset, active, created_at, updated_at

sustainability_entries        -- logged data
  id, organization_id, item_id, entry_date, quantity, notes,
  created_by, created_at, updated_at

sustainability_targets        -- period targets
  id, organization_id, scope (1|2|3), category_id (nullable),
  period_start, period_end, target_tco2e, created_at, updated_at
```

RLS:
- `sustainability_items`: SELECT for members of org OR where `organization_id IS NULL` (presets); INSERT/UPDATE/DELETE via `can_manage_org` (Admin+).
- `sustainability_entries`: SELECT/INSERT for org members (all roles can log); UPDATE/DELETE own row, or Admin+ any.
- `sustainability_targets`: SELECT for org members; write via `can_manage_org`.
- Seed 15 Scope 3 categories + a starter set of presets (business travel car/rail/flight, hotel nights, waste-to-landfill, water, paper, etc.) with DEFRA factors in the same migration.

GRANTs to `authenticated` + `service_role` on every new table.

## 3. Server functions

`src/lib/sustainability.functions.ts` (uses `requireSupabaseAuth`):
- `listItems({ orgId })` — presets + org custom, active only.
- `upsertItem`, `deleteItem` — Admin+ (checked via `can_manage_org`).
- `listEntries({ orgId, from, to, categoryId? })`.
- `upsertEntry`, `deleteEntry`.
- `bulkImportEntries({ orgId, rows })` — CSV import path.
- `listTargets`, `upsertTarget`, `deleteTarget`.

## 4. Frontend

Rewrite `src/components/launcher/apps/SustainabilityApp.tsx` into tabbed layout:

**Overview**
- KPI cards: YTD total tCO2e, Scope 1, Scope 2, Scope 3, intensity (tCO2e / floor area or / £ if available — else omit), YoY change.
- Stacked bar: monthly emissions split by scope for last 12 months.
- Donut: Scope 3 breakdown by category.
- Target progress bars (current YTD vs target).

**Scope 1 & 2 (auto)**
- Sourced from `consumption_rows` × org factors. Table per utility with kWh/m³ → tCO2e, monthly rollup.

**Scope 3 log**
- Filter by category/date range. Table of entries with inline edit/delete. "Add entry" dialog: pick item → quantity → date → notes. Live tCO2e preview.
- "Import CSV" button: columns `date,item,quantity,notes`. Match `item` by name; unmatched rows shown for review; toast progress like existing CSV flow.
- All roles can add/edit their own entries; Admin+ can edit any.

**Catalogue** (Admin+ only, hidden for `user`)
- List presets (read-only, "Copy to custom" to override factor).
- Custom items CRUD: name, category, unit, emission factor, source.

**Targets** (Admin+ only)
- Set annual targets total or per category/scope. Shows on Overview.

## 5. Compute layer

`src/lib/energy/emissions.ts`:
- `computeScope12(consumptionRows, org, factors)` — reuse league aggregation; add tCO2e per period.
- `computeScope3(entries, items)` — sum `quantity * emission_factor` grouped by category/month.
- Memoised in the IndexedDB cache alongside league/baseload results, keyed on `(orgId, dataVersion, entriesVersion)`.

## 6. Launcher wiring

- `SustainabilityApp` already registered in `launcher-context.tsx` and routed via `/_authenticated/apps/$slug` — no routing changes.
- Update icon accent copy if needed; keep existing slug `sustainability`.

## Technical notes

- Preset seeding lives in the same migration that creates the tables (rule: schema + deterministic seeds together).
- Emission factors are numeric(12,6) to preserve DEFRA precision.
- CSV importer reuses the multi-file drag-drop pattern from `CsvIngestion.tsx` but scoped to entries; no building/meter mapping needed.
- All Scope 3 reads/writes go through `requireSupabaseAuth` server functions so RLS enforces org scoping.
- Client cache: extend `idb-cache.ts` payload with `sustainability` slice (items, entries, targets) hydrated on boot, refreshed in background.

## Out of scope for this pass

- Scope 3 supply-chain integrations (spend-based purchased goods calc) — leave as future work; the flexible item builder can still capture it manually.
- Assurance/audit export (PDF/CSV of full ledger) — easy follow-up once ledger exists.
