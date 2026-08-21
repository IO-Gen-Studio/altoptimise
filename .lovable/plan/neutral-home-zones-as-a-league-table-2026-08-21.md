# Neutral Home — Zones as a league table

Replace the current Zones cards + stacked chart with a ranked, expandable league table styled like the Baseload League app.

## League table

One row per zone, sorted by Usage (kWh) descending, with click-to-sort headers:

| Zone | Usage (kWh) | CO2 (kg) | Cost (£) | Day (kWh) | Night (kWh) |

- Rank number and the count of equipment circuits mapped into the zone stay as small secondary detail on the zone name cell.
- Values come from the existing zone rollup (zone circuit's own usage plus the equipment mapped into it) — no calculation changes.
- Empty state unchanged: prompt to set a circuit's Category to "Zone" in Settings → Circuits & zones.

## Expanded zone row

Clicking a zone expands an inline panel:

- **Chart (left, wider)**: daily average temperature for the zone across the period, as a line, with two dashed reference lines for the comfort band minimum and maximum. Temperature is the average of all rooms mapped (via room → circuit → zone) to that zone.
- **Stats (right)**: Average temperature, Highest temperature, Lowest temperature — plus hours in band as supporting text.
- Zones with no mapped temperature rooms show a plain "No temperature data for this zone" message instead of the chart.
- The zone's equipment circuits list (name, kWh, cost, CO2) stays available underneath the chart for drill-down.

## Technical notes

- `src/components/launcher/apps/neutral-home/NeutralHomeZones.tsx` is rewritten: sortable table + expanded row; drops the KPI card grid, the stacked Zone/Equipment bar chart, and the separate zone comfort table (its numbers move into the expanded row).
- Add a `zoneDailyTemps(rows, mapping, classes)` helper to `src/lib/neutral-home/zones.ts` returning per-zone `{ date, avg }[]` plus avg/min/max, reusing the same hour-row aggregation shape as `dailySeries` in `temp-analytics.ts`.
- Reuse the already-loaded `neutral_home_room_hours` fetch in the component; no new server functions or migrations.
- Recharts `LineChart` + `ReferenceLine` with existing semantic tokens (`--chart-1`, `--border`, `--muted-foreground`); no colour literals.
- `NeutralHomeDashboard.tsx` props to `NeutralHomeZones` stay the same.
