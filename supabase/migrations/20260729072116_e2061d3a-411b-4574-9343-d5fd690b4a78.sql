-- 1. Sync logs: managers only
DROP POLICY IF EXISTS "sync log readable" ON public.energy_price_sync_log;
CREATE POLICY "sync log readable" ON public.energy_price_sync_log
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

-- 2. Ingestion settings: managers only
DROP POLICY IF EXISTS "read ingestion_settings" ON public.ingestion_settings;
CREATE POLICY "read ingestion_settings" ON public.ingestion_settings
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

-- 3. Energy unit rates: only users attached to an organisation
DROP POLICY IF EXISTS "rates readable" ON public.energy_unit_rates;
CREATE POLICY "rates readable" ON public.energy_unit_rates
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_organisations uo WHERE uo.user_id = auth.uid())
  );

-- 4. Schema labels: only users attached to an organisation
DROP POLICY IF EXISTS "read schema_labels" ON public.schema_labels;
CREATE POLICY "read schema_labels" ON public.schema_labels
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_organisations uo WHERE uo.user_id = auth.uid())
  );

-- 5. Profiles: self-insert only
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- 6. Harden SECURITY DEFINER helpers so signed-in users can only ask about themselves
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.has_role(_user_id, 'super_admin') OR public.has_role(_user_id, 'admin')
  END
$$;

CREATE OR REPLACE FUNCTION public.can_access_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.has_role(_user_id, 'super_admin') OR EXISTS (
      SELECT 1 FROM public.user_organisations
       WHERE user_id = _user_id AND organization_id = _org_id
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.has_role(_user_id, 'super_admin') OR (
      public.has_role(_user_id, 'admin') AND EXISTS (
        SELECT 1 FROM public.user_organisations
         WHERE user_id = _user_id AND organization_id = _org_id
      )
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_meter_registry_cache_one(uuid, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon;