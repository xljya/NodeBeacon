import { useCallback, useEffect, useState } from "react";
import { adminGet, AdminGatewayError } from "@/lib/adminGateway";

export function useAdminResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await adminGet<T>(path);
      setData(next);
      setError(null);
    } catch (err) {
      if (err instanceof AdminGatewayError && (err.status === 401 || err.status === 403)) {
        return;
      }
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
