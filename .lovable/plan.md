# Heating degree days & outside air temperature in the Zone league

Bring weather context into Neutral Home so zone consumption can be read against how cold it was outside.

## Where the weather comes from

- Each site's postcode is converted to coordinates once (postcodes.io), then daily outside air temperature (min / mean / max) is fetched for the period from Open-Meteo's free archive API — no API key, no user upload.
- Daily values are cached in the database per site, so repeat views and other periods reuse what has already been fetched.
- Heating degree days are computed from the daily mean against a base temperature that defaults to 15.5 C and is editable per site in Settings.
- Sites with no postcode, or a postcode that can't be resolved, simply show "No weather data" and everything else keeps working.

## What changes on the dashboard

Zone Consumption and Temperature Overview gains weather-normalised columns:

| Zone | Usage (kWh) | CO2 (kg) | Cost (GBP) | Day (kWh) | Night (kWh) | Avg temp (C) | kWh / HDD |

- `kWh / HDD` is the zone's usage divided by the period's total heating degree days — sortable like every other column, so zones that consume most per unit of cold rise to the top.
- A small strip above the table shows period context: total HDD, average outside temperature, and the HDD base used.

Expanded zone row:

- The daily temperature chart gains a second line for daily outside air temperature alongside the existing indoor average and the comfort-band reference lines.
- A new stat card shows the zone's `kWh / HDD` plus the indoor-to-outdoor temperature difference (average uplift), which highlights zones being heated hardest relative to the weather.

## Settings

Site settings gets an "HDD base temperature (C)" field (default 15.5) next to floor area / occupancy, plus a line showing whether weather data has been resolved for the site's postcode and a "Refresh weather" action.

## Technical notes

- Migration: `neutral_home_weather_days` (`site_id`, `day`, `temp_min`, `temp_mean`, `temp_max`, `hdd`, unique on site+day) with GRANTs for `authenticated` / `service_role` and org-scoped RLS matching the other `neutral_home_*` tables; add `hdd_base_c numeric not null default 15.5` and `latitude` / `longitude` to `neutral_home_sites`.
- New `src/lib/neutral-home/weather.ts` with pure helpers: `hdd(mean, base)`, `periodHdd(days)`, `kwhPerHdd(kwh, hdd)`.
- New authenticated server function in `src/lib/neutral-home.functions.ts`: `syncNhWeather({ siteId, from, to })` geocodes the postcode when lat/lon is missing, fetches Open-Meteo archive daily temps, upserts rows, returns the day list. `loadNhWeather({ siteId, from, to })` reads cached rows. Both use `requireSupabaseAuth`; external fetch happens inside the handler.
- `NeutralHomeZones.tsx`: accept `weatherDays` + `hddBase` props, add the `kWh / HDD` sort key and column, the context strip, the outside-temperature `Line` in the expanded chart, and the new stat card. No calculation changes to existing zone rollups.
- `NeutralHomeDashboard.tsx` loads weather for the active period (calling the sync function once per site/period, falling back to cached rows) and passes it down.
- `NeutralHomeSettings.tsx`: HDD base field and refresh action wired to the site update path already in place.
