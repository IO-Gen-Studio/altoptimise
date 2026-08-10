# Baseload Scoring → Baseload League Table

Turn the Baseload app from a stack of per-building cards into a ranked, explainable league table, in the same style as the Consumption League app.

## What changes

**1. Ranked league table (replaces building cards)**
One row per building × utility, ranked worst-to-best on wasted out-of-hours energy. Columns:

- Rank + building name (utility badge)
- Baseload score (0–100) with a small bar
- Idle waste (kWh) — energy above the baseload floor
- Estimated wasted cost (£) and carbon (kg CO₂e), using the org's tariff and carbon factors
- Out-of-hours share (% of total energy burnt outside active hours)
- Baseload floor (kW) vs active-hours average kW
- Waste events count
- Data coverage %

Sortable on every column, searchable by building, expandable rows.

**2. Plain-English explanation of how it works**
- A short "How this score works" panel at the top (collapsible): active hours come from the building schedule (or org default), everything outside them is baseload; we take the 10th-percentile baseload as the realistic floor, and anything above 1.5× that floor is counted as waste. Score = share of out-of-hours energy that is *not* waste.
- Each row's tooltip/expansion shows the actual active hours, profile source (building / org / default), season mode, and the exact floor value used — so a user can see why a score is what it is.

**3. Expanded row detail**
Clicking a row reveals:
- A 48-slot average day profile with the baseload window shaded and the waste threshold drawn as a line
- Top waste events (date, time, kWh above threshold)
- Profile inheritance and completeness notes

**4. Portfolio KPI header**
Total idle waste (kWh), estimated annualised wasted cost, portfolio average score with worst/best site named, and a count of buildings where scoring is paused for data reasons.

**5. Controls**
- Utility tabs (electricity / gas / water) driven by what data exists, like the Consumption League
- Time range: 7 / 30 / 90 days plus last 12 months
- Buildings with incomplete or offline data get a muted "Scoring paused" row with the reason, listed below the ranked rows instead of being mixed in.

## Technical notes

- Extend `src/lib/energy/scoring.ts` with a `baseloadLeague()` aggregator returning per-building-per-utility rows (score, idle waste, OOH share, floor kW, active avg kW, waste events, coverage) so all the maths sits outside the component.
- Reuse `orgTariff` / `orgCo2Factor` / `estimateCostGbp` / `estimateCo2Kg` from `src/lib/energy/league.ts` for the £ and CO₂ columns; no new tariff config.
- Keep `checkCompleteness` gating unchanged — paused rows still come from it.
- Rewrite `src/components/launcher/apps/BaseloadApp.tsx` as table + expandable detail, mirroring the sort/search/expand pattern already in `LeagueTableApp.tsx`. Recharts for the average-day profile.
- No database or schema changes.
