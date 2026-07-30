# Consumption overlay on the Agile day curve

Add a typical half-hourly consumption profile behind the price bars on the "Day curve" tab, plus day navigation.

## What changes for the user

- The day-curve chart becomes a combo chart: price bars (amber/green banding, unchanged) plus a consumption line/area.
- Left axis = kWh consumption, right axis = p/kWh price.
- Consumption shown is the typical profile for that weekday: the last 4 dates with the same day of week that have data, averaged slot-by-slot — the same baseline rule the data-integrity check uses.
- Arrows (‹ Today ›) step back to previous days and forward again, with a "Today" reset. Price bars follow the selected day; where historical prices are stored, real bars are shown.
- Tooltip shows both price and average kWh for the slot. If fewer than 3 matching weekdays have data, the overlay is hidden with a short note.
- The existing building selector keeps scoping the consumption (all buildings or one).

## Technical notes

- New helper alongside `src/lib/energy/pricing.ts`: `weekdayProfile({ rows, orgId, buildingId, buildingIdFor, factorFor, targetISO })` — filters electricity rows for the org/building, walks back in 7-day steps from the target date (scan cap ~26 weeks), collects up to 4 dates with data, and returns a 48-length array of mean kWh per slot plus the dates used and sample count. Mirrors the loop in `checkCompleteness` (`src/lib/energy/completeness.ts`, lines 288-307) so both features agree.
- In `AgilePricingApp.tsx`: add `dayOffset` state (0 = today, negative = past). Derive `viewStart = ukMidnight(now, dayOffset)` and reuse the existing slots/`dayStats`/band logic against it. The "Tomorrow" card stays pinned to the real tomorrow.
- Extend the price fetch window's start when the user steps back beyond the current analysis window so historical bars are available.
- Swap `BarChart` for recharts `ComposedChart`: `<YAxis yAxisId="kwh" orientation="left" />`, `<YAxis yAxisId="price" orientation="right" unit="p" />`, `<Area yAxisId="kwh" dataKey="kwh" />` rendered before `<Bar yAxisId="price" dataKey="price">` so the bars sit on top. Cells keep `BAND_FILL`; the dimmed "past slot" opacity applies only when viewing today.
- Colours reuse the existing band HSL tokens; no new hardcoded colour utilities.