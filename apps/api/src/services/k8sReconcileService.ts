import { readFile } from "node:fs/promises";
import type { SqliteDatabase } from "./database.js";
import { groupManagedProbeTargets, MANAGED_PROBE_RESOURCES, type ManagedProbeFamily } from "./managedProbes.js";

export async function reconcileManagedProbes(db: SqliteDatabase, logger?: { warn: (message: string, details?: unknown) => void }): Promise<boolean> {
  const host = process.env.KUBERNETES_SERVICE_HOST; const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? "443";
  if (!host) return false;
  let token: string;
  try { token = (await readFile("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8")).trim(); } catch { return false; }
  const ca = await readFile("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt").catch(() => undefined);
  const rows = db.prepare("SELECT protocol,target FROM latency_tasks WHERE enabled = 1 ORDER BY created_at").all() as Array<{ protocol: string; target: string }>;
  const grouped = groupManagedProbeTargets(rows);
  for (const family of Object.keys(MANAGED_PROBE_RESOURCES) as ManagedProbeFamily[]) {
    const targets = grouped[family];
    const resource = MANAGED_PROBE_RESOURCES[family];
    try {
      const response = await fetch(`https://${host}:${port}/apis/monitoring.coreos.com/v1/namespaces/nodebeacon/probes/${resource}`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/merge-patch+json" }, body: JSON.stringify({ spec: { targets: { staticConfig: { static: targets } } } }), ...(ca ? { dispatcher: undefined } : {}) } as RequestInit);
      if (!response.ok) throw new Error(`Kubernetes returned ${response.status}`);
    } catch (error) { logger?.warn("managed probe reconcile failed", error); return false; }
  }
  return true;
}
