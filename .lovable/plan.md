## Goal
Turn the Data Completeness grid into a drill-down energy dashboard **per meter**, and tighten the completeness calculation so newly onboarded meters aren't unfairly flagged.

## 1. Completeness engine — per-meter accuracy
Update `src/lib/energy/completeness.ts`:
- Add optional `firstSeen: string` (YYYY-MM-DD) argument. When present, clamp the expected window to `max(start, firstSeen)`.
- `checkCompleteness()` continues to return `{ status, missingPct, longestFlatlineHours, reason, expectedSlots, presentSlots }` but now with the clamped denominator.
- Fix a minor bug: current flatline detection treats `0` as "offline" — many real meters legitimately record `0` overnight. Change to: flatline = run of `0` **during active hours only** (uses `isActiveSlot` from `profile.ts`). Keep the summer-gas exemption.

## 2. Grid becomes per-meter (replaces current building×utility aggregation)
Rewrite `src/components/launcher/apps/DataCompletenessApp.tsx`:
- Row = one meter (using `MeterRegistryRow` from data-store; already keyed by `raw_meter_name`).
- Columns: Building, Meter (display name or raw), Utility, Rows, First seen, Last seen, Coverage %, Longest flatline, Status.
- Sortable columns (click header to toggle asc/desc). Simple local `useState` sort key + direction.
- Filter: building select (All / specific) + utility select + the existing 7/30/90 window.
- Clicking a row (or a building group header) opens the meter dashboard (see §3).
- Group-by-building toggle: when on, render collapsible sections per building with a small summary chip (n meters, worst status).

## 3. Meter energy dashboard (drill-down)
New file `src/components/launcher/apps/MeterDashboard.tsx`, rendered inline in the Data Completeness app when a meter is selected (state-driven; no new route needed — back button returns to grid).

Shows for the selected window:
- **Header**: building, meter, utility, meter factor, first/last seen, effective schedule badge (reuses `resolveProfile` + `inheritanceLabel`).
- **Completeness card**: coverage %, missing intervals, longest flatline, status badge, reason text.
- **HH profile chart**: average kWh per half-hour slot (0..47), line chart. Overlay the active-hours band from the resolved profile.
- **Daily totals chart**: bar chart of daily kWh across the window; missing days rendered as gaps.
- **Weekly pattern chart**: average kWh by weekday × slot heatmap (7×48 grid via CSS grid + colour scale from `hsl(var(--primary))` at varying alpha — no new dep).
- All charts use existing `recharts` (already in project) except the heatmap which is a lightweight CSS grid.

## 4. Data-store helper
Add to `src/lib/data-store.tsx`:
- `useMeterSeries(rawMeterName, buildingId, start, end)` → `{ rows, firstSeen, lastSeen, dailyTotals, hhAverage, weekdayHeatmap }` computed with `useMemo` from existing `consumption` state (no new fetch).
- `useBuildingMeters(buildingId)` → list of `MeterRegistryRow` scoped to the building (filtering the existing registry).

## 5. Building drill-down entry point
When "Group by building" is on, clicking a building header expands its meter list. Clicking a meter opens §3. Also add a small "Open dashboard" button in the existing `BuildingsPanel` row → navigates to `/apps/data-completeness?building=<id>` (URL search param read on mount to auto-open that building's group).

## Out of scope
- No schema/migration changes.
- No changes to CSV ingestion, meter overrides, or auth.
- BaseloadApp untouched.

## Technical notes
- All charts client-side from already-loaded `consumption` rows — no server work.
- First-seen = `min(interval_date)` across the meter's rows in the full dataset (not the window), so re-selecting a shorter window still shows the true onboarding date.
- Sorting: stable sort with `Array.prototype.toSorted` (Node ≥20, supported by the target).
- Files touched: `completeness.ts` (edit), `DataCompletenessApp.tsx` (rewrite), `data-store.tsx` (add hooks), new `MeterDashboard.tsx`.
