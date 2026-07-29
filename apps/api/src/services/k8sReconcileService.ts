import { readFile } from "node:fs/promises";
import type { SqliteDatabase } from "./database.js";

const PROBE_BY_PROTOCOL = { http: "nodebeacon-managed-http", tcp: "nodebeacon-managed-tcp", icmp: "nodebeacon-managed-icmp" } as const;

export async function reconcileManagedProbes(db: SqliteDatabase, logger?: { warn: (message: string, details?: unknown) => void }): Promise<boolean> {
  const host = process.env.KUBERNETES_SERVICE_HOST; const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? "443";
  if (!host) return false;
  let token: string;
  try { token = (await readFile("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8")).trim(); } catch { return false; }
  const ca = await readFile("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt").catch(() => undefined);
  const rows = db.prepare("SELECT protocol,target FROM latency_tasks WHERE enabled = 1 ORDER BY created_at").all() as Array<{ protocol: keyof typeof PROBE_BY_PROTOCOL; target: string }>;
  for (const protocol of Object.keys(PROBE_BY_PROTOCOL) as Array<keyof typeof PROBE_BY_PROTOCOL>) {
    const targets = rows.filter((row) => row.protocol === protocol).map((row) => row.target).slice(0, 100);
    const resource = PROBE_BY_PROTOCOL[protocol];
    try {
      const response = await fetch(`https://${host}:${port}/apis/monitoring.coreos.com/v1/namespaces/nodebeacon/probes/${resource}`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/merge-patch+json" }, body: JSON.stringify({ spec: { targets: { staticConfig: { static: targets } } } }), ...(ca ? { dispatcher: undefined } : {}) } as RequestInit);
      if (!response.ok) throw new Error(`Kubernetes returned ${response.status}`);
    } catch (error) { logger?.warn("managed probe reconcile failed", error); return false; }
  }
  return true;
}
