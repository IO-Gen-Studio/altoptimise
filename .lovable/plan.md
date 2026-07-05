# Edit Building modal — plan

Enhance the Buildings admin panel so clicking any building row opens a tabbed edit modal with three tabs: Building Information, Meter List, and Schedules.

## 1. Data model additions (`src/lib/data-store.tsx`)

Extend the store so edits persist to `localStorage` alongside existing state.

- `Building` gains an optional `address?: string` (physical address / description).
- New type `Schedule`:
  ```
  { id, building_id, name, days: Weekday[], from: "HH:mm", to: "HH:mm", created_at }
  ```
  where `Weekday = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"`.
- New state slice `schedules: Schedule[]`.
- New context actions:
  - `updateBuilding(id, patch)` — already exists; used by tab 1.
  - `addSchedule`, `updateSchedule`, `deleteSchedule`.
  - `bulkAddSchedules` — used by the "copy hours to multiple days" flow (creates one schedule per selected target day, reusing name + times).
- New selector hook `useSchedules(buildingId)` returning the building's schedules, sorted by day + start time. Exported so analytics mini-apps can query globally via `useDataStore()`.
- Meter re-routing already supported by `upsertMeterOverride` (writes `assigned_building_id` and reconciles historical + future rows); tab 2 reuses it directly — this is the required MeterOverrides lock-in.

## 2. New component: `src/components/admin/EditBuildingDialog.tsx`

Controlled `Dialog` opened from `BuildingsPanel`. Props: `{ building, open, onOpenChange }`. Title: `Edit Building: {custom_display_name}`. Uses `Tabs` with three panels.

### Tab 1 — Building Information
Local form state seeded from `building`. Fields:
- Custom Display Name (`Input`)
- CSV Matched Name (`Input`, monospace hint reused from panel)
- Physical Address / Description (`Textarea`)

"Save Changes" button calls `updateBuilding(id, patch)`, toasts success, keeps dialog open.

### Tab 2 — Meter List
Derives meters for this building from `useMeterRegistry(orgId)` filtered by `effective_building_id === building.id`. Table columns: Raw Meter Name, Custom Display Name (fallback em-dash), Utility Category (Badge), Actions.

Actions column: "Move Meter" button opens a `Popover` (or inline `Select`) listing all other buildings in the org. Selecting a target calls `upsertMeterOverride` with `assigned_building_id = target.id`, preserving existing `custom_display_name` and `calibrated_meter_factor` from the registry row. Toast shows `Moved N historical rows to {target}`. Empty state row when no meters routed here.

### Tab 3 — Schedules (Operational Profiles)
Two areas:

**Constructor form** (top): Name (`Input`), Day badges (toggleable `Mon Tue Wed Thu Fri Sat Sun`, multi-select), From time (`Input type="time"`), To time (`Input type="time"`). "Add schedule" button validates non-empty name + ≥1 day + `from < to`, then calls `bulkAddSchedules` — one entry per selected day sharing the same name/times. This is the multi-day copy mechanism (pick multiple day badges → one rule per day).

**Saved list** (below): grouped visually by rule name. Each row shows day badge(s), `from – to`, edit (pencil) + delete (trash) icons.
- Edit puts the row's values back into the constructor in "edit mode" (Save/Cancel replace Add).
- Delete removes just that schedule row.

An additional per-rule "Copy to days…" button opens a small `Popover` with day checkboxes → `bulkAddSchedules` clones the times to the newly selected days. Covers the "copy hours from day to multiple days" requirement post-hoc as well as at creation.

## 3. `BuildingsPanel.tsx` wiring
- Make each `TableRow` clickable (`cursor-pointer`, `onClick` → open dialog for that building). Stop propagation on the existing delete-icon cell so row click doesn't fire when deleting.
- Track `editing: Building | null` state and render `<EditBuildingDialog />` once at panel level.

## 4. Out of scope
- No changes to CSV ingestion, meter override dialog, or organisations panel.
- No new routes; everything lives inside the existing Admin → Buildings tab.
- Schedules are stored client-side (localStorage) consistent with the rest of the store; analytics apps can already read via `useDataStore().state.schedules`.

## Technical notes
- Reuse existing shadcn primitives: `Dialog`, `Tabs`, `Table`, `Popover`, `Select`, `Button`, `Input`, `Textarea`, `Label`, `Badge`, plus `sonner` `toast` (already in the project). No new dependencies.
- Day badges implemented with `Toggle`/`Button` variants — no new component needed.
- Time inputs use native `<input type="time">` for 24h HH:mm — already the browser default in the app's locale.
- All new state flows through `DataStoreProvider`, so persistence and SSR-safe hydration behave identically to organisations/buildings/meters.
