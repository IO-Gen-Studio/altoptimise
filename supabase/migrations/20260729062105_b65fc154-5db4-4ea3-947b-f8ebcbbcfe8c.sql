-- Reference regions
CREATE TABLE public.agile_regions (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.agile_regions TO authenticated;
GRANT ALL ON public.agile_regions TO service_role;
ALTER TABLE public.agile_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regions readable" ON public.agile_regions FOR SELECT TO authenticated USING (true);

INSERT INTO public.agile_regions (code, name, sort_order) VALUES
  ('A','Eastern England',1),
  ('B','East Midlands',2),
  ('C','London',3),
  ('D','Merseyside & North Wales',4),
  ('E','West Midlands',5),
  ('F','North East England',6),
  ('G','North West England',7),
  ('H','Southern England',8),
  ('J','South East England',9),
  ('K','South Wales',10),
  ('L','South West England',11),
  ('M','Yorkshire',12),
  ('N','Southern Scotland',13),
  ('P','Northern Scotland',14);

-- Unit rates store
CREATE TABLE public.energy_unit_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  region_code text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  value_inc_vat numeric NOT NULL,
  value_exc_vat numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_code, region_code, valid_from)
);
CREATE INDEX idx_energy_unit_rates_lookup ON public.energy_unit_rates (region_code, product_code, valid_from);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.energy_unit_rates TO authenticated;
GRANT ALL ON public.energy_unit_rates TO service_role;
ALTER TABLE public.energy_unit_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates readable" ON public.energy_unit_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "rates manageable" ON public.energy_unit_rates FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_pricing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER touch_energy_unit_rates BEFORE UPDATE ON public.energy_unit_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_pricing();

-- Sync log
CREATE TABLE public.energy_price_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  region_code text NOT NULL,
  rows_written integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.energy_price_sync_log TO authenticated;
GRANT ALL ON public.energy_price_sync_log TO service_role;
ALTER TABLE public.energy_price_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync log readable" ON public.energy_price_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync log manageable" ON public.energy_price_sync_log FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER touch_energy_price_sync_log BEFORE UPDATE ON public.energy_price_sync_log
  FOR EACH ROW EXECUTE FUNCTION public.touch_pricing();

-- Region assignment
ALTER TABLE public.buildings ADD COLUMN gsp_region_code text;
ALTER TABLE public.organisations ADD COLUMN default_gsp_region_code text;
ALTER TABLE public.organisations ADD COLUMN shiftable_load_pct numeric NOT NULL DEFAULT 20;