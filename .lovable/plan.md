## Goal

Turn the Baseload Scoring app from a static mock into a real engine driven by (a) a data completeness gate, (b) organisation-level trading profile templates, (c) a 3-tier fallback pipeline for active vs baseload hours, and (d) a seasonality-aware scoring formula. Surface all of this in existing admin/building settings and the analytics UI.

## 1. Data model (one migration)

New/extended columns — all with GRANTs and RLS unchanged from existing tables:

- `organisations`: add
  - `profile_type` text — one of `office`, `retail`, `evening_peak` (default `office`)
  - `active_from` / `active_to` (time) — default daytime trading window
  - `active_days` int[] — weekdays included (0=Sun…6=Sat)
  - `peak_season_months` int[] — default `{3..10}` for evening_peak, `{}` for others
  - `summer_gas_months` int[] — months where flat 0 gas is treated as valid (default `{5,6,7,8,9}`)
  - `holidays` date[] — org-wide closed dates
- `buildings`: add
  - `schedule_override_enabled` bool (default false) — when true, building's own `schedules` rows win over org profile
- No changes to `consumption_rows` / `meter_overrides`.

I'll write a single migration with `ALTER TABLE` + backfill defaults. No new tables ⇒ no new GRANT block needed.

## 2. New pure-TS engine modules (unit-testable, no UI)

- `src/lib/energy/profile.ts`
  - Types: `ProfileType`, `ResolvedProfile`, `ScheduleSource = 'building' | 'org' | 'system'`
  - `resolveProfile(building, org): { profile, source }` — implements the 3-tier fallback (building override → org profile → system default of Mon–Fri 08:30–17:30).
  - Baseload zone derivation per profile (office/retail = 18:00–07:00 + closed days; evening_peak = 01:00–15:59 next-day-relative).
- `src/lib/energy/completeness.ts`
  - `checkCompleteness(rows, meter, windowStart, windowEnd, org): CompletenessResult`
    - Returns `{ status: 'ok' | 'incomplete' | 'telemetry_offline', missingPct, flatlineHours, reason }`.
    - Rules from spec:
      - Missing >10% of expected 30-min slots ⇒ `incomplete`.
      - Electricity/Water: 24+ consecutive hours of absolute 0 ⇒ `telemetry_offline`.
      - Gas: skip flatline check when window overlaps `summer_gas_months`.
- `src/lib/energy/scoring.ts`
  - `computeBaseloadScore(rows, meter, profile, season): { score, idleWaste, oohEnergy, floor }`
    - Split intervals into Active vs Baseload via profile.
    - Formula: `score = max(0, (1 - idleWaste / oohEnergy) * 100)`.
    - Season-aware floor: peak season uses occupied-standby floor (P10 of baseload intervals); off-peak floor ≈ 0 for evening_peak.
    - Peak detection: any baseload slot > floor × configurable multiplier counts as `idleWaste`.

Add lightweight `vitest`-style tests under `src/lib/energy/__tests__/` for each of these three functions (small fixtures, no Supabase).

## 3. Baseload Scoring mini-app rewrite (`src/components/launcher/apps/BaseloadApp.tsx`)

Replace hard-coded `ANOMALIES` and score constants with real per-building calculations against the current org's consumption:

- Time-window selector (7 / 30 / 90 days, default 7).
- For each building × utility (Electricity / Gas / Water):
  1. Run completeness check.
  2. If `incomplete` → yellow diagnostic badge "Data Incomplete".
  3. If `telemetry_offline` → yellow "Scoring Paused: Meter Inactive / Data Issues" card; exclude from leaderboard.
  4. Otherwise → compute score, render gauge + trend + top anomalies.
- Header shows which fallback tier is active (`Inheriting Org Profile: Evening Peak`, `Building Override`, or `System Default`) as a small badge with tooltip.
- Chart shading: when profile = `evening_peak` and status = ok, shade the 00:00–16:00 block as the baseload threshold zone.

Tooling: keep existing shadcn `Card`/`Progress`/`Badge`. Add a simple SVG or recharts strip for the 48-slot day if recharts is already present (I'll check before adding a dep).

## 4. Data Completeness mini-app (stub + registration)

New launcher card `Data Completeness Check` (icon: `ShieldCheck`). Route stub `/apps/data-completeness` renders a table of all buildings × utilities with their completeness status, using the same `checkCompleteness` engine. Kept intentionally minimal — full app spec to come later, but the entry point and the shared engine module are in place now.

## 5. Admin & Building UI

- **Organisation edit dialog** (`OrganisationsPanel` / new `EditOrganisationDialog`):
  - Profile template dropdown (Office / Retail / Evening Peak).
  - Time pickers for default active window, weekday multi-select, peak-season month multi-select, summer-gas month multi-select, holiday date list.
- **Building edit dialog** (`EditBuildingDialog`): add a "Schedule" section with:
  - Inheritance badge: "Inheriting Org Profile: &nbsp;" (default) or "Custom Building Override".
  - Button "Create Custom Building Override" that flips `schedule_override_enabled=true` and opens/scrolls to the existing per-building schedule editor (already in `ScheduleSettings`—will factor out a small `BuildingScheduleEditor` reusable component).
- **Analytics tooltips**: hover the score/gauge to see "Baseline source: Building Override" (etc.), driven by `resolveProfile`.

## 6. Data-store additions

Extend `data-store.tsx` with:

- `updateOrganisation` already exists — no signature change; the new columns flow through the existing `patch: Partial<Organisation>` path once the `Organisation` type is extended.
- `useBuildingSchedule(buildingId)` returning `{ effectiveSchedule, source }` for UI badges.
- No new tables ⇒ no new hook plumbing beyond typing.

## 7. Out of scope

- Not implementing the full Data Completeness dashboard beyond the table stub (per your "remember this" note — separate mini-app later).
- No changes to CSV ingestion / meter override logic.
- No new charting library added unless recharts is already installed.
- No changes to auth or RLS shape.

## Files touched (approx.)

- `supabase/migrations/<new>.sql` (org + building column adds)
- `src/lib/data-store.tsx` (type extensions, small helpers)
- `src/lib/energy/{profile,completeness,scoring}.ts` (new)
- `src/lib/energy/__tests__/*.test.ts` (new)
- `src/components/launcher/apps/BaseloadApp.tsx` (rewrite)
- `src/components/launcher/apps/DataCompletenessApp.tsx` (new stub)
- `src/routes/_authenticated/apps/$slug.tsx` (register new app slug)
- `src/lib/launcher-context.tsx` (add app to catalog)
- `src/components/admin/OrganisationsPanel.tsx` + new `EditOrganisationDialog.tsx`
- `src/components/admin/EditBuildingDialog.tsx` (schedule inheritance section)
- Small extraction: `src/components/admin/BuildingScheduleEditor.tsx` from parts of `ScheduleSettings.tsx`

## Open questions (answer inline or I'll default)

1. System default fallback hours — confirm Mon–Fri **08:30–17:30** with weekends closed? (Default: yes.) yes
2. Evening-peak "off-peak season" — spec says Nov–Feb; peak = Mar–Oct. Confirm months. (Default: Mar–Oct peak.) yes
3. Anomaly detection sensitivity — flag baseload slots that exceed `floor × 1.5`? (Default: 1.5×.)
4. Should the completeness threshold (10% missing, 24h flatline) be org-configurable, or hard-coded for now? (Default: hard-coded constants exposed from `completeness.ts`.) org-configurable 