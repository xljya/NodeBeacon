import { useCallback, useEffect, useState } from "react";
import i18n from "../i18n/config";
import { apiGet } from "./api";

export interface ApiHookState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Fetch a read-only admin endpoint with loading/error state and manual reload. */
export function useApi<T>(path: string): ApiHookState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<T>(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
