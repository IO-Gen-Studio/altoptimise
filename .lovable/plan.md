# Data Infrastructure & Organisation Administration Engine

Build a client-side mock of the multi-tenant data platform (organisations, buildings, consumption data), plus an Admin Settings area with CSV ingestion and scheduling. All state lives in a mock store (localStorage-backed) mirroring a Supabase/PostgreSQL schema — no backend required for this prototype pass. Cloud can be enabled later without changing the UI shape.

## 1. Data layer (mock store, Supabase-shaped)

New module `src/lib/data-store.ts` — a typed in-memory + localStorage store exposing hooks:

- `useOrganisations()` — list/create/update/delete
- `useBuildings(orgId)` — list/create/update/delete
- `useConsumptionData(filters)` — list/insert (bulk)
- `useSchemaLabels()` — global display-name overrides for CSV structural fields
- `useIngestionSettings()` — schedule time, last sync timestamp
- `useDataActions()` — `ingestCsv(file, orgId)`, `syncNow()`

Tables (TypeScript types matching Postgres columns):

```text
organisations         (id, organization_name, created_at)
buildings             (id, organization_id, custom_display_name, csv_matched_name, created_at)
consumption_data      (id, organization_id, building_id|null,
                       original_org_unit_name, meter_name, meter_factor,
                       variable_code, variable_name, variable_category,
                       interval_date, half_hourly_values: number[48])
schema_labels         (field_key, display_name)   e.g. "Variables.Category" → "Utility Type"
ingestion_settings    (id=singleton, scheduled_time "HH:mm", last_synced_at)
```

The existing `ORGS` constant in `launcher-context.tsx` becomes a seed for the store; `LauncherProvider` reads live orgs from `useOrganisations()` so the navbar switcher updates instantly when admins add one.

## 2. Admin Settings route

New route `src/routes/admin.tsx` (accessible only to `super_admin`; other roles see a "no access" panel). Uses `AppShell` for consistent chrome. Three tabs via `Tabs`:

**a. Organisations** — data grid of organisations with "Add Organisation" dialog (name field). Row actions: rename, delete (with confirm). New rows appear immediately in the top navbar org switcher.

**b. Buildings / Assets** — org picker at top; grid of buildings for the selected org. "Add Building" dialog with `custom_display_name` and `csv_matched_name` (with helper text: "exact string from CSV OrganizationalUnits.Name"). Edit/delete actions. Shows a small "linked CSV rows: N" count per building.

**c. Data Update Dashboard** — the ingestion panel (below).

## 3. CSV Ingestion Panel

Component `src/components/admin/CsvIngestion.tsx`:

- **Organisation selector** (required) — must be chosen before parsing.
- **Drag-and-drop uploader** (native input + drop zone; parse with `papaparse` — add via `bun add papaparse @types/papaparse`).
- **Preview grid** — first ~20 rows in a `Table`, using the multi-column half-hourly layout (fixed left columns: OrganizationalUnits.Name, Meters.Name, Variables.Category, …; scrollable timestamp columns).
- **Match summary** — for each unique `OrganizationalUnits.Name`, show ✓ matched building (via `csv_matched_name`) or ⚠ unmatched with a quick "Create building from this name" shortcut.
- **Confirm import** — pivots each row into `consumption_data` rows keyed by `interval_date`, storing the 48 half-hourly values as a `number[]`. Sets `last_synced_at`.
- **Schema label editor** — table of detected structural fields (`OrganizationalUnits.Name`, `Meters.Name`, `Meters.Meterfactor`, `Variables.Code`, `Variables.Name`, `Variables.Category`) with editable "Display name" inputs → written to `schema_labels`. Mini-apps read via `useSchemaLabels()` so renaming "Variables.Category" → "Utility Type" propagates everywhere.

**Scheduler section:**

- Time input (`<input type="time">`) defaulting to `10:00`, persisted to `ingestion_settings.scheduled_time`.
- "Last Successfully Updated" timestamp display (relative + absolute).
- **Sync Now** button — simulates a fetch by re-running the last ingestion (or shows a toast "no source configured" if none). In this prototype the "automated link" is a placeholder URL field; actual scheduling is documented as "runs server-side once Cloud is enabled".

## 4. Navigation & access

- Add "Admin Settings" link in `AppShell` header (visible only to `super_admin`).
- Route guards in `admin.tsx` render a friendly denied state for other roles.
- The launcher home (`/`) continues to work unchanged; org switcher now sources from the store.

## Technical notes

- No Lovable Cloud enable in this pass — pure client mock so the prototype stays self-contained. The store's shape mirrors Supabase tables 1:1 so wiring real Postgres later is a drop-in swap of the hooks' internals.
- CSV parsing: `papaparse` streaming with header row; timestamp columns detected by regex `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$` and grouped by date into 48-slot arrays (missing slots → `null`).
- Persistence: `localStorage` under `optimise:store:v1` with a version key for future migrations.
- All new UI uses existing shadcn primitives (Tabs, Dialog, Table, Input, Button, Select, Badge, Card) — no new design tokens.

## Files to add / edit

- add `src/lib/data-store.ts` (types, store, hooks)
- add `src/lib/csv-parser.ts` (parse + pivot helpers)
- add `src/routes/admin.tsx` (tabbed admin shell + guard)
- add `src/components/admin/OrganisationsPanel.tsx`
- add `src/components/admin/BuildingsPanel.tsx`
- add `src/components/admin/CsvIngestion.tsx`
- add `src/components/admin/SchemaLabelsEditor.tsx`
- add `src/components/admin/ScheduleSettings.tsx`
- edit `src/lib/launcher-context.tsx` (source orgs from store; keep personas)
- edit `src/components/launcher/AppShell.tsx` (Admin Settings nav link for super_admin)
- edit `package.json` (`papaparse`, `@types/papaparse`)
