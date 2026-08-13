import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Agent, fetch as undiciFetch } from "undici";
import type { SqliteDatabase } from "./database.js";
import { groupManagedProbeTargets, MANAGED_PROBE_RESOURCES, type ManagedProbeFamily } from "./managedProbes.js";

const DEFAULT_SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

export function createKubernetesDispatcher(ca: Buffer): Agent {
  return new Agent({ connect: { ca } });
}

export async function kubernetesPatch(
  url: string,
  token: string,
  body: unknown,
  ca?: Buffer
): Promise<{ ok: boolean; status: number }> {
  const dispatcher = ca ? createKubernetesDispatcher(ca) : undefined;
  try {
    const response = await undiciFetch(url, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/merge-patch+json"
      },
      body: JSON.stringify(body),
      dispatcher
    });
    return { ok: response.ok, status: response.status };
  } finally {
    await dispatcher?.close();
  }
}

export async function reconcileManagedProbes(db: SqliteDatabase, logger?: { warn: (message: string, details?: unknown) => void }): Promise<boolean> {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? "443";
  if (!host) return false;
  const directory = process.env.KUBERNETES_SERVICEACCOUNT_DIR ?? DEFAULT_SERVICE_ACCOUNT_DIR;
  let token: string;
  try {
    token = (await readFile(join(directory, "token"), "utf8")).trim();
  } catch {
    return false;
  }
  const ca = await readFile(join(directory, "ca.crt")).catch(() => undefined);
  const rows = db.prepare("SELECT protocol,target FROM latency_tasks WHERE enabled = 1 ORDER BY created_at").all() as Array<{ protocol: string; target: string }>;
  const grouped = groupManagedProbeTargets(rows);
  for (const family of Object.keys(MANAGED_PROBE_RESOURCES) as ManagedProbeFamily[]) {
    const targets = grouped[family];
    const resource = MANAGED_PROBE_RESOURCES[family];
    const url = `https://${host}:${port}/apis/monitoring.coreos.com/v1/namespaces/nodebeacon/probes/${resource}`;
    try {
      const response = await kubernetesPatch(url, token, { spec: { targets: { staticConfig: { static: targets } } } }, ca);
      if (!response.ok) throw new Error(`Kubernetes returned ${response.status}`);
    } catch (error) {
      logger?.warn("managed probe reconcile failed", error);
      return false;
    }
  }
  return true;
}
