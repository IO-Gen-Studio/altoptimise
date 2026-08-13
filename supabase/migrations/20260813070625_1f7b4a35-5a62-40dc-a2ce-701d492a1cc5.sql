CREATE TABLE public.refrigeration_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  case_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  controller text NOT NULL DEFAULT '',
  controller_description text NOT NULL DEFAULT '',
  max_safe_temp numeric NOT NULL DEFAULT 8,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','offline','inactive')),
  efficiency_red numeric NOT NULL DEFAULT 80,
  efficiency_amber numeric NOT NULL DEFAULT 70,
  csv_text text,
  source_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, case_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeration_cases TO authenticated;
GRANT ALL ON public.refrigeration_cases TO service_role;
ALTER TABLE public.refrigeration_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org refrigeration cases" ON public.refrigeration_cases
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "Managers insert org refrigeration cases" ON public.refrigeration_cases
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "Managers update org refrigeration cases" ON public.refrigeration_cases
  FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "Managers delete org refrigeration cases" ON public.refrigeration_cases
  FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE INDEX refrigeration_cases_building_idx ON public.refrigeration_cases (building_id);
CREATE INDEX refrigeration_cases_org_idx ON public.refrigeration_cases (organization_id);

CREATE TABLE public.refrigeration_alarm_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  alarm_csv text NOT NULL,
  source_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeration_alarm_logs TO authenticated;
GRANT ALL ON public.refrigeration_alarm_logs TO service_role;
ALTER TABLE public.refrigeration_alarm_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org refrigeration alarms" ON public.refrigeration_alarm_logs
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "Managers insert org refrigeration alarms" ON public.refrigeration_alarm_logs
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "Managers update org refrigeration alarms" ON public.refrigeration_alarm_logs
  FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "Managers delete org refrigeration alarms" ON public.refrigeration_alarm_logs
  FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.refrigeration_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  default_max_safe_temp numeric NOT NULL DEFAULT 8,
  default_efficiency_red numeric NOT NULL DEFAULT 80,
  default_efficiency_amber numeric NOT NULL DEFAULT 70,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeration_settings TO authenticated;
GRANT ALL ON public.refrigeration_settings TO service_role;
ALTER TABLE public.refrigeration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org refrigeration settings" ON public.refrigeration_settings
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "Managers insert org refrigeration settings" ON public.refrigeration_settings
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "Managers update org refrigeration settings" ON public.refrigeration_settings
  FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "Managers delete org refrigeration settings" ON public.refrigeration_settings
  FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.touch_refrigeration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_refrigeration_cases BEFORE UPDATE ON public.refrigeration_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_refrigeration();
CREATE TRIGGER touch_refrigeration_alarm_logs BEFORE UPDATE ON public.refrigeration_alarm_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_refrigeration();
CREATE TRIGGER touch_refrigeration_settings BEFORE UPDATE ON public.refrigeration_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_refrigeration();