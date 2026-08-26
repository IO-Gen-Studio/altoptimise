REVOKE EXECUTE ON FUNCTION public.prune_energy_history() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_energy_history() FROM authenticated;

SELECT cron.unschedule('run-due-ingestions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-due-ingestions');

SELECT cron.schedule(
  'run-due-ingestions',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ee98978b-7b35-47b1-b045-9046d4a4d120.lovable.app/api/public/hooks/run-due-ingestions',
    headers := (SELECT headers FROM (SELECT '{"Content-Type": "application/json", "apikey": "' || current_setting('app.settings.cron_key', true) || '"}' AS headers) t),
    body := '{}'::jsonb
  );
  $$
);
