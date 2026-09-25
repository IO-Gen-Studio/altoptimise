# Run scheduled ingestion once per day

## What changes

Today the automated upload checker fires every 5 minutes (288 times a day) just to see whether any saved schedule's time has arrived. Each schedule already stores its own daily time, so we only need one daily run that picks up everything due.

**New behaviour:** once a day, the system runs every enabled schedule whose saved time has already passed today and which hasn't successfully run yet today. A schedule saved for 10:00 UTC will be imported during that day's run; its data is at most a few hours older than the saved time.

## Steps

1. **Database migration** — remove the existing `run-due-ingestions` job and re-create it on a daily schedule (`30 3 * * *` — 03:30 UTC, after the nightly 03:20 cleanup job). This cuts 288 daily wake-ups to 1.

2. **Update the run-due-ingestions endpoint** (`src/routes/api/public/hooks/run-due-ingestions.ts`) — instead of matching only schedules whose time equals the current minute, select all enabled schedules where `scheduled_time <= now (UTC)` and which haven't synced successfully today. The existing "already ran today" guard and the app on/off switch stay unchanged.

3. **Verify** — confirm the job is registered daily, and that a schedule due earlier today is picked up and imports correctly, with its status shown in Settings.

## Technical details

- `cron.unschedule('run-due-ingestions')` then `cron.schedule('run-due-ingestions', '30 3 * * *', ...)` calling the same webhook URL with the same authorization header.
- Due-check becomes: `enabled = true AND scheduled_time <= current UTC time AND (last_synced_at is null OR last_synced_at < today OR last_status <> 'success')`.
- Failed schedules are retried on the next day's run (same as today, just less frequently).
- The manual "Run" button in Settings is unaffected — you can always trigger an import immediately.

## Trade-off

If you change a schedule's time mid-day to earlier than the daily run, it won't import until the next day — use the Run button for same-day imports.
