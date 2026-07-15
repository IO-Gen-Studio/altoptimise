
CREATE TABLE public.ingestion_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '10:00',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  last_rows_imported INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingestion_schedules TO authenticated;
GRANT ALL ON public.ingestion_schedules TO service_role;

ALTER TABLE public.ingestion_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ingestion_schedules"
  ON public.ingestion_schedules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage ingestion_schedules"
  ON public.ingestion_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_ingestion_schedules() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_ingestion_schedules
  BEFORE UPDATE ON public.ingestion_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_ingestion_schedules();
