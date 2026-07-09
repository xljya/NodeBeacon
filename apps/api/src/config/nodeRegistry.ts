import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import type { NodeBilling, NodeConfigEntry } from "@nodebeacon/shared";

interface NodeRegistryFile {
  nodes?: NodeConfigEntry[];
}

const defaultConfigPath = fileURLToPath(
  new URL("../../../../config/nodes.example.yaml", import.meta.url)
);

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

async function readRegistryFile(configPath: string, seedPath?: string): Promise<string> {
  try {
    return await readFile(configPath, "utf8");
  } catch (error) {
    if (!seedPath) throw error;
    try {
      return await readFile(seedPath, "utf8");
    } catch {
      throw error;
    }
  }
}

export async function loadNodeRegistry(
  configPath = defaultConfigPath,
  seedPath?: string
): Promise<NodeConfigEntry[]> {
  const content = await readRegistryFile(configPath, seedPath);
  const parsed = parse(content) as NodeRegistryFile;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  return sortNodes(nodes
    .map(normalizeNode)
    .filter((node) => node.id && node.name));
}

export async function saveNodeRegistry(
  nodes: NodeConfigEntry[],
  configPath = defaultConfigPath
): Promise<NodeConfigEntry[]> {
  const sorted = sortNodes(nodes);
  const content = stringify({ nodes: sorted }, { lineWidth: 0 });
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, content, "utf8");
  return sorted;
}
