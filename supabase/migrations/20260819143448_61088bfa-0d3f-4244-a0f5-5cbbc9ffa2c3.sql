ALTER TABLE public.neutral_home_periods ADD COLUMN IF NOT EXISTS source_temperature_filename text;
ALTER TABLE public.neutral_home_site_settings ADD COLUMN IF NOT EXISTS comfort_min_c numeric NOT NULL DEFAULT 19;
ALTER TABLE public.neutral_home_site_settings ADD COLUMN IF NOT EXISTS comfort_max_c numeric NOT NULL DEFAULT 21;

CREATE TABLE public.neutral_home_room_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.neutral_home_periods(id) ON DELETE CASCADE,
  room_name text NOT NULL,
  hour_ts timestamp with time zone NOT NULL,
  temp_min numeric,
  temp_avg numeric,
  temp_max numeric,
  set_temp_avg numeric,
  on_share numeric,
  reading_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT neutral_home_room_hours_uniq UNIQUE (period_id, room_name, hour_ts)
);
CREATE INDEX neutral_home_room_hours_period_idx ON public.neutral_home_room_hours (period_id);
CREATE INDEX neutral_home_room_hours_site_idx ON public.neutral_home_room_hours (site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_room_hours TO authenticated;
GRANT ALL ON public.neutral_home_room_hours TO service_role;
ALTER TABLE public.neutral_home_room_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nh_room_hours_select" ON public.neutral_home_room_hours FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "nh_room_hours_insert" ON public.neutral_home_room_hours FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_room_hours_update" ON public.neutral_home_room_hours FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id)) WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_room_hours_delete" ON public.neutral_home_room_hours FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TABLE public.neutral_home_room_map (
  site_id uuid NOT NULL REFERENCES public.neutral_home_sites(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  room_name text NOT NULL,
  circuit_name text,
  auto_matched boolean NOT NULL DEFAULT false,
  confidence numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, room_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.neutral_home_room_map TO authenticated;
GRANT ALL ON public.neutral_home_room_map TO service_role;
ALTER TABLE public.neutral_home_room_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nh_room_map_select" ON public.neutral_home_room_map FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "nh_room_map_insert" ON public.neutral_home_room_map FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_room_map_update" ON public.neutral_home_room_map FOR UPDATE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id)) WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "nh_room_map_delete" ON public.neutral_home_room_map FOR DELETE TO authenticated USING (public.can_manage_org(auth.uid(), organization_id));

CREATE TRIGGER touch_nh_room_map BEFORE UPDATE ON public.neutral_home_room_map FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();