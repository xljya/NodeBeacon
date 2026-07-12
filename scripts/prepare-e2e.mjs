import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve("e2e/.tmp");
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await cp(resolve("config/nodes.example.yaml"), resolve(directory, "nodes.seed.yaml"));
await cp(resolve("config/nodes.example.yaml"), resolve(directory, "nodes.yaml"));
