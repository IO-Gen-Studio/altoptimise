# Neutral Home — Temperature Report (3rd optional upload)

Adds an optional third report to the Neutral Home upload drawer: a room temperature history export (Set Temp, Room, Actual Temp, Date and Time, State). It is optional — periods still save from the Headline report alone. When present, it unlocks a new **Temperature** section on the dashboard plus a combined temperature + consumption analysis.

## Upload & parsing

- Third slot in the upload drawer: "3. Temperature History Report (optional)", .csv or .xlsx, multiple files allowed, same merge/replace choice as the other two.
- The file is minute-level (~750k rows/month), so it is **aggregated in the browser to hourly per room** before saving: min, average, max actual temp, average set temp, share of the hour with State = On, and reading count. That's roughly 12k rows per month instead of 750k.
- Rooms with no readings at all (e.g. the blank "Margeret Weston" row) are listed as a warning and skipped.
- Validation panel gains: rooms detected, hourly rows to write, date range covered, rows dropped as unparseable. If the temperature date range doesn't overlap the headline period, that's a warning, not a blocker.
- Period rows record the temperature source filename alongside the existing two.

## Comfort band settings

Per-site comfort band stored in Neutral Home settings (default 19–21 °C, editable in the site configuration dialog). All out-of-band flagging and overheating cost use this band.

## New dashboard analysis (Temperature tab)

1. **Headline cards** — rooms monitored, site average temperature, warmest / coolest room, % of monitored hours inside the comfort band, total overheating hours (above the band) and underheating hours (below).
2. **Temperature through the month** — line chart of daily average per room across the selected period, with the comfort band shaded and a room multi-select (defaults to all, click legend to isolate).
3. **Temperature range by room** — sorted floating-bar chart of min–average–max per room, coloured by whether the room sits inside, above or below the band.
4. **Out-of-band table** — per room: hours above 21 (band max), hours below the band min, worst reading, average deviation, and a red/amber/green flag. Sortable, with a chip filter for "above band only" / "below band only".
5. **Room × hour heatmap** — average temperature by room against hour of day, exposing overnight overheating.

## Room → circuit mapping

- New mapping store per site: temperature room name → consumption circuit name.
- **Auto-map on upload**: normalised token matching (case, punctuation, zone/room prefixes and common words stripped) with a similarity score. Confident matches are applied automatically; near matches are proposed as suggestions the user confirms.
- **Mapping editor** in the site configuration dialog: a two-column list of unmapped rooms with a searchable circuit picker, a confidence badge on auto-matches, and unmap / remap actions. Mapping is manual-first — user choices are never overwritten by a later auto-map run.

## Combined temperature + consumption analysis

For mapped rooms only, in the same Temperature tab:

- **Temp vs kWh scatter** — average room temperature on X, mapped circuit kWh on Y, bubble size by cost, quadrant guides at the band max and median usage so "hot and hungry" rooms stand out.
- **Overheating cost** — for each mapped room, degree-hours above the band converted to an estimated wasted kWh and £ (share of the circuit's usage attributable to hours above the band), summed into a site-level "cost of overheating" figure with the method stated on the card.
- **Room efficiency table** — room, mapped circuit, average temp, hours out of band, kWh, cost, CO₂, kWh per degree-hour above band. Sortable, same styling as the Efficiency League Table.
- **Overlay chart** — pick a mapped room: its daily average temperature as a line on the right axis over the circuit's daily kWh bars on the left axis, comfort band shaded.
- Export: the merged CSV export gains temperature columns for mapped rooms.

## Technical notes

- New tables, org-scoped with the existing `can_access_org` / `can_manage_org` RLS helpers plus explicit GRANTs:
  - `neutral_home_room_hours` (period_id, organization_id, site_id, room_name, hour_ts, temp_min, temp_avg, temp_max, set_temp_avg, on_share, reading_count) with a unique key on (period_id, room_name, hour_ts) so re-upload merges cleanly.
  - `neutral_home_room_map` (site_id, organization_id, room_name, circuit_name, auto_matched, confidence, updated_at).
  - `neutral_home_site_settings` gains `comfort_min_c` / `comfort_max_c`.
  - `neutral_home_periods` gains `source_temperature_filename`.
- New files: `src/lib/neutral-home/temperature.ts` (streaming CSV/xlsx parse, hourly aggregation, room extraction), `src/lib/neutral-home/room-match.ts` (normalisation + similarity scoring for auto-mapping), `src/lib/neutral-home/temp-analytics.ts` (band stats, degree-hours, overheating cost, correlation inputs), and `src/components/launcher/apps/neutral-home/NeutralHomeTemperature.tsx` plus small child components for the widgets.
- `saveNhPeriod` extended to accept hourly temperature rows (chunked upserts), `loadNeutralHome` extended to return room hours for the selected site's periods and the room map. Room hours are fetched per selected period rather than for the whole org to keep the payload small.
- Parsing stays client-side; Papa Parse handles the large CSV in a worker with chunked aggregation so the browser tab stays responsive, and a progress bar reports rows processed.
- Charts use Recharts and existing semantic tokens; no new colour literals.
