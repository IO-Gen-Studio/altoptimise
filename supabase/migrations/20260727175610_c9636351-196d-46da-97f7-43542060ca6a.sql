CREATE TABLE public.water_sentinel_settings (
  organization_id uuid PRIMARY KEY,
  window_start text NOT NULL DEFAULT '23:00',
  window_end text NOT NULL DEFAULT '05:30',
  sensitivity_m3 numeric NOT NULL DEFAULT 0.05,
  consecutive_intervals integer NOT NULL DEFAULT 3,
  wastewater_pence_per_m3 numeric NOT NULL DEFAULT 150,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.water_sentinel_settings TO authenticated;
GRANT ALL ON public.water_sentinel_settings TO service_role;
ALTER TABLE public.water_sentinel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read water sentinel settings" ON public.water_sentinel_settings
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage water sentinel settings" ON public.water_sentinel_settings
  FOR ALL TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

CREATE TRIGGER touch_water_sentinel_settings
  BEFORE UPDATE ON public.water_sentinel_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();

CREATE TABLE public.water_leak_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  raw_meter_name text NOT NULL,
  status text NOT NULL DEFAULT 'acknowledged',
  note text,
  period_start date,
  period_end date,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, raw_meter_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.water_leak_acknowledgements TO authenticated;
GRANT ALL ON public.water_leak_acknowledgements TO service_role;
ALTER TABLE public.water_leak_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read water leak acks" ON public.water_leak_acknowledgements
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage water leak acks" ON public.water_leak_acknowledgements
  FOR ALL TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

CREATE TRIGGER touch_water_leak_acks
  BEFORE UPDATE ON public.water_leak_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();