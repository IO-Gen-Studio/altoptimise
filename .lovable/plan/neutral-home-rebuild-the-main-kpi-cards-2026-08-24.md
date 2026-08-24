# Neutral Home — rebuild the main KPI cards

Replace the five top KPI cards with a consistent set driven by the site's fixed metrics (Consumption, Solar Generation, Import Energy, Net Energy), each comparing the selected period against last year and, when a baseline period is chosen, against the baseline too.

## New card order

1. **Total Consumption (£)** — value = Consumption metric read on the cost column, shown in £. Change vs last year with a red up / green down triangle and the label "Saving" or "Overspend". Baseline comparison shown on a second line when a baseline is selected.
2. **Carbon Emissions (tCO₂e)** — same Consumption metric read on the carbon column. Same indicator and Saving / Overspend labelling, same baseline line.
3. **PV Generation (kWh)** — Solar Generation metric. Higher is better, so the colour logic inverts: label "Generated More" (green) or "Generated Less" (red), with the same last-year and baseline lines.
4. **kWh / HDD** (replaces "No. of Datapoints") — Consumption metric kWh divided by the period's heating degree days. Compared with the same figure for the last-year period (its own weather days are fetched for that period's dates). Label reflects the driver: "Warmer this year" / "Colder this year" when the degree-day change explains the move, otherwise "More efficient" / "Less efficient". Shows "n/a" with the existing explanation when HDD is zero (outside temps above the site's base).
5. **Net Energy** (replaces "Total Cost") — headline is the Net Energy metric's % change vs last year, labelled "Reduction" or "Increase". Import Energy kWh appears in the sub-line, and the baseline % change on the second comparison line.

The existing Day / Night Split card stays unchanged and moves after these five. The Performance Metrics table, zones league and all other sections are untouched.

## Consistency rules

- All five cards share one card component: label + icon, large value, one comparison line for last year, one for baseline (hidden when no baseline is selected).
- Every comparison shows the triangle direction from the raw change and the colour from whether that change is good for the metric.
- All figures come straight from the uploaded columns for the circuits mapped to each fixed metric — nothing is re-derived from other numbers.
- Cards render "—" when the metric has no mapped circuits, and omit a comparison line when the comparison period has no data.

## Technical notes

- Work is confined to `src/components/launcher/apps/neutral-home/NeutralHomeDashboard.tsx` plus a small shared KPI card component; the metric plumbing already exists.
- Values come from `buildComparison` over `fixedMetricDefs` with the existing `convertDefs` helper to swap the read column to `total_cost_p` (£) or `co2_kg` (kg) for cards 1 and 2, so the numbers match the Performance Metrics table exactly.
- The current period already loads weather via `syncNhWeather`; a second call is added for the comparison period's date range to give card 4 a last-year HDD. Failures fall back to hiding the comparison, not clearing the card.
- Reuses `periodHdd` / `kwhPerHdd` from `src/lib/neutral-home/weather.ts` and the existing `Triangle` indicator styling for visual consistency with the Performance Metrics table.
