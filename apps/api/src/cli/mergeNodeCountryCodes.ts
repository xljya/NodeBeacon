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
    else if (arg !== "--check") throw new Error(`Unknown argument: ${arg}`);
  }
  if (!target || !seed) throw new Error("Usage: mergeNodeCountryCodes --target <runtime.yaml> --seed <seed.yaml> [--check|--apply]");
  if (target === seed) throw new Error("target and seed must be different files.");
  return { target, seed, apply };
}

function mergeCountryCodes(target: NodeConfigEntry[], seed: NodeConfigEntry[]): { nodes: NodeConfigEntry[]; changes: string[] } {
  const seedById = new Map(seed.map((node) => [node.id, node]));
  const changes: string[] = [];
  const nodes = target.map((node) => {
    const countryCode = seedById.get(node.id)?.countryCode;
    if (!countryCode || (node.countryCode === countryCode && node.location === seedById.get(node.id)?.location)) {
      changes.push(`${node.id}: unchanged`);
      return node;
    }
    changes.push(`${node.id}: country metadata updated`);
    return { ...node, countryCode, location: seedById.get(node.id)?.location };
  });
  return { nodes, changes };
}

export async function mergeNodeCountryCodes(options: Options): Promise<{ changed: boolean; changes: string[] }> {
  const [target, seed] = await Promise.all([
    loadNodeRegistry(options.target),
    loadNodeRegistry(options.seed)
  ]);
  const result = mergeCountryCodes(target, seed);
  const changed = result.nodes.some((node, index) =>
    node.countryCode !== target[index]?.countryCode || node.location !== target[index]?.location
  );
  for (const line of result.changes) console.log(line);
  if (!options.apply || !changed) return { changed, changes: result.changes };

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  await copyFile(options.target, `${options.target}.pre-country-code-${stamp}`);
  await saveNodeRegistry(result.nodes, options.target);
  console.log(`applied: ${options.target}`);
  return { changed, changes: result.changes };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  try {
    await mergeNodeCountryCodes(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
