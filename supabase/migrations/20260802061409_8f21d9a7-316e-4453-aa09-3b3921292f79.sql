select cron.schedule('run-due-ingestions', (select schedule from cron.job where jobname='run-due-ingestions'), $$
  SELECT net.http_post(
    url := 'https://project--ee98978b-7b35-47b1-b045-9046d4a4d120.lovable.app/api/public/hooks/run-due-ingestions',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZ2l5aGZ4bHNzdXRydXRvdnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzMzNTMsImV4cCI6MjA5OTEwOTM1M30.JDfrmFp0TeKlJ5rNKWN64G9yLapIexpk_UlSaL0Q1J0"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
select cron.schedule('sync-agile-prices', (select schedule from cron.job where jobname='sync-agile-prices'), $$
  select net.http_post(
    url:='https://project--ee98978b-7b35-47b1-b045-9046d4a4d120.lovable.app/api/public/hooks/sync-agile-prices',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZ2l5aGZ4bHNzdXRydXRvdnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzMzNTMsImV4cCI6MjA5OTEwOTM1M30.JDfrmFp0TeKlJ5rNKWN64G9yLapIexpk_UlSaL0Q1J0"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);