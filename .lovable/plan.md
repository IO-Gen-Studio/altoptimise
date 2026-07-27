## Overnight Water Sentinel & Leak Detector

A new mini-app in the launcher that reads the existing shared half-hourly dataset, isolates water meters, and finds meters that never drop to zero flow overnight — the classic signature of a continuous leak.

### Detection engine (new `src/lib/energy/water-sentinel.ts`)

- **Meter filter:** reuse `classifyUtility` to keep only `water` meters for the selected organisation; apply the effective meter factor and building assignment from the meter registry (same as other apps).
- **Overnight window:** derived per building from the resolved operational profile (org → building → system fallback, via `resolveProfile`). Default unoccupied window 23:00–05:30, plus all non-trading days (weekends/holidays counted fully unoccupied). Admins can override the default window in the app's settings panel.
- **Per meter per night** (window spans two calendar rows, handled by stitching consecutive `interval_date` rows):
  - minimum interval flow, total night volume (m³), and min hourly leak rate = `min interval m³ × 2`.
  - **Critical Persistent Leak** — flow never hits 0.00 across every overnight interval.
  - **Suspected Minor Leak** — flow stays above the sensitivity threshold (default 0.05 m³) for N consecutive intervals (default 3) but does reach zero at some point.
  - **Normal / Zero Flow** — otherwise.
  - **Data Incomplete** — missing intervals, all-null telemetry, or a fully zero/uncommissioned series; excluded from leak scoring and from KPI totals (shown separately).
- **Extrapolation & cost:** daily loss = min rate × window hours; monthly = daily × 30. Cost = volume × (water supply tariff + wastewater discharge rate). Supply tariff defaults to the org's `tariff_water_pence_per_m3` (falling back to £2.50/m³); wastewater rate is a new configurable value. Carbon waste uses the org water CO₂ factor.

### UI (`src/components/launcher/apps/WaterSentinelApp.tsx`)

- **KPI banner (3 cards):** Active Leaks Detected (count + red/amber badge), Estimated Overnight Water Lost (m³ for the period), Total Financial Impact (£ per night and per month).
- **Charting canvas:** combined bar + line chart of 30-minute water usage over a selectable 24/48-hour period for the chosen meter. Translucent dark blue-grey shading over the unoccupied window, persistent dashed red horizontal line at the minimum overnight baseline, and red-filled bars for overnight intervals above baseline.
- **Audit table:** Site/Building, Meter Reference, Min Overnight Flow (m³/hr), Total Night Volume (m³), Status badge, Estimated Cost Waste (£), Action Status (Open / Acknowledged / Dismissed + note). Sortable columns; filter buttons: All Sites, Active Leaks Only, High Waste (>1 m³/hr), plus Data Incomplete.
- Period selector reuses the existing preset control (last 7/30 days, MTD, custom).

### Role gating

- **Super Admin & Admin:** edit sensitivity threshold, consecutive-interval count, overnight window, water tariff and wastewater rate (persisted per organisation); acknowledge/dismiss alerts via a notes modal.
- **User (viewer):** read-only — KPIs, chart, and table visible; all controls disabled.

### Backend

New migration:
- `water_sentinel_settings` — per organisation: overnight window start/end, sensitivity threshold m³, consecutive intervals, wastewater rate p/m³.
- `water_leak_acknowledgements` — organisation, meter name, night/period date, status (`acknowledged` / `dismissed`), note, acknowledged_by, timestamps.
Both with grants, RLS via existing `can_access_org` (read) and `can_manage_org` (write) helpers, and `updated_at` triggers. Server functions in `src/lib/water-sentinel.functions.ts` for loading/saving settings and acknowledgements.

### Wiring

- Register the app in `APPS` (`src/lib/launcher-context.tsx`) as slug `water-sentinel` so it appears in the launcher grid, the Apps reorder panel, and the per-user app-access assignment in User Management.
- Render it from `src/routes/_authenticated/apps/$slug.tsx` alongside the other mini-apps.

### Technical notes

- All date maths stays UTC-based, consistent with the existing engine, so results don't shift by timezone.
- Detection runs client-side over the already-cached consumption state (IndexedDB) — no extra load on page refresh; results are memoised per organisation/period.
