#!/usr/bin/env node

/**
 * Small, dependency-free load probe for the public Node Detail V2 API.
 *
 * It deliberately treats HTTP 429 as an observed rate-limit result rather
 * than a transport failure. That makes it useful for checking both cache
 * behaviour and the documented per-IP limits without hiding 5xx/network
 * failures.
 */

import { performance } from "node:perf_hooks";

const DEFAULTS = {
  baseUrl: process.env.NODEBEACON_BASE_URL || "http://127.0.0.1:3001",
  node: "rs1000",
  clients: 10,
  durationSeconds: 60,
  intervalMs: 5_000,
  mode: "both"
};

function usage() {
  console.log(`Usage: node scripts/load-node-detail.mjs [options]

Options:
  --base-url <url>       API origin (default: ${DEFAULTS.baseUrl})
  --node <id>            node id (default: ${DEFAULTS.node})
  --clients <n>          concurrent client loops (default: ${DEFAULTS.clients})
  --duration <seconds>   test duration; accepts s/m/h suffix (default: ${DEFAULTS.durationSeconds}s)
  --interval-ms <ms>     wait between each client's rounds (default: ${DEFAULTS.intervalMs})
  --mode <detail|series|both>  endpoints to exercise (default: ${DEFAULTS.mode})
  --help                 show this help

Example:
  node scripts/load-node-detail.mjs --base-url https://monitor.example.com --duration 600
`);
}

function numberOption(name, value, minimum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${name} must be a number >= ${minimum}`);
  }
  return Math.floor(parsed);
}

function durationOption(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(s|m|h)?$/i);
  if (!match) throw new Error("--duration must be a number of seconds or use s/m/h (for example 10m)");
  const amount = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3_600 }[(match[2] || "s").toLowerCase()];
  const seconds = amount * multiplier;
  if (!Number.isFinite(seconds) || seconds < 1) throw new Error("--duration must be at least 1 second");
  return Math.ceil(seconds);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    const value = argv[index + 1];
    if (arg === "--base-url") options.baseUrl = value;
    else if (arg === "--node") options.node = value;
    else if (arg === "--clients") options.clients = numberOption(arg, value, 1);
    else if (arg === "--duration") options.durationSeconds = durationOption(value);
    else if (arg === "--interval-ms") options.intervalMs = numberOption(arg, value, 100);
    else if (arg === "--mode") options.mode = value;
    else throw new Error(`unknown option: ${arg}`);
    index += 1;
  }
  if (!options.baseUrl || !options.node) throw new Error("--base-url and --node cannot be empty");
  if (!["detail", "series", "both"].includes(options.mode)) {
    throw new Error("--mode must be detail, series, or both");
  }
  options.baseUrl = options.baseUrl.replace(/\/$/, "");
  return options;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[index].toFixed(1));
}

function endpointUrls(options) {
  const endpoints = [];
  if (options.mode === "detail" || options.mode === "both") {
    endpoints.push({ name: "detail", url: `${options.baseUrl}/api/public/nodes/${encodeURIComponent(options.node)}/detail` });
  }
  if (options.mode === "series" || options.mode === "both") {
    const query = new URLSearchParams({
      metrics: "cpu,memory,swap,disk,network,latency,connections",
      range: "realtime",
      aggregation: "avg"
    });
    endpoints.push({ name: "series", url: `${options.baseUrl}/api/public/nodes/${encodeURIComponent(options.node)}/series?${query}` });
  }
  return endpoints;
}

async function runRequest(endpoint, stats) {
  const started = performance.now();
  try {
    const response = await fetch(endpoint.url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    const duration = performance.now() - started;
    stats.latencies.push(duration);
    stats.total += 1;
    stats.statuses[response.status] = (stats.statuses[response.status] || 0) + 1;
    if (response.status >= 400 && response.status !== 429) stats.failures += 1;
    const body = await response.arrayBuffer();
    stats.maxResponseBytes = Math.max(stats.maxResponseBytes, body.byteLength);
    if (endpoint.name === "series" && body.byteLength) {
      try {
        const payload = JSON.parse(new TextDecoder().decode(body));
        const pointCount = (payload.series || []).reduce((total, series) => total + (series.points?.length || 0), 0);
        stats.seriesResponses += 1;
        stats.seriesPoints += pointCount;
        stats.maxSeriesPoints = Math.max(stats.maxSeriesPoints, pointCount);
      } catch {
        // The HTTP status and body size are still useful when a server returns
        // an error document or malformed JSON.
      }
    }
  } catch (error) {
    stats.total += 1;
    stats.failures += 1;
    stats.errors += 1;
    stats.errorMessages.add(error instanceof Error ? error.message : String(error));
  }
}

function newStats() {
  return {
    total: 0,
    failures: 0,
    errors: 0,
    statuses: {},
    latencies: [],
    maxResponseBytes: 0,
    seriesResponses: 0,
    seriesPoints: 0,
    maxSeriesPoints: 0,
    errorMessages: new Set()
  };
}

function printStats(name, stats) {
  const statusSummary = Object.entries(stats.statuses)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
  const latencySummary = stats.latencies.length
    ? `p50=${percentile(stats.latencies, 0.5)}ms p95=${percentile(stats.latencies, 0.95)}ms p99=${percentile(stats.latencies, 0.99)}ms`
    : "no response latency samples";
  const bodySummary = `max-body=${stats.maxResponseBytes}B`;
  const seriesSummary = name === "series"
    ? `series-points=${stats.seriesPoints} max-series-points=${stats.maxSeriesPoints}`
    : "";
  console.log(`${name}: requests=${stats.total}; ${statusSummary || "no HTTP responses"}; ${latencySummary}; ${bodySummary}; ${seriesSummary}; failures=${stats.failures}`);
  if (stats.errorMessages.size) console.log(`  errors: ${[...stats.errorMessages].slice(0, 3).join(" | ")}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const endpoints = endpointUrls(options);
  const stats = new Map(endpoints.map((endpoint) => [endpoint.name, newStats()]));
  const deadline = Date.now() + options.durationSeconds * 1_000;

  console.log(`Node Detail V2 load probe: ${options.clients} clients, ${options.durationSeconds}s, mode=${options.mode}`);
  console.log(`Target: ${options.baseUrl}; node=${options.node}; interval=${options.intervalMs}ms`);

  const clients = Array.from({ length: options.clients }, async () => {
    while (Date.now() < deadline) {
      for (const endpoint of endpoints) await runRequest(endpoint, stats.get(endpoint.name));
      const remaining = deadline - Date.now();
      if (remaining > 0) await sleep(Math.min(options.intervalMs, remaining));
    }
  });
  await Promise.all(clients);

  let failures = 0;
  for (const endpoint of endpoints) {
    const endpointStats = stats.get(endpoint.name);
    printStats(endpoint.name, endpointStats);
    failures += endpointStats.failures;
  }
  if (failures) {
    console.error(`Load probe failed: ${failures} request(s) returned non-429 errors or failed to reach the API.`);
    process.exitCode = 1;
  } else {
    console.log("Load probe passed (HTTP 429 rate-limit responses, if any, are reported but do not fail the run).");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
