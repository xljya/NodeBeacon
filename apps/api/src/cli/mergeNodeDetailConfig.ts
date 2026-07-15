import { copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { NodeConfigEntry } from "@nodebeacon/shared";
import { loadNodeRegistry, saveNodeRegistry } from "../config/nodeRegistry.js";

interface Options {
  target: string;
  seed: string;
  apply: boolean;
}

function parseArgs(argv: string[]): Options {
  let target = "";
  let seed = "";
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") target = argv[++index] ?? "";
    else if (arg === "--seed") seed = argv[++index] ?? "";
    else if (arg === "--apply") apply = true;
    else if (arg === "--check") {
      // Check is the safe default; it is intentionally a no-op flag.
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!target || !seed) throw new Error("Usage: mergeNodeDetailConfig --target <runtime.yaml> --seed <seed.yaml> [--check|--apply]");
  if (target === seed) throw new Error("target and seed must be different files.");
  return { target, seed, apply };
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function mergeDetails(target: NodeConfigEntry[], seed: NodeConfigEntry[]): { nodes: NodeConfigEntry[]; changes: string[] } {
  const seedById = new Map(seed.map((node) => [node.id, node]));
  const targetIds = new Set(target.map((node) => node.id));
  const changes: string[] = [];
  const nodes = target.map((node) => {
    const seedNode = seedById.get(node.id);
    if (!seedNode?.detail) {
      changes.push(`${node.id}: unchanged (seed has no detail)`);
      return node;
    }
    if (stable(node.detail) === stable(seedNode.detail)) {
      changes.push(`${node.id}: unchanged`);
      return node;
    }
    changes.push(`${node.id}: detail ${node.detail ? "updated" : "added"}`);
    return { ...node, detail: seedNode.detail };
  });
  for (const seedNode of seed) {
    if (!targetIds.has(seedNode.id) && seedNode.detail) {
      changes.push(`${seedNode.id}: skipped (seed node is not in runtime registry)`);
    }
  }
  return { nodes, changes };
}

export async function mergeNodeDetailConfig(options: Options): Promise<{ changed: boolean; changes: string[] }> {
  const [target, seed] = await Promise.all([
    loadNodeRegistry(options.target),
    loadNodeRegistry(options.seed)
  ]);
  const result = mergeDetails(target, seed);
  const changed = result.nodes.some((node, index) => stable(node.detail) !== stable(target[index]?.detail));
  for (const line of result.changes) console.log(line);
  if (!options.apply || !changed) return { changed, changes: result.changes };

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  await copyFile(options.target, `${options.target}.pre-detail-v2-${stamp}`);
  await saveNodeRegistry(result.nodes, options.target);
  console.log(`applied: ${options.target}`);
  return { changed, changes: result.changes };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  try {
    await mergeNodeDetailConfig(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
