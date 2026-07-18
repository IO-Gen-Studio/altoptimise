
-- 1. Drop dependent policies
DROP POLICY IF EXISTS "Admins read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage organisations" ON public.organisations;
DROP POLICY IF EXISTS "Authenticated read organisations" ON public.organisations;
DROP POLICY IF EXISTS "Admins manage buildings" ON public.buildings;
DROP POLICY IF EXISTS "Authenticated read buildings" ON public.buildings;
DROP POLICY IF EXISTS "Admins manage consumption" ON public.consumption_rows;
DROP POLICY IF EXISTS "Authenticated read consumption" ON public.consumption_rows;
DROP POLICY IF EXISTS "Admins manage meter_overrides" ON public.meter_overrides;
DROP POLICY IF EXISTS "Authenticated read meter_overrides" ON public.meter_overrides;
DROP POLICY IF EXISTS "Admins manage schedules" ON public.schedules;
DROP POLICY IF EXISTS "Authenticated read schedules" ON public.schedules;
DROP POLICY IF EXISTS "Admins manage schema_labels" ON public.schema_labels;
DROP POLICY IF EXISTS "Authenticated read schema_labels" ON public.schema_labels;
DROP POLICY IF EXISTS "Admins manage ingestion_settings" ON public.ingestion_settings;
DROP POLICY IF EXISTS "Authenticated read ingestion_settings" ON public.ingestion_settings;
DROP POLICY IF EXISTS "Admins manage ingestion_schedules" ON public.ingestion_schedules;
DROP POLICY IF EXISTS "Authenticated read ingestion_schedules" ON public.ingestion_schedules;
DROP POLICY IF EXISTS "Profiles are readable by authenticated" ON public.profiles;

-- 2. Recreate app_role enum
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP TYPE public.app_role;
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

UPDATE public.user_roles SET role = 'user'
 WHERE role NOT IN ('super_admin','admin','user');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

UPDATE public.user_roles
   SET role = 'super_admin'
 WHERE user_id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
   AND role = 'admin';

-- 3. New membership + app access tables (create before helper functions)
CREATE TABLE public.user_organisations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_organisations TO authenticated;
GRANT ALL ON public.user_organisations TO service_role;
ALTER TABLE public.user_organisations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_app_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_slug)
);
GRANT SELECT, INSERT, DELETE ON public.user_app_access TO authenticated;
GRANT ALL ON public.user_app_access TO service_role;
ALTER TABLE public.user_app_access ENABLE ROW LEVEL SECURITY;

-- 4. Helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin') OR public.has_role(_user_id, 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin') OR EXISTS (
    SELECT 1 FROM public.user_organisations
     WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_access_org(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin') OR (
    public.has_role(_user_id, 'admin') AND EXISTS (
      SELECT 1 FROM public.user_organisations
       WHERE user_id = _user_id AND organization_id = _org_id
    )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid, uuid) TO authenticated;

-- 5. Policies on new tables
CREATE POLICY "read memberships" ON public.user_organisations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager(auth.uid()));
CREATE POLICY "managers insert memberships" ON public.user_organisations
  FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "managers delete memberships" ON public.user_organisations
  FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

CREATE POLICY "read app access" ON public.user_app_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager(auth.uid()));
CREATE POLICY "managers insert app access" ON public.user_app_access
  FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "managers delete app access" ON public.user_app_access
  FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

-- 6. user_roles + profiles policies
CREATE POLICY "read roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager(auth.uid()));
CREATE POLICY "managers insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "managers update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "managers delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

CREATE POLICY "read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_manager(auth.uid()));
CREATE POLICY "managers update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 7. Data policies scoped by org
CREATE POLICY "read organisations" ON public.organisations
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), id));
CREATE POLICY "super_admin insert organisations" ON public.organisations
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "manage organisations" ON public.organisations
  FOR UPDATE TO authenticated
  USING (public.can_manage_org(auth.uid(), id))
  WITH CHECK (public.can_manage_org(auth.uid(), id));
CREATE POLICY "super_admin delete organisations" ON public.organisations
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "read buildings" ON public.buildings
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage buildings" ON public.buildings
  FOR ALL TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

CREATE POLICY "read consumption" ON public.consumption_rows
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage consumption" ON public.consumption_rows
  FOR ALL TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

CREATE POLICY "read meter_overrides" ON public.meter_overrides
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage meter_overrides" ON public.meter_overrides
  FOR ALL TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

CREATE POLICY "read ingestion_schedules" ON public.ingestion_schedules
  FOR SELECT TO authenticated USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage ingestion_schedules" ON public.ingestion_schedules
  FOR ALL TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));

CREATE POLICY "read schedules" ON public.schedules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.buildings b
                  WHERE b.id = schedules.building_id
                    AND public.can_access_org(auth.uid(), b.organization_id)));
CREATE POLICY "manage schedules" ON public.schedules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.buildings b
                  WHERE b.id = schedules.building_id
                    AND public.can_manage_org(auth.uid(), b.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.buildings b
                       WHERE b.id = schedules.building_id
                         AND public.can_manage_org(auth.uid(), b.organization_id)));

CREATE POLICY "read schema_labels" ON public.schema_labels
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage schema_labels" ON public.schema_labels
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "read ingestion_settings" ON public.ingestion_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage ingestion_settings" ON public.ingestion_settings
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 8. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count int;
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'super_admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
