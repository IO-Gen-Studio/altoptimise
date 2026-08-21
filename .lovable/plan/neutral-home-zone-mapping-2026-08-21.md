# Neutral Home — Zone mapping

Circuits from the Headline Usage Report get a second, higher-level classification so the dashboard can report by **Zone** (areas/rooms) as well as by equipment. The existing categorisation is kept but relabelled as **Sub-Category**.

## Classification model

Each circuit for a site now carries:

- **Category** — `Zone`, `Equipment`, or `Other`. Default for a circuit with no choice yet is `Other`, except circuits whose sub-category is a plant type (HVAC, AHU, Heating, Kitchen, EV, PV, Lighting) which default to `Equipment`, and Totals/Incomers which stay `Other`.
- **Sub-Category** — exactly the current category list (HVAC, AHU, Heating/Storage Heaters, Kitchen, Lighting & Small Power, EV Charging, PV/Export, Offices, Storage & Retail, Totals & Incomers, Other, plus any user-added ones). Only the wording changes to "Sub-Category" everywhere in the UI.
- **Zone** — only for circuits with Category = `Equipment`: an optional link to a circuit classed as `Zone`. Equipment with no zone is reported as "Unassigned".

## Settings: circuit mapping editor

The site configuration dialog's "Meter categories" tab becomes **Circuits & zones**:

- Table columns: Circuit, Category (select), Sub-Category (select, current behaviour incl. "Auto"), Zone (select, enabled only when Category = Equipment; lists the site's Zone circuits + "Unassigned").
- Search box and a Category filter chip row, since sites have many circuits.
- Bulk helper: "Set selected to…" for Category and Zone via row checkboxes, so mapping dozens of circuits isn't one-by-one.
- Changing a circuit away from `Zone` clears any equipment links pointing at it (with a confirm noting how many will be unassigned).
- The Rooms & comfort tab is unchanged — temperature rooms still map to circuits, so a room mapped to a zone circuit (or to equipment inside a zone) rolls up to that zone.

## Dashboard changes

Everything below is additive; the **Performance Metrics** card stays exactly as it is today.

1. **Category filter** — a small Zone / Equipment / Other / All chip row next to the existing filters, applied to the day-night chart and the league table (not to the KPI cards or Performance Metrics).
2. **New "Zones" section** (between the day/night analyser and the league table):
   - **Zone cards / table** per Zone: total kWh, cost £, CO₂, day/night split, night share, number of equipment circuits attached, and % of site consumption. Sorted by kWh with a variance badge vs. the comparison period.
   - **Zone consumption chart** — horizontal stacked bars per zone: the zone circuit's own usage vs. its mapped equipment, so double counting is visible; "Unassigned equipment" appears as its own bar.
   - **Zone breakdown drill-down** — expanding a zone row lists its circuits (name, sub-category, kWh, cost, CO₂, day, night).
   - **Zone temperature** — for zones that resolve to temperature rooms: average temperature, hours above / below the comfort band, % in band, and the estimated overheating cost, reusing the existing comfort-band and degree-hour logic. Zones with no temperature data show a plain "no temperature data" state.
   - **Zone comfort vs. consumption** — scatter of zone average temperature against zone kWh (bubble size = cost), the zone-level equivalent of the existing room chart.
3. **Temperature section** gains a "By zone" view alongside the existing per-room view, using the same charts aggregated to zone.
4. **League table** keeps its current columns and gains a Sub-Category column label change plus a "Group by" switch with options Sub-Category and Zone (replacing the current single "Group by category" switch).
5. **Export merged CSV** gains `category` and `zone` columns.

## Technical notes

- Migration: add `kind text not null default 'other'` (check in `zone|equipment|other`) and `zone_circuit_name text` to `public.neutral_home_meter_categories`, and make `category` nullable so a circuit can set Category without overriding its auto Sub-Category. Existing rows keep their category and get `kind = 'other'`. Table already has org-scoped RLS and grants; no new table needed.
- `setNhMeterCategory` in `src/lib/neutral-home.functions.ts` accepts optional `kind` and `zone_circuit_name` and upserts partial changes; add a `setNhMeterCategoriesBulk` for the bulk actions. `NhMeterCategory` type extended.
- New `src/lib/neutral-home/zones.ts`: resolve each circuit's kind/sub-category/zone from overrides + auto categorisation, build zone rollups (own vs. attached usage, day/night, cost, CO₂), and map temperature rooms to zones via `roomMap` → circuit → zone.
- `src/lib/neutral-home/config.ts`: keep `applyCategoryOverrides` for sub-category, add kind/zone resolution helpers; rename user-facing category wording to "Sub-Category" (codes unchanged).
- New components under `src/components/launcher/apps/neutral-home/`: `NeutralHomeZones.tsx` (zone cards, stacked chart, drill-down, comfort table, scatter) and `ZoneMappingTable.tsx` used inside `NeutralHomeConfig.tsx`.
- `NeutralHomeTemperature.tsx` gets a zone/room toggle driven by the new zone resolver; existing room logic untouched.
- Charts use Recharts with existing semantic tokens; no new colour literals.
