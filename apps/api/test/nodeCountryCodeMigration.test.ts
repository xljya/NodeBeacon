import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadNodeRegistry } from "../src/config/nodeRegistry.js";
import { mergeNodeCountryCodes } from "../src/cli/mergeNodeCountryCodes.js";

describe("node country-code registry migration", () => {
  it("syncs country codes without replacing runtime metadata and is idempotent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodebeacon-country-code-migration-"));
    const target = join(dir, "nodes.yaml");
    const seed = join(dir, "nodes.seed.yaml");
    const base = [
      "nodes:",
      "  - id: rs1000",
      "    name: RS1000",
      "    provider: netcup",
      "    group: Core",
      "    region: EU",
      "    displayOrder: 10",
      "    public: true",
      "    labels:",
      "      job: node-exporter"
    ];
    await writeFile(target, [...base, "    privateNotes: keep-me", ""].join("\n"), "utf8");
    await writeFile(seed, [...base, "    countryCode: US", ""].join("\n"), "utf8");

    try {
      const before = await readFile(target, "utf8");
      expect((await mergeNodeCountryCodes({ target, seed, apply: false })).changed).toBe(true);
      expect(await readFile(target, "utf8")).toBe(before);

      expect((await mergeNodeCountryCodes({ target, seed, apply: true })).changed).toBe(true);
      expect((await loadNodeRegistry(target))[0]).toMatchObject({
        id: "rs1000",
        countryCode: "US",
        privateNotes: "keep-me"
      });
      expect((await readdir(dir)).some((name) => name.startsWith("nodes.yaml.pre-country-code-"))).toBe(true);
      expect((await mergeNodeCountryCodes({ target, seed, apply: true })).changed).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
