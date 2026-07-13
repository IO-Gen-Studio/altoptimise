
## Rename

- Launcher entry (`src/lib/launcher-context.tsx`): id/slug → `data-validation`, name → "Data Validation Engine", updated description. Keep `data-completeness` as an alias slug so existing links still resolve.
- `src/routes/_authenticated/apps/$slug.tsx`: match both `data-validation` and `data-completeness`.
- `DataCompletenessApp.tsx` → `DataValidationApp.tsx` (component renamed, header + copy updated). Old file removed.
- Building drill-down link (BuildingsPanel "Open dashboard" if present) points to `/apps/data-validation?building=<id>`.

No DB/schema changes.

## Validation engine additions (`src/lib/energy/completeness.ts` → keep filename, extend API)

Extend `CompletenessResult` with new fields (all optional so existing consumers keep working):

```
integrity: "ok" | "spike" | "drop" | "insufficient_history"
integrityDeltaPct: number         // signed % vs 4-week same-DOW baseline
integrityBaselineKwh: number
integrityTodayKwh: number
stagnation: "ok" | "offline" | "stuck_value"
stagnationHours: number           // longest 0-run during active hours (elec/water)
stuckValueHours: number           // longest run of identical non-zero value (elec/water)
offlineEventCount: number         // historical offline events in window
```

Rules implemented:

1. **Structural** — unchanged (>10% missing → `incomplete`).
2. **Statistical integrity (Spike/Drop)** — for the most recent complete day in the window:
   - Baseline = mean of totals on the same weekday for the previous 4 occurrences that ALSO pass structural completeness AND (for holiday-park/evening_peak profiles) fall in the same peak-vs-off-peak season as today, per `isPeakSeason`.
   - Need ≥3 baseline days; otherwise `insufficient_history`.
   - Flag `spike` when today > baseline × 1.30, `drop` when today < baseline × 0.70.
   - Skip entirely for utility === "gas" during `summerGasMonths`.
3. **Stagnation** — electricity + water only:
   - `offline`: ≥24h continuous absolute 0 during active hours (reuses existing active-hour longest-zero logic; threshold raised to 24h and decoupled from `completeness_flatline_hours`).
   - `stuck_value`: ≥12 consecutive intervals with identical non-zero value (any hour).
   - `offlineEventCount`: count of distinct ≥24h zero runs across the full history of the meter (not just current window).
   - Gas: always `ok` for stagnation.
4. Existing status precedence stays: structural `incomplete` → `telemetry_offline` (now driven by `stagnation !== "ok"`) → `ok`. Integrity is reported alongside status, not as the top-level status.

## Grid updates (`DataValidationApp.tsx`)

New columns (sortable):
- **Integrity** — badge (OK / Spike +Δ% / Drop −Δ% / — insufficient history). Grey neutral warning icon per spec.
- **Offline events** — count from `offlineEventCount`.
- Existing "Longest flatline" relabelled "Longest 0-run (active hrs)".
- Existing "Status" merges structural + stagnation.

Grouping/filters unchanged. Tooltip on Integrity badge shows today vs baseline kWh and which weekday/season it compared against.

## Buildings list warning icon

`BuildingsPanel` (and any building list in the launcher grid): a `useBuildingIntegritySummary(buildingId)` helper in `src/lib/data-store.tsx` runs the new engine across the building's meters and returns whether any triggered `spike`/`drop`/`offline`/`stuck_value`. Show a grey `AlertTriangle` icon + tooltip ("Variance Alert: Unexpectedly Low/High Consumption Detected" / "Meter Offline"). Neutral grey styling (`text-muted-foreground`) — not red/amber, per spec.

## Meter dashboard visuals (`MeterDashboard.tsx`)

- New "Data Validation" card next to existing completeness card showing: structural status, integrity badge with today vs 4-week baseline (with a small sparkline of the last ~8 same-DOW totals highlighting today), stagnation status, and offline-event counter.
- On the daily-totals bar chart: overlay a dashed line at the 4-week same-DOW baseline and colour today's bar grey with a warning glyph when spike/drop fires.
- On the HH profile chart: shade any ≥24h zero window (during active hours) grey and annotate "Offline".

## Out of scope

- No changes to Baseload scoring, CSV ingestion, meter overrides, or auth.
- No new DB tables; offline-event counter is computed on the fly from `consumption` state.
