import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const legacyDist = resolve(repositoryRoot, "apps/web/dist");
const legacyTarget = resolve(repositoryRoot, "apps/status-web/dist/legacy");

await rm(legacyTarget, { recursive: true, force: true });
await mkdir(legacyTarget, { recursive: true });
await cp(legacyDist, legacyTarget, { recursive: true });
