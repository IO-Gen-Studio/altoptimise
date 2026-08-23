ALTER TABLE public.neutral_home_sites
  ADD COLUMN IF NOT EXISTS hdd_base_c numeric NOT NULL DEFAULT 15.5,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

CREATE TABLE IF NOT EXISTS public.neutral_home_weather_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  day date NOT NULL,
  temp_min numeric,
  temp_mean numeric,
  temp_max numeric,
  hdd numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, day)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_weather_days TO authenticated;
GRANT ALL ON public.neutral_home_weather_days TO service_role;

ALTER TABLE public.neutral_home_weather_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY nh_weather_select ON public.neutral_home_weather_days
  FOR SELECT TO authenticated USING (can_access_org(auth.uid(), organization_id));
CREATE POLICY nh_weather_insert ON public.neutral_home_weather_days
  FOR INSERT TO authenticated WITH CHECK (can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_weather_update ON public.neutral_home_weather_days
  FOR UPDATE TO authenticated USING (can_manage_org(auth.uid(), organization_id))
  WITH CHECK (can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_weather_delete ON public.neutral_home_weather_days
  FOR DELETE TO authenticated USING (can_manage_org(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS nh_weather_site_day_idx ON public.neutral_home_weather_days (site_id, day);

CREATE TRIGGER touch_nh_weather BEFORE UPDATE ON public.neutral_home_weather_days
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();