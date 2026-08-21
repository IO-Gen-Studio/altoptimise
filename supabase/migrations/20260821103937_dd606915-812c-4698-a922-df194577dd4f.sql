ALTER TABLE public.neutral_home_meter_categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS zone_circuit_name text;

ALTER TABLE public.neutral_home_meter_categories
  ALTER COLUMN category DROP NOT NULL;

ALTER TABLE public.neutral_home_meter_categories
  DROP CONSTRAINT IF EXISTS neutral_home_meter_categories_kind_check;

ALTER TABLE public.neutral_home_meter_categories
  ADD CONSTRAINT neutral_home_meter_categories_kind_check
  CHECK (kind IN ('zone', 'equipment', 'other'));