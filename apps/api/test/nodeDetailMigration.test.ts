import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadNodeRegistry } from "../src/config/nodeRegistry.js";
import { mergeNodeDetailConfig } from "../src/cli/mergeNodeDetailConfig.js";

describe("node detail registry migration", () => {
  it("supports check, applies only detail, creates a backup, and is idempotent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodebeacon-detail-migration-"));
    const target = join(dir, "nodes.yaml");
    const seed = join(dir, "nodes.seed.yaml");
    await writeFile(target, [
      "nodes:",
      "  - id: rs1000",
      "    name: RS1000",
      "    provider: netcup",
      "    group: Core",
      "    region: EU",
      "    displayOrder: 10",
      "    public: true",
      "    labels:",
      "      job: node-exporter",
      "    privateNotes: keep-me",
      ""
    ].join("\n"), "utf8");
    await writeFile(seed, [
      "nodes:",
      "  - id: rs1000",
      "    name: RS1000",
      "    provider: netcup",
      "    group: Core",
      "    region: EU",
      "    displayOrder: 10",
      "    public: true",
      "    labels:",
      "      job: node-exporter",
      "    detail:",
      "      enabled: true",
      "      visibility: safe",
      "      networkDevices:",
      "        - eth0",
      "      diskMounts:",
      "        - /",
      "  - id: not-in-runtime",
      "    name: ignored",
      "    detail:",
      "      enabled: true",
      ""
    ].join("\n"), "utf8");

    try {
      const before = await readFile(target, "utf8");
      const check = await mergeNodeDetailConfig({ target, seed, apply: false });
      expect(check.changed).toBe(true);
      expect(await readFile(target, "utf8")).toBe(before);

      const applied = await mergeNodeDetailConfig({ target, seed, apply: true });
      expect(applied.changed).toBe(true);
      const nodes = await loadNodeRegistry(target);
      expect(nodes[0]).toMatchObject({
        id: "rs1000",
        privateNotes: "keep-me",
        labels: { job: "node-exporter" },
        detail: { enabled: true, networkDevices: ["eth0"], diskMounts: ["/"] }
      });
      expect((await readdir(dir)).some((name) => name.startsWith("nodes.yaml.pre-detail-v2-"))).toBe(true);

      const repeat = await mergeNodeDetailConfig({ target, seed, apply: true });
      expect(repeat.changed).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a corrupt runtime file instead of falling back to the seed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodebeacon-detail-migration-corrupt-"));
    const target = join(dir, "nodes.yaml");
    const seed = join(dir, "nodes.seed.yaml");
    await writeFile(target, "nodes: [broken", "utf8");
    await writeFile(seed, "nodes: []\n", "utf8");
    try {
      await expect(mergeNodeDetailConfig({ target, seed, apply: true })).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
