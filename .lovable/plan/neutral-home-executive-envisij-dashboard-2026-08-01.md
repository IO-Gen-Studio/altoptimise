# Neutral Home — Executive Envisij Dashboard

A new mini-app in the launcher with two tabs: **Dashboard** and **Settings**. Anyone with access to the app sees both tabs. It is fully self-contained: its own site list, its own uploads, its own stored periods — nothing changes in Admin Settings or the other mini-apps.

## Settings tab

1. **Sites** — create/edit/delete Neutral Home sites (name, optional notes, floor area m² and occupancy stored for reference only). Sites are scoped to the currently selected organisation. - include a field for address & postcode. Later on I want to use postcode for HDD
2. **Upload drawer (per site)** — a dual drag-and-drop zone taking both Envisij exports at once (.xlsx or .csv):
  - Slot 1: Headline Usage Report - allow for multiple upload. Option for fully replaced uploaded file or merged with existing.
  - Slot 2: Day/Night Group Overview Report - - allow for multiple upload. Option for fully replaced uploaded file or merged with existing.
3. **Stored periods** — list of everything ingested for the site (label, date range, circuit count, uploaded at), with delete and re-upload.

### Parsing rules

- Metadata rows above the header row are skipped automatically by scanning for the header row (`Project Groups` / `Date/Time`), so the differing row offsets between the two reports are handled.
- Date range is read from the header strings (`From: 1st July, 2026 00:00:00`, `Selected Date Range from:`) and normalised into a period start/end. The period label is derived from it (e.g. "Jul 2026").
- Join key is column A (circuit/group name), trimmed and case-insensitive.
- Headline columns ingested as published: Total Usage kWh, Total CO₂ kg, Blended/Day/Night Cost p/kWh, Total Cost p, and the intensity columns (kWh/person, kWh/m², p/person, p/m², kg/person, kg/m²) — taken straight from the file, no recomputation.
- Day/Night columns parsed from the `1,234.56 kWh (78.90%)` strings into kWh plus percentage for Day, Night and Total.
- Validation panel before commit: circuit counts per file, rows present in one file but not the other, missing required columns, unparseable date range. Blocking errors and warnings are shown separately; the user confirms before saving.
- Circuit categorisation is inferred from the name (HVAC, AHU, Heating/Storage Heater, Kitchen, Lighting/Small Power, EV Charging, PV/Export, Totals, Other). Total/aggregate rows (e.g. "SMH Load Total", "Total Site PV", "Total PV L1") are tagged as aggregates and excluded from circuit-level charts and leaderboards so they don't double-count.

## Dashboard tab

Filters across the top: Site, Period, comparison Period, and circuit category.

**A. KPI header cards** — Total consumption kWh (with variance badge vs. the comparison period), Day/Night split as a proportional bar with each side's kWh, Total operational cost in £ (pence converted), Carbon footprint in kg/tCO₂e, and average blended cost p/kWh.

**B. Period comparison engine** — pick any two stored periods for the site. Cards plus a table showing % variance in total kWh, day/night ratio shift, cost and CO₂, colour-coded green for reductions and red for increases.

**C. Day/Night load & waste analyzer**

- Stacked horizontal bars of Day vs Night kWh per circuit, sorted by total.
- Circuits with night share above 20% are flagged, with stronger emphasis on non-essential categories (offices, HVAC, storage heaters, storage/retail).
- Tariff shift simulator: slider (0–20%) moving Day usage to the Night rate, showing modelled £ saving using the period's Day and Night p/kWh. Where the file carries no Day/Night rates, the app says so and lets you enter rates manually for the simulation.

**D. Intensity & efficiency leaderboard** — sortable table by kWh, kWh/m², p/m², kg/m² and night share, with quick category filter chips.

**Export** — "Export merged CSV" produces the joined headline + day/night dataset for the selected site and period. PDF summary is deferred to a follow-up.

## Technical notes

- New tables, all org-scoped with RLS using the existing `can_access_org` / `can_manage_org` helpers and explicit GRANTs:
  - `neutral_home_sites` (organization_id, name, floor_area_m2, occupancy, notes)
  - `neutral_home_periods` (site_id, organization_id, label, period_start, period_end, source filenames)
  - `neutral_home_circuits` (period_id, organization_id, circuit_name, category, is_aggregate, usage_kwh, co2_kg, blended_p_kwh, day_p_kwh, night_p_kwh, total_cost_p, day_kwh, day_pct, night_kwh, night_pct, daynight_total_kwh, plus the six intensity columns)
- Parsing runs client-side. `xlsx` (SheetJS) is added for workbook reading; CSV reuses the existing `papaparse`.
- New files: `src/lib/neutral-home/parse.ts` (header detection, date-range extraction, joining, validation), `src/lib/neutral-home/analytics.ts` (KPIs, comparisons, night-share flags, shift simulation), `src/lib/neutral-home.functions.ts` (server functions for site/period CRUD and bulk circuit insert), and `src/components/launcher/apps/NeutralHomeApp.tsx` plus child components (upload drawer, sites panel, KPI header, day/night analyzer, leaderboard).
- Registered in `src/lib/launcher-context.tsx` as slug `neutral-home` with a new icon key, wired into `src/routes/_authenticated/apps/$slug.tsx`, and given a launcher-card KPI (total kWh for the latest period) in `src/routes/_authenticated/dashboard.tsx`.
- Charts use Recharts and the existing semantic tokens. No global dark/light toggle in this build.