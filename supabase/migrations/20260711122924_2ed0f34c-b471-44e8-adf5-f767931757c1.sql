
-- Extend organisations with profile template + season/holiday defaults
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'office',
  ADD COLUMN IF NOT EXISTS active_from time NOT NULL DEFAULT '08:30',
  ADD COLUMN IF NOT EXISTS active_to time NOT NULL DEFAULT '17:30',
  ADD COLUMN IF NOT EXISTS active_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS peak_season_months int[] NOT NULL DEFAULT ARRAY[]::int[],
  ADD COLUMN IF NOT EXISTS summer_gas_months int[] NOT NULL DEFAULT ARRAY[5,6,7,8,9],
  ADD COLUMN IF NOT EXISTS holidays date[] NOT NULL DEFAULT ARRAY[]::date[],
  ADD COLUMN IF NOT EXISTS completeness_missing_pct numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS completeness_flatline_hours numeric NOT NULL DEFAULT 24;

ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_profile_type_check;
ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_profile_type_check
  CHECK (profile_type IN ('office','retail','evening_peak'));

-- Extend buildings with schedule override flag
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS schedule_override_enabled boolean NOT NULL DEFAULT false;
