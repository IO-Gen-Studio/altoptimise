CREATE INDEX IF NOT EXISTS idx_consumption_rows_org_meter_date
  ON public.consumption_rows (organization_id, meter_name, interval_date);

CREATE INDEX IF NOT EXISTS idx_consumption_rows_registry_latest
  ON public.consumption_rows (organization_id, meter_name, interval_date DESC, created_at DESC, id DESC)
  INCLUDE (variable_category, building_id, meter_factor);

CREATE INDEX IF NOT EXISTS idx_consumption_rows_org_date_id
  ON public.consumption_rows (organization_id, interval_date DESC, id);

DROP TRIGGER IF EXISTS trg_consumption_rows_registry_insert ON public.consumption_rows;
DROP TRIGGER IF EXISTS trg_consumption_rows_registry_update ON public.consumption_rows;
DROP TRIGGER IF EXISTS trg_consumption_rows_registry_delete ON public.consumption_rows;

CREATE TRIGGER trg_consumption_rows_registry_insert
AFTER INSERT ON public.consumption_rows
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_meter_registry_cache_after_insert();

CREATE TRIGGER trg_consumption_rows_registry_update
AFTER UPDATE ON public.consumption_rows
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_meter_registry_cache_after_update();

CREATE TRIGGER trg_consumption_rows_registry_delete
AFTER DELETE ON public.consumption_rows
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_meter_registry_cache_after_delete();

TRUNCATE TABLE public.meter_registry_cache;

INSERT INTO public.meter_registry_cache (
  organization_id,
  raw_meter_name,
  utility_category,
  csv_building_id,
  current_meter_factor,
  csv_meter_factor,
  row_count,
  latest_interval_date,
  updated_at
)
WITH counts AS (
  SELECT
    organization_id,
    meter_name AS raw_meter_name,
    count(*)::integer AS row_count
  FROM public.consumption_rows
  WHERE meter_name IS NOT NULL AND meter_name <> ''
  GROUP BY organization_id, meter_name
), latest AS (
  SELECT DISTINCT ON (organization_id, meter_name)
    organization_id,
    meter_name AS raw_meter_name,
    COALESCE(variable_category, '') AS utility_category,
    building_id AS csv_building_id,
    COALESCE(meter_factor, 1) AS current_meter_factor,
    COALESCE(meter_factor, 1) AS csv_meter_factor,
    interval_date AS latest_interval_date
  FROM public.consumption_rows
  WHERE meter_name IS NOT NULL AND meter_name <> ''
  ORDER BY organization_id, meter_name, interval_date DESC, created_at DESC, id DESC
)
SELECT
  c.organization_id,
  c.raw_meter_name,
  l.utility_category,
  l.csv_building_id,
  l.current_meter_factor,
  l.csv_meter_factor,
  c.row_count,
  l.latest_interval_date,
  now()
FROM counts c
JOIN latest l USING (organization_id, raw_meter_name);