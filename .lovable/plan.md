# Cloud usage optimisation plan

## What the data shows (measured, not guessed)

- `consumption_rows` holds **189,971 rows / 222 MB** (Jan 2025 - Aug 2026, 2 organisations). Total database size is 318.9 MB, disk only 8% used — **storage is not the problem, traffic is**.
- The single biggest cost driver: the browser downloads the **entire** `consumption_rows` table on every session. The keyset-paginated query has run **202,500 times** for a combined **117,237 seconds (32.5 hours)** of database time, mean 579 ms per call. Two more variants of the same full-table read add another ~1.5 hours.
- Second driver: `neutral_home_room_hours` full-period reads — 4,724 calls, ~1.1 hours of DB time, one variant averaging **4.5 seconds** per call.
- Housekeeping waste: `energy_price_sync_log` has **21,195 rows** and grows forever (price cron runs every 30 min × 4 products × each region); `energy_unit_rates` holds **25,692 rows / 10 MB** of mostly historical half-hourly prices.

So the credits go on compute hours + egress from re-reading a 222 MB table client-side, not on stored gigabytes.

## The fix, in priority order

### 1. Stop shipping the whole consumption table to the browser
Replace the "load everything into React state" model with server-side aggregation:

- Add Postgres aggregate functions (called through server functions) that return **only what each mini-app charts**: daily/meter totals, day-night splits, baseload percentiles, league-table rollups, validation flags. These return hundreds of rows instead of ~190,000.
- Each mini-app (Baseload, League Table, Data Validation, Sustainability, Water Sentinel, Agile Pricing, Meter Dashboard) switches to its own scoped query with an organisation + date-range filter, cached by TanStack Query.
- Raw half-hourly rows are fetched only for the single meter/date window a user actually opens.

### 2. Make the cache authoritative instead of re-downloading
- Keep the IndexedDB cache, but revalidate with a cheap `max(updated_at)` watermark per organisation and fetch **only rows changed since** the cached watermark, instead of the current row-count probe followed by a full re-download.
- Requires an `updated_at` column (with trigger) on `consumption_rows` if not already reliable.

### 3. Index the access paths the new queries use
- `(organization_id, interval_date)`, `(organization_id, meter_name, interval_date)` on `consumption_rows`.
- `(period_id, hour_ts)` on `neutral_home_room_hours`.
This turns the current sequential scans into index scans and cuts per-call time sharply.

### 4. Aggregate the temperature reads
- Roll `neutral_home_room_hours` up to per-room-per-day in SQL for the dashboard views; keep hourly rows only for the heatmap of the selected zone/month.

### 5. Retention and cron hygiene (storage + write volume)
- Trim `energy_price_sync_log` to the last 14 days, and log only failures plus one daily success summary.
- Keep `energy_unit_rates` for a rolling window (e.g. 120 days) and drop older rates; the pricing app never charts beyond that.
- Reduce the Agile price sync from every 30 minutes to hourly (with one extra run in the 16:00-18:00 UK window where the day-ahead prices publish). Same freshness, roughly a third of the writes.
- Reclaim space with a `VACUUM`/reindex pass after the pruning migration.

### 6. Guardrails so it does not regress
- Lint-level rule of thumb documented in `AGENTS.md`: no unbounded `select("*")` against `consumption_rows` or `neutral_home_room_hours` from client code.
- A small "data volume" note in Settings showing row counts and last sync, so growth is visible.

## Expected outcome

- Per-session database work for a dashboard load drops from ~190 paginated full-table calls to a handful of aggregate calls — the dominant credit consumer falls by well over 95%.
- Dashboards get faster as a side effect (no 190-page stream before charts settle).
- Stored data shrinks modestly (logs and old prices), while the disk stays comfortably under-used.

## Technical notes

- Aggregations live in SQL functions (`security invoker`, org-scoped so RLS still applies) exposed via `createServerFn`; no service-role reads for ordinary dashboard queries.
- Migrations: new indexes, `updated_at` + trigger on `consumption_rows`, retention deletes, cron reschedule.
- Client changes are confined to `src/lib/data-store.tsx` (incremental sync, no full load), the `src/lib/energy/*` analytics helpers (accept pre-aggregated inputs), and each mini-app's data hook.
- No change to CSV upload/ingestion behaviour, merge/replace semantics, or any existing dashboard visual.

## Suggested sequencing

1. Indexes + retention + cron reschedule (immediate, low-risk credit reduction).
2. Aggregate SQL functions and server functions.
3. Migrate mini-apps one at a time onto scoped queries, verifying numbers match the current dashboards.
4. Switch `data-store` to watermark-based incremental sync and remove the full-table fetch.
