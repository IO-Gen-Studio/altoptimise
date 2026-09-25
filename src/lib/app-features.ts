import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { APPS } from "./launcher-context";

/** Background process feature keys that are not mini-apps. */
export const SCHEDULED_INGESTION_KEY = "scheduled-ingestion";

export interface FeatureDefinition {
  key: string;
  name: string;
  detail: string;
}

/** Everything a super admin can switch on/off system-wide. */
export const FEATURES: FeatureDefinition[] = [
  ...APPS.map((a) => ({ key: a.slug, name: a.name, detail: a.tagline })),
  {
    key: SCHEDULED_INGESTION_KEY,
    name: "Automated scheduled uploads",
    detail: "Background checker that imports data files on a schedule",
  },
];

export type FeatureMap = Record<string, boolean>;

const QUERY_KEY = ["app-features"];

async function fetchFeatures(): Promise<FeatureMap> {
  const { data, error } = await supabase
    .from("app_features")
    .select("feature_key, enabled");
  if (error) throw error;
  const map: FeatureMap = {};
  for (const row of data ?? []) map[row.feature_key] = row.enabled;
  return map;
}

/** Reads the system-wide on/off state. Anything without a row defaults to on. */
export function useAppFeatures() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchFeatures,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("app_features")
        .upsert(
          { feature_key: key, enabled, updated_by: auth.user?.id ?? null },
          { onConflict: "feature_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const features = query.data ?? {};

  return {
    features,
    isLoading: query.isLoading,
    isEnabled: (key: string) => features[key] !== false,
    setEnabled: (key: string, enabled: boolean) => mutation.mutateAsync({ key, enabled }),
    isSaving: mutation.isPending,
  };
}
