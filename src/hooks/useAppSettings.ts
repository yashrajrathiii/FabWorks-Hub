import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AppSettings {
  labour_per_month: number;
  elec_per_month: number;
  throughput_kg: number;
}

export const defaultSettings: AppSettings = {
  labour_per_month: 250000,
  elec_per_month: 20000,
  throughput_kg: 4000,
};

export function useAppSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    queryFn: async (): Promise<AppSettings> => {
      if (!isSupabaseConfigured) return defaultSettings;
      const { data, error } = await supabase
        .from("app_settings")
        .select("labour_per_month, elec_per_month, throughput_kg")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return {
        labour_per_month: Number(data.labour_per_month),
        elec_per_month: Number(data.elec_per_month),
        throughput_kg: Number(data.throughput_kg),
      };
    },
  });
}

export function useSaveAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: AppSettings) => {
      const { error } = await supabase.from("app_settings").upsert({ id: 1, ...settings });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
