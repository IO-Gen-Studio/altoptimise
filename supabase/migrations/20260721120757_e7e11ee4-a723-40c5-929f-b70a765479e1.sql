CREATE INDEX IF NOT EXISTS idx_consumption_rows_registry_latest
  ON public.consumption_rows (organization_id, meter_name, interval_date DESC, created_at DESC)
  INCLUDE (building_id, variable_category, meter_factor)
  WHERE meter_name IS NOT NULL AND meter_name <> '';

CREATE TABLE IF NOT EXISTS public.meter_registry_cache (
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  raw_meter_name text NOT NULL,
  utility_category text NOT NULL DEFAULT '',
  csv_building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  current_meter_factor numeric NOT NULL DEFAULT 1,
  csv_meter_factor numeric NOT NULL DEFAULT 1,
  row_count integer NOT NULL DEFAULT 0,
  latest_interval_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, raw_meter_name)
);

GRANT SELECT ON public.meter_registry_cache TO authenticated;
GRANT ALL ON public.meter_registry_cache TO service_role;

ALTER TABLE public.meter_registry_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read meter registry cache" ON public.meter_registry_cache;
CREATE POLICY "read meter registry cache"
ON public.meter_registry_cache
FOR SELECT
TO authenticated
USING (public.can_access_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "manage meter registry cache" ON public.meter_registry_cache;
CREATE POLICY "manage meter registry cache"
ON public.meter_registry_cache
FOR ALL
TO authenticated
USING (public.can_manage_org(auth.uid(), organization_id))
WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

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
JOIN latest l USING (organization_id, raw_meter_name)
ON CONFLICT (organization_id, raw_meter_name) DO UPDATE SET
  utility_category = EXCLUDED.utility_category,
  csv_building_id = EXCLUDED.csv_building_id,
  current_meter_factor = EXCLUDED.current_meter_factor,
  csv_meter_factor = EXCLUDED.csv_meter_factor,
  row_count = EXCLUDED.row_count,
  latest_interval_date = EXCLUDED.latest_interval_date,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.refresh_meter_registry_cache_one(_organization_id uuid, _raw_meter_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_row record;
  total_rows integer;
BEGIN
  IF _organization_id IS NULL OR _raw_meter_name IS NULL OR _raw_meter_name = '' THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO total_rows
  FROM public.consumption_rows
  WHERE organization_id = _organization_id
    AND meter_name = _raw_meter_name;

  IF COALESCE(total_rows, 0) = 0 THEN
    DELETE FROM public.meter_registry_cache
    WHERE organization_id = _organization_id
      AND raw_meter_name = _raw_meter_name;
    RETURN;
  END IF;

  SELECT
    COALESCE(variable_category, '') AS utility_category,
    building_id AS csv_building_id,
    COALESCE(meter_factor, 1) AS current_meter_factor,
    COALESCE(meter_factor, 1) AS csv_meter_factor,
    interval_date AS latest_interval_date
    INTO latest_row
  FROM public.consumption_rows
  WHERE organization_id = _organization_id
    AND meter_name = _raw_meter_name
  ORDER BY interval_date DESC, created_at DESC, id DESC
  LIMIT 1;

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
  ) VALUES (
    _organization_id,
    _raw_meter_name,
    latest_row.utility_category,
    latest_row.csv_building_id,
    latest_row.current_meter_factor,
    latest_row.csv_meter_factor,
    total_rows,
    latest_row.latest_interval_date,
    now()
  )
  ON CONFLICT (organization_id, raw_meter_name) DO UPDATE SET
    utility_category = EXCLUDED.utility_category,
    csv_building_id = EXCLUDED.csv_building_id,
    current_meter_factor = EXCLUDED.current_meter_factor,
    csv_meter_factor = EXCLUDED.csv_meter_factor,
    row_count = EXCLUDED.row_count,
    latest_interval_date = EXCLUDED.latest_interval_date,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_meter_registry_cache_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    FROM new_rows
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
    FROM new_rows
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
  JOIN latest l USING (organization_id, raw_meter_name)
  ON CONFLICT (organization_id, raw_meter_name) DO UPDATE SET
    utility_category = CASE
      WHEN meter_registry_cache.latest_interval_date IS NULL
        OR EXCLUDED.latest_interval_date >= meter_registry_cache.latest_interval_date
      THEN EXCLUDED.utility_category
      ELSE meter_registry_cache.utility_category
    END,
    csv_building_id = CASE
      WHEN meter_registry_cache.latest_interval_date IS NULL
        OR EXCLUDED.latest_interval_date >= meter_registry_cache.latest_interval_date
      THEN EXCLUDED.csv_building_id
      ELSE meter_registry_cache.csv_building_id
    END,
    current_meter_factor = CASE
      WHEN meter_registry_cache.latest_interval_date IS NULL
        OR EXCLUDED.latest_interval_date >= meter_registry_cache.latest_interval_date
      THEN EXCLUDED.current_meter_factor
      ELSE meter_registry_cache.current_meter_factor
    END,
    csv_meter_factor = CASE
      WHEN meter_registry_cache.latest_interval_date IS NULL
        OR EXCLUDED.latest_interval_date >= meter_registry_cache.latest_interval_date
      THEN EXCLUDED.csv_meter_factor
      ELSE meter_registry_cache.csv_meter_factor
    END,
    row_count = meter_registry_cache.row_count + EXCLUDED.row_count,
    latest_interval_date = GREATEST(meter_registry_cache.latest_interval_date, EXCLUDED.latest_interval_date),
    updated_at = now();

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_meter_registry_cache_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected record;
BEGIN
  FOR affected IN
    SELECT DISTINCT organization_id, meter_name AS raw_meter_name
    FROM old_rows
    WHERE meter_name IS NOT NULL AND meter_name <> ''
  LOOP
    PERFORM public.refresh_meter_registry_cache_one(affected.organization_id, affected.raw_meter_name);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_meter_registry_cache_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected record;
BEGIN
  FOR affected IN
    SELECT DISTINCT organization_id, raw_meter_name
    FROM (
      SELECT organization_id, meter_name AS raw_meter_name
      FROM old_rows
      WHERE meter_name IS NOT NULL AND meter_name <> ''
      UNION
      SELECT organization_id, meter_name AS raw_meter_name
      FROM new_rows
      WHERE meter_name IS NOT NULL AND meter_name <> ''
    ) changed
  LOOP
    PERFORM public.refresh_meter_registry_cache_one(affected.organization_id, affected.raw_meter_name);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_meter_registry_cache_one(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_meter_registry_cache_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_meter_registry_cache_after_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_meter_registry_cache_after_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_meter_registry_cache_insert ON public.consumption_rows;
CREATE TRIGGER sync_meter_registry_cache_insert
AFTER INSERT ON public.consumption_rows
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_meter_registry_cache_after_insert();

DROP TRIGGER IF EXISTS sync_meter_registry_cache_delete ON public.consumption_rows;
CREATE TRIGGER sync_meter_registry_cache_delete
AFTER DELETE ON public.consumption_rows
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_meter_registry_cache_after_delete();

DROP TRIGGER IF EXISTS sync_meter_registry_cache_update ON public.consumption_rows;
CREATE TRIGGER sync_meter_registry_cache_update
AFTER UPDATE ON public.consumption_rows
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_meter_registry_cache_after_update();

CREATE OR REPLACE VIEW public.meter_registry
WITH (security_invoker = on) AS
SELECT
  c.organization_id,
  c.raw_meter_name,
  c.utility_category,
  mo.custom_display_name,
  COALESCE(mo.assigned_building_id, c.csv_building_id) AS effective_building_id,
  COALESCE(b.custom_display_name, 'Unassigned'::text) AS effective_building_name,
  COALESCE(mo.calibrated_meter_factor, c.current_meter_factor, 1::numeric) AS effective_meter_factor,
  COALESCE(mo.csv_original_meter_factor, c.csv_meter_factor, c.current_meter_factor, 1::numeric) AS csv_meter_factor,
  (mo.raw_meter_name IS NOT NULL) AS has_override,
  c.row_count
FROM public.meter_registry_cache c
LEFT JOIN public.meter_overrides mo
  ON mo.organization_id = c.organization_id
 AND mo.raw_meter_name = c.raw_meter_name
LEFT JOIN public.buildings b
  ON b.id = COALESCE(mo.assigned_building_id, c.csv_building_id);

GRANT SELECT ON public.meter_registry TO authenticated;
GRANT ALL ON public.meter_registry TO service_role;