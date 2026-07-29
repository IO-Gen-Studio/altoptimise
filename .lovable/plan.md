## Agile Pricing & Load Shift Advisor (new mini-app)

A new launcher app, slug `agile-pricing`, that pulls Octopus Energy's open Agile API (no API key needed), stores unit rates daily, and shows live/day-ahead pricing, what your own half-hourly electricity actually cost at those prices, and where to move load to save money.

### Data source

Public Octopus REST endpoints (no auth, no secret):
- Agile import: `/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-{region}/standard-unit-rates/`
- Agile Outgoing (export): `/v1/products/OUTGOING-AGILE-24-10-01/electricity-tariffs/E-1R-OUTGOING-AGILE-24-10-01-{region}/standard-unit-rates/`
- Comparison: Tracker (`SILVER-…` daily) and Flexible/standard variable (`VAR-22-11-01`) unit rates + standing charges, per region.

Rates are half-hourly, inc-VAT and ex-VAT, published for tomorrow around 16:00 UK time. Region = the 14 GSP letters (A–P).

### Backend

New migration:
- `agile_regions` — reference list of the 14 GSP codes and their names (seeded).
- `buildings.gsp_region_code` (new nullable column) and `organisations.default_gsp_region_code` — region set per building by admins, org default as fallback.
- `energy_unit_rates` — `product_code`, `region_code`, `valid_from`, `valid_to`, `value_inc_vat`, `value_exc_vat`, unique on (product, region, valid_from). This is the price history store.
- `energy_price_sync_log` — last run, rows written, status/error per product+region.
- All with GRANTs, RLS (`authenticated` read for rates/regions, `can_manage_org` for the building/org region fields), and `updated_at` triggers.

Fetching:
- `src/lib/pricing.server.ts` + `src/routes/api/public/hooks/sync-agile-prices.ts` — pulls the last 48h plus all published future rates for every distinct region in use, upserts into `energy_unit_rates`. Idempotent.
- `pg_cron` job every 30 minutes (cheap; captures the ~16:00 day-ahead publish as soon as it lands) calling that route with the anon `apikey` header.
- `src/lib/pricing.functions.ts` — server functions: `syncNow` (admin manual trigger), `getRates(region, from, to, products)`.

### App UI (`src/components/launcher/apps/AgilePricingApp.tsx`)

**1. Live strip**
- Big "price now" card in p/kWh inc VAT, with a colour band (green / amber / red vs today's own distribution), the price for the next slot, and a countdown to the next change.
- Plunge-pricing badge when the rate is ≤ 0p (Agile goes negative), and a cap badge near the 100p cap.

**2. Today / tomorrow curve**
- Half-hourly bar chart across 48 (or 96 with tomorrow) slots, colour-scaled by price, a dashed line at the day's average, a "now" marker, and shading of the building's operational hours (reuses the existing `resolveProfile` schedule logic).
- Cards: cheapest slot, cheapest 1h/2h/3h contiguous window, most expensive slot, peak block (typically 16:00–19:00), day min/avg/max, and spread (max−min).
- Tomorrow's panel shows "not yet published" until Octopus releases it.

**3. Cost overlay against your own data**
- For the selected building/period, multiply each half-hourly electricity kWh (existing consumption rows, meter factors applied) by the matching Agile rate.
- KPIs: actual cost on Agile vs cost on your current flat tariff (`tariff_electricity_pence_per_kwh`) vs Tracker/Flexible — with £ and % difference, so you can see whether Agile would have been cheaper.
- Chart: daily cost lines for each tariff over the period; a table per building ranking Agile-vs-flat savings.
- "Price-weighted average unit rate" per building — a single number showing how well-timed the site's consumption is.

**4. Shift advisor**
- Identifies each building's most expensive consumption blocks and computes: "moving X kWh from 17:00–19:00 into the 02:00–04:00 window would have saved £Y over this period" — based on the actual historic price spread, with an adjustable shiftable-load slider (% of peak-window kWh assumed movable).
- Best-window recommendation for tomorrow once prices publish (cheapest N-hour run for EV/battery/immersion/plant scheduling).
- Export-side view where Agile Outgoing is tracked: highest-value export windows, and value of solar generation exported (uses meters classified as `solar`).

**5. Comparison tab**
- Agile vs Tracker vs Flexible: 30-day average unit rate, standing charge, and modelled cost for this org's actual profile. A simple "which tariff suits your load shape" verdict.

### Admin & roles

- Region picker added to `EditBuildingDialog` (Building Information tab) and a default region on `EditOrganisationDialog`; unset buildings inherit the org default.
- Super Admin / Admin: set regions, choose which products are tracked, trigger a manual price sync, set the shiftable-load assumption.
- User: read-only across all views.

### Wiring

- Register in `APPS` (`src/lib/launcher-context.tsx`) with a new `pricing` icon (Zap), so it appears in the launcher grid, the Apps reorder panel, and per-user app access.
- Render from `src/routes/_authenticated/apps/$slug.tsx`.

### Technical notes

- All Octopus calls happen server-side (server route + server functions), never from the browser — avoids CORS and lets us cache.
- Octopus timestamps are UTC ISO; slot index = UTC half-hour, matching the existing engine's UTC-based date maths, so nothing shifts by timezone. UK-local labels are formatted at render time only, so BST is displayed correctly.
- Cost calculations run client-side over the already-cached consumption state (IndexedDB) joined to rates fetched once per period, memoised per org/period.
