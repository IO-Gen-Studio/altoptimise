
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS tariff_electricity_pence_per_kwh numeric,
  ADD COLUMN IF NOT EXISTS tariff_gas_pence_per_kwh numeric,
  ADD COLUMN IF NOT EXISTS tariff_water_pence_per_m3 numeric,
  ADD COLUMN IF NOT EXISTS co2_factor_electricity_kg_per_kwh numeric,
  ADD COLUMN IF NOT EXISTS co2_factor_gas_kg_per_kwh numeric,
  ADD COLUMN IF NOT EXISTS co2_factor_water_kg_per_m3 numeric;
