SELECT cron.unschedule('run-due-ingestions');

SELECT cron.schedule(
  'run-due-ingestions',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ee98978b-7b35-47b1-b045-9046d4a4d120.lovable.app/api/public/hooks/run-due-ingestions',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZ2l5aGZ4bHNzdXRydXRvdnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzMzNTMsImV4cCI6MjA5OTEwOTM1M30.JDfrmFp0TeKlJ5rNKWN64G9yLapIexpk_UlSaL0Q1J0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
