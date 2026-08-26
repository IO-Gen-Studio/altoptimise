-- 1. Watermark column for incremental client sync
ALTER TABLE public.consumption_rows
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_consumption_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS touch_consumption_rows ON public.consumption_rows;
CREATE TRIGGER touch_consumption_rows
BEFORE UPDATE ON public.consumption_rows
FOR EACH ROW EXECUTE FUNCTION public.touch_consumption_rows();

-- 2. Indexes for the scoped access paths
CREATE INDEX IF NOT EXISTS consumption_rows_org_date_idx
  ON public.consumption_rows (organization_id, interval_date);
CREATE INDEX IF NOT EXISTS consumption_rows_org_meter_date_idx
  ON public.consumption_rows (organization_id, meter_name, interval_date);
CREATE INDEX IF NOT EXISTS consumption_rows_org_updated_idx
  ON public.consumption_rows (organization_id, updated_at);
CREATE INDEX IF NOT EXISTS nh_room_hours_period_hour_idx
  ON public.neutral_home_room_hours (period_id, hour_ts);

-- 3. Server-side daily temperature roll-up (RLS still applies: security invoker)
CREATE OR REPLACE FUNCTION public.nh_room_days(_period_id uuid)
RETURNS TABLE (
  room_name text,
  day date,
  temp_min numeric,
  temp_avg numeric,
  temp_max numeric,
  set_temp_avg numeric,
  on_share numeric,
  reading_count integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    r.room_name,
    (r.hour_ts AT TIME ZONE 'UTC')::date AS day,
    min(r.temp_min) AS temp_min,
    avg(r.temp_avg) AS temp_avg,
    max(r.temp_max) AS temp_max,
    avg(r.set_temp_avg) AS set_temp_avg,
    avg(r.on_share) AS on_share,
    sum(r.reading_count)::integer AS reading_count
  FROM public.neutral_home_room_hours r
  WHERE r.period_id = _period_id
  GROUP BY r.room_name, (r.hour_ts AT TIME ZONE 'UTC')::date
  ORDER BY r.room_name, day
$$;

GRANT EXECUTE ON FUNCTION public.nh_room_days(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nh_room_days(uuid) TO service_role;

-- 4. Retention housekeeping
CREATE OR REPLACE FUNCTION public.prune_energy_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.energy_price_sync_log WHERE created_at < now() - interval '14 days';
  DELETE FROM public.energy_unit_rates WHERE valid_from < now() - interval '120 days';
END;
$$;

REVOKE ALL ON FUNCTION public.prune_energy_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_energy_history() TO service_role;

SELECT cron.unschedule('prune-energy-history')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-energy-history');

SELECT cron.schedule('prune-energy-history', '20 3 * * *', $$SELECT public.prune_energy_history();$$);

-- 5. Ingestion checker: every 5 minutes instead of every minute
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobid = 1;
