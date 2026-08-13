import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = [
  "/api/rpc2",
  "/api/admin/client",
  "/api/me",
  "/api/logout",
];

const root = join(process.cwd(), "dist");

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const hits = [];
for (const file of walk(root)) {
  if (!/\.(js|css|html|json)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const needle of forbidden) {
    if (text.includes(needle)) hits.push(`${file}: ${needle}`);
  }
}

if (hits.length) {
  console.error("Forbidden reachable resources:\n" + hits.join("\n"));
  process.exit(1);
}

console.log("No forbidden Admin resources in dist.");
