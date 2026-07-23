import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal Prometheus stand-in for tests: answers /api/v1/query with a vector
 * and /api/v1/query_range with a matrix of synthetic values. Query strings are
 * matched heuristically the same way the real PromQL whitelist shapes them.
 */

function instantValue(query: string): number {
  if (query.startsWith("up")) return 1;
  if (query.includes("node_memory_MemTotal")) return 8 * 1024 ** 3;
  if (query.includes("node_memory_MemAvailable")) return 4 * 1024 ** 3;
  if (query.includes("node_filesystem_size")) return 80 * 1024 ** 3;
  if (query.includes("node_filesystem_free")) return 50 * 1024 ** 3;
  if (query.includes("node_load1")) return 0.42;
  if (query.startsWith("time() -")) return 123456;
  if (query.includes("receive")) return query.includes("rate(") ? 21000 : 2 * 1024 ** 3;
  if (query.includes("transmit")) return query.includes("rate(") ? 9000 : 1024 ** 3;
  return 12.5;
}

function probeVector(query: string): Array<{ metric: Record<string, string>; value: [number, string] }> {
  const targets = ["https://a.example.com/", "https://b.example.com/"];
  const now = Date.now() / 1000;
  const valueFor = (): string => {
    if (query.includes("probe_duration_seconds")) return "0.234";
    if (query.includes("probe_http_status_code")) return "200";
    if (query.includes("probe_ssl_earliest_cert_expiry")) return String(now + 55 * 86400);
    if (query.startsWith("avg_over_time")) return "0.995";
    return "1"; // probe_success
  };
  return targets.map((instance) => ({
    metric: { instance, job: "blackbox-http-public" },
    value: [now, valueFor()]
  }));
}

export interface MockPrometheus {
  url: string;
  close(): Promise<void>;
}

export async function startMockPrometheus(): Promise<MockPrometheus> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const query = url.searchParams.get("query") ?? "";
    res.setHeader("content-type", "application/json");

    if (url.pathname === "/api/v1/query") {
      const result = query.includes("probe_")
        ? probeVector(query)
        : [{ metric: {}, value: [Date.now() / 1000, String(instantValue(query))] }];
      res.end(JSON.stringify({ status: "success", data: { resultType: "vector", result } }));
      return;
    }

    if (url.pathname === "/api/v1/query_range") {
      const start = Number(url.searchParams.get("start"));
      const end = Number(url.searchParams.get("end"));
      const step = Number(url.searchParams.get("step"));
      const values: Array<[number, string]> = [];
      for (let ts = start; ts <= end; ts += step) {
        values.push([ts, String(instantValue(query))]);
      }
      const result = query.includes("blackbox-tcp-wireguard")
        ? ["dmit-uswest", "hostbrr-4t"].map((peer) => ({
            metric: { peer, node_id: "rs1000", job: "blackbox-tcp-wireguard" },
            values
          }))
        : [{ metric: {}, values }];
      res.end(JSON.stringify({ status: "success", data: { resultType: "matrix", result } }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ status: "error", error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  };
}
