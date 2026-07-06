import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { NodeConfigEntry } from "@nodebeacon/shared";

interface NodeRegistryFile {
  nodes?: NodeConfigEntry[];
}

const defaultConfigPath = fileURLToPath(
  new URL("../../../../config/nodes.example.yaml", import.meta.url)
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : []
  };
}

export async function loadNodeRegistry(configPath = defaultConfigPath): Promise<NodeConfigEntry[]> {
  const content = await readFile(configPath, "utf8");
  const parsed = parse(content) as NodeRegistryFile;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  return nodes
    .map(normalizeNode)
    .filter((node) => node.id && node.name)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}
