/**
 * Server-side check for the system-wide app on/off switch.
 * Anything without a row is treated as switched on.
 */
export async function isFeatureEnabledServer(key: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_features")
    .select("enabled")
    .eq("feature_key", key)
    .maybeSingle();
  if (error) return true;
  if (!data) return true;
  return data.enabled !== false;
}
