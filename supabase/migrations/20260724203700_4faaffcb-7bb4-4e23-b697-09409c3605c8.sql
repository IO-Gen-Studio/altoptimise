
-- 1) Categories reference table
CREATE TABLE public.sustainability_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  scope smallint NOT NULL DEFAULT 3,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.sustainability_categories TO authenticated;
GRANT ALL ON public.sustainability_categories TO service_role;
ALTER TABLE public.sustainability_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read categories" ON public.sustainability_categories FOR SELECT TO authenticated USING (true);

INSERT INTO public.sustainability_categories (code, name, scope, sort_order) VALUES
  ('s3_1_purchased_goods', 'Purchased goods & services', 3, 1),
  ('s3_2_capital_goods', 'Capital goods', 3, 2),
  ('s3_3_fuel_energy', 'Fuel- and energy-related activities', 3, 3),
  ('s3_4_upstream_transport', 'Upstream transportation & distribution', 3, 4),
  ('s3_5_waste', 'Waste generated in operations', 3, 5),
  ('s3_6_business_travel', 'Business travel', 3, 6),
  ('s3_7_commuting', 'Employee commuting', 3, 7),
  ('s3_8_upstream_leased', 'Upstream leased assets', 3, 8),
  ('s3_9_downstream_transport', 'Downstream transportation & distribution', 3, 9),
  ('s3_10_processing', 'Processing of sold products', 3, 10),
  ('s3_11_use_of_products', 'Use of sold products', 3, 11),
  ('s3_12_eol', 'End-of-life treatment of sold products', 3, 12),
  ('s3_13_downstream_leased', 'Downstream leased assets', 3, 13),
  ('s3_14_franchises', 'Franchises', 3, 14),
  ('s3_15_investments', 'Investments', 3, 15);

-- 2) Items catalogue (presets + org custom)
CREATE TABLE public.sustainability_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.sustainability_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  unit text NOT NULL,
  emission_factor numeric(14,6) NOT NULL,
  factor_source text,
  is_preset boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sust_items_org ON public.sustainability_items (organization_id);
CREATE INDEX idx_sust_items_cat ON public.sustainability_items (category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sustainability_items TO authenticated;
GRANT ALL ON public.sustainability_items TO service_role;
ALTER TABLE public.sustainability_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read items" ON public.sustainability_items FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage items" ON public.sustainability_items FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "update items" ON public.sustainability_items FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "delete items" ON public.sustainability_items FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.can_manage_org(auth.uid(), organization_id));

-- Seed presets (organization_id NULL = global preset visible to all)
INSERT INTO public.sustainability_items (organization_id, category_id, name, unit, emission_factor, factor_source, is_preset)
SELECT NULL, c.id, x.name, x.unit, x.factor, 'UK DEFRA 2024', true
FROM public.sustainability_categories c
JOIN (VALUES
  ('s3_6_business_travel', 'Car — average petrol', 'km', 0.170),
  ('s3_6_business_travel', 'Car — average diesel', 'km', 0.168),
  ('s3_6_business_travel', 'Car — electric', 'km', 0.048),
  ('s3_6_business_travel', 'Rail — national', 'km', 0.035),
  ('s3_6_business_travel', 'Flight — short haul economy', 'km', 0.151),
  ('s3_6_business_travel', 'Flight — long haul economy', 'km', 0.148),
  ('s3_6_business_travel', 'Taxi', 'km', 0.150),
  ('s3_6_business_travel', 'Hotel stay (UK)', 'night', 10.400),
  ('s3_5_waste', 'General waste to landfill', 'kg', 0.458),
  ('s3_5_waste', 'Mixed recycling', 'kg', 0.021),
  ('s3_5_waste', 'Food waste (composted)', 'kg', 0.011),
  ('s3_1_purchased_goods', 'Paper (office)', 'kg', 0.919),
  ('s3_1_purchased_goods', 'Purchased goods (spend-based £)', 'gbp', 0.350),
  ('s3_7_commuting', 'Commuting — car average', 'km', 0.170),
  ('s3_7_commuting', 'Commuting — bus', 'km', 0.102)
) AS x(cat_code, name, unit, factor) ON c.code = x.cat_code;

-- 3) Entries ledger
CREATE TABLE public.sustainability_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.sustainability_items(id) ON DELETE RESTRICT,
  entry_date date NOT NULL,
  quantity numeric(16,4) NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sust_entries_org_date ON public.sustainability_entries (organization_id, entry_date DESC);
CREATE INDEX idx_sust_entries_item ON public.sustainability_entries (item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sustainability_entries TO authenticated;
GRANT ALL ON public.sustainability_entries TO service_role;
ALTER TABLE public.sustainability_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read entries" ON public.sustainability_entries FOR SELECT TO authenticated
  USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "insert entries" ON public.sustainability_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_access_org(auth.uid(), organization_id) AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "update own or manager entries" ON public.sustainability_entries FOR UPDATE TO authenticated
  USING (public.can_access_org(auth.uid(), organization_id) AND (created_by = auth.uid() OR public.can_manage_org(auth.uid(), organization_id)))
  WITH CHECK (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "delete own or manager entries" ON public.sustainability_entries FOR DELETE TO authenticated
  USING (public.can_access_org(auth.uid(), organization_id) AND (created_by = auth.uid() OR public.can_manage_org(auth.uid(), organization_id)));

-- 4) Targets
CREATE TABLE public.sustainability_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  scope smallint NOT NULL CHECK (scope IN (1, 2, 3, 0)),
  category_id uuid REFERENCES public.sustainability_categories(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_tco2e numeric(14,3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sust_targets_org ON public.sustainability_targets (organization_id, period_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sustainability_targets TO authenticated;
GRANT ALL ON public.sustainability_targets TO service_role;
ALTER TABLE public.sustainability_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read targets" ON public.sustainability_targets FOR SELECT TO authenticated
  USING (public.can_access_org(auth.uid(), organization_id));
CREATE POLICY "manage targets" ON public.sustainability_targets FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "update targets" ON public.sustainability_targets FOR UPDATE TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id))
  WITH CHECK (public.can_manage_org(auth.uid(), organization_id));
CREATE POLICY "delete targets" ON public.sustainability_targets FOR DELETE TO authenticated
  USING (public.can_manage_org(auth.uid(), organization_id));

-- 5) updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_sustainability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_sust_items BEFORE UPDATE ON public.sustainability_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();
CREATE TRIGGER trg_touch_sust_entries BEFORE UPDATE ON public.sustainability_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();
CREATE TRIGGER trg_touch_sust_targets BEFORE UPDATE ON public.sustainability_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_sustainability();
