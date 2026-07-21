CREATE OR REPLACE VIEW public.meter_registry
WITH (security_invoker = on) AS
WITH grouped AS (
  SELECT
    cr.organization_id,
    cr.meter_name AS raw_meter_name,
    (array_agg(cr.variable_category ORDER BY cr.interval_date DESC, cr.id DESC))[1] AS utility_category,
    (array_agg(cr.building_id ORDER BY cr.interval_date DESC NULLS LAST, cr.id DESC))[1] AS csv_building_id,
    (array_agg(cr.meter_factor ORDER BY cr.interval_date DESC, cr.id DESC))[1] AS current_meter_factor,
    count(*)::integer AS row_count
  FROM public.consumption_rows cr
  WHERE cr.meter_name IS NOT NULL AND cr.meter_name <> ''
  GROUP BY cr.organization_id, cr.meter_name
)
SELECT
  g.organization_id,
  g.raw_meter_name,
  g.utility_category,
  mo.custom_display_name,
  COALESCE(mo.assigned_building_id, g.csv_building_id) AS effective_building_id,
  COALESCE(b.custom_display_name, 'Unassigned') AS effective_building_name,
  COALESCE(mo.calibrated_meter_factor, g.current_meter_factor, 1)::numeric AS effective_meter_factor,
  COALESCE(mo.csv_original_meter_factor, g.current_meter_factor, 1)::numeric AS csv_meter_factor,
  (mo.raw_meter_name IS NOT NULL) AS has_override,
  g.row_count
FROM grouped g
LEFT JOIN public.meter_overrides mo
  ON mo.organization_id = g.organization_id
 AND mo.raw_meter_name = g.raw_meter_name
LEFT JOIN public.buildings b
  ON b.id = COALESCE(mo.assigned_building_id, g.csv_building_id);

GRANT SELECT ON public.meter_registry TO authenticated;
GRANT SELECT ON public.meter_registry TO service_role;