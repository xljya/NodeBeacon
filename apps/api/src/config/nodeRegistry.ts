import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import type { NodeBilling, NodeConfigEntry } from "@nodebeacon/shared";

interface NodeRegistryFile {
  nodes?: NodeConfigEntry[];
}

interface RegistryLogger {
  error(payload: unknown, message?: string): void;
}

const defaultConfigPath = fileURLToPath(
  new URL("../../../../config/nodes.example.yaml", import.meta.url)
);

const BACKUP_DEPTH = 3;

/**
 * Serializes every load-modify-save cycle on the registry. The app runs as a
 * single process (one replica, imagePullPolicy: Never), so an in-process
 * promise chain is a complete lock — without it, two concurrent admin writes
 * both read the same file and the second save silently drops the first.
 */
let registryQueue: Promise<unknown> = Promise.resolve();

export function withRegistryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = registryQueue.then(fn, fn);
  registryQueue = run.catch(() => undefined);
  return run;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return Boolean(value);
}

function normalizeBilling(raw: unknown): NodeBilling | undefined {
  if (!isRecord(raw)) return undefined;
  const billing: NodeBilling = {};
  const price = finiteNumber(raw.price);
  const cycleDays = finiteNumber(raw.cycleDays ?? raw.billing_cycle);
  const currency = optionalString(raw.currency);
  const expiresAt = optionalString(raw.expiresAt ?? raw.expired_at);
  const autoRenewal = optionalBoolean(raw.autoRenewal ?? raw.auto_renewal);

  if (price !== undefined) billing.price = price;
  if (currency) billing.currency = currency;
  if (cycleDays !== undefined) billing.cycleDays = cycleDays;
  if (expiresAt) billing.expiresAt = expiresAt;
  if (autoRenewal !== undefined) billing.autoRenewal = autoRenewal;

  return Object.keys(billing).length > 0 ? billing : undefined;
}

function normalizeNode(raw: unknown): NodeConfigEntry {
  if (!isRecord(raw)) {
    throw new Error("Each node entry must be an object.");
  }

  const labels = isRecord(raw.labels) ? Object.fromEntries(
    Object.entries(raw.labels).map(([key, value]) => [key, String(value)])
  ) : {};

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? raw.id ?? ""),
    provider: String(raw.provider ?? "unknown"),
    group: String(raw.group ?? "default"),
    region: String(raw.region ?? "unknown"),
    location: raw.location ? String(raw.location) : undefined,
    displayOrder: Number(raw.displayOrder ?? 999),
    public: Boolean(raw.public ?? true),
    labels,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    ipAddress: optionalString(raw.ipAddress ?? raw.ipv4 ?? raw.ip),
    clientVersion: optionalString(raw.clientVersion ?? raw.version),
    privateNotes: optionalString(raw.privateNotes ?? raw.remark),
    billing: normalizeBilling(raw.billing)
  };
}

function sortNodes(nodes: NodeConfigEntry[]): NodeConfigEntry[] {
  return [...nodes].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

function parseRegistryContent(content: string): NodeConfigEntry[] {
  const parsed = parse(content) as NodeRegistryFile;
  const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  return sortNodes(nodes
    .map(normalizeNode)
    .filter((node) => node.id && node.name));
}

/**
 * Loads the runtime registry file, falling back to the read-only seed when the
 * runtime file is missing OR unparseable. A corrupt /data/nodes.yaml must
 * degrade to the ConfigMap seed instead of taking the public status page down.
 */
export async function loadNodeRegistry(
  configPath = defaultConfigPath,
  seedPath?: string,
  logger?: RegistryLogger
): Promise<NodeConfigEntry[]> {
  let primaryError: unknown;
  try {
    return parseRegistryContent(await readFile(configPath, "utf8"));
  } catch (error) {
    primaryError = error;
  }

  if (!seedPath) throw primaryError;
  logger?.error(
    { error: primaryError, configPath, seedPath },
    "node registry file is missing or corrupt; falling back to the seed file"
  );
  try {
    return parseRegistryContent(await readFile(seedPath, "utf8"));
  } catch {
    throw primaryError;
  }
}

/** Shifts nodes.yaml.bak.1..N up one slot and snapshots the current file as .bak.1. */
async function rotateBackups(configPath: string): Promise<void> {
  for (let index = BACKUP_DEPTH - 1; index >= 1; index -= 1) {
    await rename(`${configPath}.bak.${index}`, `${configPath}.bak.${index + 1}`).catch(() => undefined);
  }
  await copyFile(configPath, `${configPath}.bak.1`).catch(() => undefined);
}

/**
 * Persists the registry atomically: write to a temp file, then rename over the
 * target (atomic on the same filesystem), so a crash mid-write can never leave
 * a half-written nodes.yaml behind. The previous file is kept as .bak.1..3.
 */
export async function saveNodeRegistry(
  nodes: NodeConfigEntry[],
  configPath = defaultConfigPath
): Promise<NodeConfigEntry[]> {
  const sorted = sortNodes(nodes);
  const content = stringify({ nodes: sorted }, { lineWidth: 0 });
  await mkdir(dirname(configPath), { recursive: true });
  await rotateBackups(configPath);
  const tmpPath = `${configPath}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, configPath);
  return sorted;
}
