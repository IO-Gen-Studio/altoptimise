CREATE TABLE public.app_features (
  feature_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.app_features TO authenticated;
GRANT INSERT, UPDATE ON public.app_features TO authenticated;
GRANT ALL ON public.app_features TO service_role;

ALTER TABLE public.app_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read app features"
  ON public.app_features FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can insert app features"
  ON public.app_features FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update app features"
  ON public.app_features FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.set_app_features_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_features_updated_at
  BEFORE UPDATE ON public.app_features
  FOR EACH ROW EXECUTE FUNCTION public.set_app_features_updated_at();

CREATE OR REPLACE FUNCTION public.is_feature_enabled(_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT enabled FROM public.app_features WHERE feature_key = _key), true);
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text) TO authenticated, service_role;