# Refrigeration Monitoring — new Optimise mini-app

Bring the RDM Data Monitoring product into Optimise as a seventh launcher app. Refrigeration cases hang off the buildings that already exist in Optimise (per organisation), settings and uploads live in Optimise Settings, and all analysis lives inside the app. Starting fresh — no data carried over from RDM; CSVs get re-uploaded here.

## What the user gets

**Launcher card "Refrigeration Monitoring"** (category: Monitoring) with a live KPI (cases in exceedance / total cases for the selected organisation), role- and access-controlled like every other app.

**Inside the app**
- Sites overview: every building in the selected organisation with case count, average/min/max control temp, exceedances, alarms, offline cases; grid and list views, sortable.
- Site detail: sortable case league table (Case ID, description, avg/min/max temp, cut-in temp, exceedances, alarms, missing readings, TPI efficiency flag red/amber/green, status active/offline/inactive).
- Date range picker driving every view.
- Case analysis: temperature chart (control/display/air-on/air-off/alarm), daily range chart, daily summary table, hourly temperature grid, case heatmap across all cases, control-state timeline.
- Alarm analysis, defrost analysis and recovery analysis widgets.
- Excel export of the summary table and the detailed view.
- Case editing (ID, label, cut-in temp, status, red/amber TPI thresholds) and CSV upload/replace/merge per case, plus alarm-log CSV upload per site.

**In Settings**
- New "Refrigeration" tab: pick an organisation and building, manage its cases, upload/merge case CSVs and alarm logs, set default cut-in temp and TPI thresholds for the organisation.
- Existing Organisations/Buildings tabs stay the source of truth for sites; no separate refrigeration site list.

## Technical approach

Database (new migration, org-scoped RLS mirroring the existing tables and `can_access_org` / `can_manage_org` helpers, with GRANTs):
- `refrigeration_cases` — organisation_id, building_id, case_id, label, description, controller, controller_description, max_safe_temp, status, efficiency_red, efficiency_amber, csv_text, source_filename, timestamps; unique on (building_id, case_id).
- `refrigeration_alarm_logs` — organisation_id, building_id, alarm_csv, source_filename; unique per building.
- `refrigeration_settings` — organisation_id (PK), default_max_safe_temp, default_efficiency_red, default_efficiency_amber, timestamps.

Readings stay as the raw CSV text per case (same shape RDM used) and are parsed client-side on demand, so the existing parser, merge logic and every widget port across unchanged. IndexedDB caching (existing `src/lib/cache/idb-cache.ts`) keeps repeat loads fast.

Code:
- `src/lib/refrigeration/parse.ts`, `alarms.ts`, `missing-readings.ts`, `export-excel.ts`, `analysis.ts` — ported from RDM `parseCSV.ts`, `parseAlarmCSV.ts`, `missingReadings.ts`, `exportExcel.ts` plus the summary/TPI/status helpers currently inline in `SiteDetail.tsx`.
- `src/lib/refrigeration.functions.ts` — authenticated server functions for case/alarm/settings CRUD and CSV upsert (merge or replace).
- `src/components/launcher/apps/RefrigerationApp.tsx` plus `refrigeration/` subcomponents: `SitesOverview`, `SiteDetail`, `CaseTable`, `TemperatureChart`, `DailyRangeChart`, `DailySummaryTable`, `HourlyTemperatureGrid`, `CaseHeatmap`, `ControlStateTimeline`, `AlarmAnalysis`, `DefrostAnalysis`, `RecoveryAnalysis`, `EditCaseDialog`, `CsvUploadDialog`, `DateRangePicker`.
- `src/components/admin/RefrigerationPanel.tsx` wired into a new tab in `src/routes/_authenticated/admin.tsx`.
- Register `refrigeration` in `APPS` (`src/lib/launcher-context.tsx`); routing is automatic via `/apps/$slug`, plus dashboard KPI wiring.

Porting notes: RDM's raw `<div>` dialogs, ad-hoc inputs and `react-router-dom` navigation are replaced with Optimise's shadcn Dialog/Input/Select/Table and internal state (no new routes); RDM's hardcoded logo and its own auth/user-management screens are dropped since Optimise already owns those. RDM's public-read tables are not copied — everything is org-scoped.

Sequencing: migration first (needs approval), then shared libs, then app UI, then Settings tab and launcher/KPI wiring.
