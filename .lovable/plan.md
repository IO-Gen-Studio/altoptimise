## Consumption League Table — new mini-app

A cross-site ranking view that aggregates every meter into per-site totals per utility, with time-scale presets, monthly drilldown, and a rich set of comparison columns.

### 1. Data model additions

Extend `organisations` with per-utility tariff and emission factors so cost and CO₂e stay editable per client (no new tables — keeps admin surface small):

- `tariff_electricity_pence_per_kwh`, `tariff_gas_pence_per_kwh`, `tariff_water_pence_per_m3`
- `co2_factor_electricity_kg_per_kwh`, `co2_factor_gas_kg_per_kwh`, `co2_factor_water_kg_per_m3`

Sensible UK defaults (0.207 kg/kWh elec, 0.183 kg/kWh gas, 0.344 kg/m³ water) applied when null.

`EditOrganisationDialog` gains a "Tariffs & carbon factors" section for admins.

No new consumption tables — everything is derived from `consumption_rows` already loaded by `useConsumption()`.

### 2. New app registration

Add to `APPS` in `src/lib/launcher-context.tsx`:

- slug: `league-table`
- name: "Consumption League"
- tagline: "Rank sites by usage, cost & carbon"
- icon: new `leagueTable` icon (Trophy from lucide)
- accent: violet/fuchsia gradient
- allowedRoles: super_admin, admin, user (respect `appAccess`)

Wired into `src/routes/_authenticated/apps/$slug.tsx` router switch.

### 3. UI — `src/components/launcher/apps/LeagueTableApp.tsx`

**Header row (filters):**
- Utility tabs: Electricity · Gas · Water · Solar (auto-hidden when org has no meters of that kind)
- Time preset dropdown: YTD · MTD · Last 30 days · Last 12 months · Previous year · Custom range
- Ranking metric toggle: Total (kWh) · Intensity (kWh/m²) · YoY change %
- Sort direction + search box (filter by site name)

**Summary strip (4 KPI cards for the current filter):**
- Total consumption (kWh) with sparkline
- Estimated cost (£) at org tariff
- CO₂e (tonnes) with equivalent (miles driven / trees)
- Sites tracked (n) and coverage % (data completeness roll-up)

**League table (sortable columns):**

| # | Site | Consumption (kWh) | vs Prev Year | Cost (£) | CO₂e (kg) | Peak Demand (kW) | Load Factor | Out-of-Hours % | Data Quality |

- **Rank medal** for top 3 reducers (green) and bottom 3 (red).
- **vs Prev Year**: % delta + absolute kWh saved/added, sparkline bar (green/red).
- **Peak demand**: max half-hourly kW extrapolated (`max_hh_kwh × 2`).
- **Load factor**: `avg_kW / peak_kW` — flags spiky vs steady consumption.
- **Out-of-Hours %**: share of kWh consumed outside the building's active schedule (uses `resolveProfile` from `energy/profile.ts`).
- **Data Quality**: reuses `checkCompleteness` status pill so unreliable sites don't win the league unfairly.

**Monthly drilldown:**
Click a row → expands an inline panel with:
- 12-month stacked bar (this year vs previous year overlay line)
- Best/worst month callouts
- Per-meter contribution donut (top 5 meters + "Other")

### 4. Calculation module — `src/lib/energy/league.ts`

Pure functions, no hooks:
- `aggregateBySite(rows, range, utility) → SiteAggregate[]`
- `computePeakAndLoadFactor(rows) → { peakKw, loadFactor }`
- `computeOutOfHoursShare(rows, profile) → number` (uses HH slot × active window mask)
- `computeYoYDelta(currentAgg, priorAgg) → { deltaPct, deltaKwh }`
- `estimateCost(kwh, tariff)` and `estimateCo2(kwh, factor)`
- Utility classifier reuses `utilityKind()` from `energy/completeness.ts`

All aggregation done client-side over already-cached consumption rows — no new server functions or Supabase reads.

### 5. Small helpers reused

- `useConsumption`, `useBuildings`, `useOrganisations`, `useMeterRegistry` from `data-store`
- `resolveProfile` for schedule-aware out-of-hours
- `checkCompleteness` for data-quality badge

### 6. Out of scope for this pass

- Intensity per m² UI shows "—" until an optional `floor_area_m2` field is added to buildings (flagged in the tooltip). Adding the field is a follow-up if the user wants it.
- No CSV export in this pass (easy add later).

### Technical notes

- Migration adds nullable numeric columns to `organisations`; no RLS changes needed (existing `can_access_org` policies cover them).
- Types regenerate after migration, then `EditOrganisationDialog` and `league.ts` are wired up.
- Timezone-safe: all date math uses the existing UTC helpers to avoid the day-shift bug we already fixed elsewhere.
