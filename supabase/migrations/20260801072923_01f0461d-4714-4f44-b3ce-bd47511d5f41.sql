CREATE TABLE public.neutral_home_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  postcode text,
  floor_area_m2 numeric,
  occupancy numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_sites TO authenticated;
GRANT ALL ON public.neutral_home_sites TO service_role;
ALTER TABLE public.neutral_home_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nh_sites_select" ON public.neutral_home_sites
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "nh_sites_insert" ON public.neutral_home_sites
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_sites_update" ON public.neutral_home_sites
  FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_sites_delete" ON public.neutral_home_sites
  FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.neutral_home_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  source_headline_filename text,
  source_daynight_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_periods TO authenticated;
GRANT ALL ON public.neutral_home_periods TO service_role;
ALTER TABLE public.neutral_home_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nh_periods_select" ON public.neutral_home_periods
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "nh_periods_insert" ON public.neutral_home_periods
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_periods_update" ON public.neutral_home_periods
  FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_periods_delete" ON public.neutral_home_periods
  FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.neutral_home_circuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.neutral_home_periods(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  circuit_name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  is_aggregate boolean NOT NULL DEFAULT false,
  usage_kwh numeric,
  co2_kg numeric,
  blended_p_kwh numeric,
  day_p_kwh numeric,
  night_p_kwh numeric,
  total_cost_p numeric,
  day_kwh numeric,
  day_pct numeric,
  night_kwh numeric,
  night_pct numeric,
  daynight_total_kwh numeric,
  usage_kwh_per_person numeric,
  usage_kwh_per_m2 numeric,
  cost_p_per_person numeric,
  cost_p_per_m2 numeric,
  co2_kg_per_person numeric,
  co2_kg_per_m2 numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, circuit_name)
);

CREATE INDEX neutral_home_circuits_period_idx ON public.neutral_home_circuits (period_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_circuits TO authenticated;
GRANT ALL ON public.neutral_home_circuits TO service_role;
ALTER TABLE public.neutral_home_circuits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nh_circuits_select" ON public.neutral_home_circuits
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "nh_circuits_insert" ON public.neutral_home_circuits
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_circuits_update" ON public.neutral_home_circuits
  FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_circuits_delete" ON public.neutral_home_circuits
  FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TRIGGER touch_nh_sites BEFORE UPDATE ON public.neutral_home_sites
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();
CREATE TRIGGER touch_nh_periods BEFORE UPDATE ON public.neutral_home_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();