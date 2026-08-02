
CREATE TABLE public.neutral_home_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_categories TO authenticated;
GRANT ALL ON public.neutral_home_categories TO service_role;
ALTER TABLE public.neutral_home_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY nh_categories_select ON public.neutral_home_categories FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY nh_categories_insert ON public.neutral_home_categories FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_categories_update ON public.neutral_home_categories FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id)) WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_categories_delete ON public.neutral_home_categories FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.neutral_home_meter_categories (
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  circuit_name text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  category text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, circuit_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_meter_categories TO authenticated;
GRANT ALL ON public.neutral_home_meter_categories TO service_role;
ALTER TABLE public.neutral_home_meter_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY nh_meter_cats_select ON public.neutral_home_meter_categories FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY nh_meter_cats_insert ON public.neutral_home_meter_categories FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_meter_cats_update ON public.neutral_home_meter_categories FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id)) WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_meter_cats_delete ON public.neutral_home_meter_categories FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.neutral_home_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'usage_kwh',
  unit text NOT NULL DEFAULT 'kWh',
  circuit_names text[] NOT NULL DEFAULT '{}',
  lower_is_better boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_metrics TO authenticated;
GRANT ALL ON public.neutral_home_metrics TO service_role;
ALTER TABLE public.neutral_home_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY nh_metrics_select ON public.neutral_home_metrics FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY nh_metrics_insert ON public.neutral_home_metrics FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_metrics_update ON public.neutral_home_metrics FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id)) WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_metrics_delete ON public.neutral_home_metrics FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.neutral_home_site_settings (
  site_id uuid NOT NULL PRIMARY KEY REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  comparison_metrics text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_site_settings TO authenticated;
GRANT ALL ON public.neutral_home_site_settings TO service_role;
ALTER TABLE public.neutral_home_site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY nh_site_settings_select ON public.neutral_home_site_settings FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY nh_site_settings_insert ON public.neutral_home_site_settings FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_site_settings_update ON public.neutral_home_site_settings FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id)) WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY nh_site_settings_delete ON public.neutral_home_site_settings FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));
