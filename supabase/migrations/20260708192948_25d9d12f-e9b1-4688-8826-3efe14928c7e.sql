
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger: profile + role on new user (first user = admin, else viewer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'viewer';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Data tables
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT ALL ON public.organisations TO service_role;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read organisations" ON public.organisations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage organisations" ON public.organisations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  custom_display_name TEXT NOT NULL,
  csv_matched_name TEXT NOT NULL DEFAULT '',
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buildings TO authenticated;
GRANT ALL ON public.buildings TO service_role;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read buildings" ON public.buildings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage buildings" ON public.buildings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.consumption_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  original_org_unit_name TEXT NOT NULL DEFAULT '',
  meter_name TEXT NOT NULL,
  meter_factor NUMERIC NOT NULL DEFAULT 1,
  variable_code TEXT NOT NULL DEFAULT '',
  variable_name TEXT NOT NULL DEFAULT '',
  variable_category TEXT NOT NULL DEFAULT '',
  interval_date DATE NOT NULL,
  half_hourly_values NUMERIC[] NOT NULL DEFAULT '{}',
  meter_display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumption_rows TO authenticated;
GRANT ALL ON public.consumption_rows TO service_role;
ALTER TABLE public.consumption_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read consumption" ON public.consumption_rows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage consumption" ON public.consumption_rows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.meter_overrides (
  raw_meter_name TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  custom_display_name TEXT,
  assigned_building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  calibrated_meter_factor NUMERIC,
  csv_original_building_id UUID,
  csv_original_meter_factor NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (raw_meter_name, organization_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_overrides TO authenticated;
GRANT ALL ON public.meter_overrides TO service_role;
ALTER TABLE public.meter_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read meter_overrides" ON public.meter_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage meter_overrides" ON public.meter_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  day TEXT NOT NULL,
  from_time TEXT NOT NULL,
  to_time TEXT NOT NULL,
  months INT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read schedules" ON public.schedules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage schedules" ON public.schedules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.schema_labels (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schema_labels TO authenticated;
GRANT ALL ON public.schema_labels TO service_role;
ALTER TABLE public.schema_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read schema_labels" ON public.schema_labels
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage schema_labels" ON public.schema_labels
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ingestion_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  scheduled_time TEXT NOT NULL DEFAULT '10:00',
  last_synced_at TIMESTAMPTZ,
  source_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingestion_settings TO authenticated;
GRANT ALL ON public.ingestion_settings TO service_role;
ALTER TABLE public.ingestion_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read ingestion_settings" ON public.ingestion_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage ingestion_settings" ON public.ingestion_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ingestion_settings (id) VALUES (1);
