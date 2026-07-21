# Speed up mini-app refresh with caching

Today every refresh re-downloads ~100k+ consumption rows and recomputes league/baseload/validation results in the browser. We'll fix this in two phases.

## Phase 1 — Client-side cache (ship first)

Goal: refreshing any mini-app paints the last known dashboard instantly, then quietly revalidates.

- Add an IndexedDB-backed cache layer (via `idb-keyval`) keyed by `orgId` + dataset version.
- Persist on load:
  - Raw consumption rows (already paged in `data-store.tsx`)
  - Buildings, meters, schedules, org settings, meter registry
  - A `lastSyncedAt` timestamp and a max `updated_at` watermark per table
- On app boot: hydrate React state from IndexedDB synchronously → dashboards render immediately with cached numbers.
- In the background: fetch only rows newer than the watermark (`updated_at > lastSyncedAt`) and merge — no full re-download unless the cache is empty or schema version changed.
- Memoise expensive derived results (league aggregates, baseload scores, completeness reports) per `(orgId, utility, dateRange, dataVersion)` and store them in IndexedDB too, so switching tabs or refreshing skips recomputation until data changes.
- Invalidate cache on: sign-out, org switch to a new org, successful CSV import, scheduled ingestion run, or manual "Refresh data" button in the header.

Affected files: `src/lib/data-store.tsx` (hydration + revalidation), new `src/lib/cache/idb-cache.ts`, small hook wrappers in `src/lib/energy/{league,scoring,completeness}.ts` call sites.

## Phase 2 — Server-side precomputed aggregates (follow-up)

Goal: even a cold cache loads in <1s and scales past millions of rows.

- New tables:
  - `meter_daily_totals` (org_id, meter_name, building_id, utility, day, kwh, peak_kw, present_slots, expected_slots, out_of_hours_kwh)
  - `meter_monthly_totals` (same shape, month granularity)
  - `building_daily_totals` rollup view/materialisation for league table
- Populate via:
  - Trigger on `consumption_rows` insert/update/delete → upsert affected day rows (same pattern as `meter_registry_cache`).
  - Backfill migration for existing data.
- Rewrite League Table, Baseload, and Data Validation to query these small tables instead of scanning raw half-hourly rows. Meter Dashboard drilldown keeps using raw rows on demand only when the user opens a specific meter.
- Client cache from Phase 1 now stores tiny aggregate rows instead of the full raw dataset → refreshes become near-instant even on first load.

## Notes

- No UI changes beyond a small "Last synced Xm ago · Refresh" indicator in the AppShell header.
- No behaviour change to calculations — same functions, just fed pre-aggregated inputs.
- Phase 1 alone should remove the visible lag on refresh; Phase 2 removes it structurally as data grows.
