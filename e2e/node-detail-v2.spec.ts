import { test, expect } from "./fixtures";
import type {
  ApiNodeDetailSeriesResponse,
  ApiNodeDetailV2Response,
  ApiNodeLatencyStatsResponse
} from "@nodebeacon/shared";

const PUBLIC_SHELL_URL = "http://localhost:3001";

const detail: ApiNodeDetailV2Response = {
  generatedAt: "2026-07-15T06:00:00.000Z",
  node: {
    id: "rs1000",
    name: "RS1000",
    provider: "netcup",
    group: "Core",
    region: "EU",
    location: "Germany",
    displayOrder: 10,
    tags: ["k3s", "prometheus"],
    online: true,
    status: "online",
    updatedAt: "2026-07-15T06:00:00.000Z"
  },
  profile: {
    osName: "Debian GNU/Linux 13",
    osVersion: "13",
    kernelVersion: "6.12.90",
    arch: "x86_64",
    virtualization: "QEMU",
    cpuModel: "AMD EPYC 9645 96-Core Processor",
    logicalCpuCores: 4,
    physicalCpuCores: null,
    gpuModel: null
  },
  capabilities: {
    realtime: true,
    cpuModel: true,
    gpu: false,
    swap: true,
    multiDisk: true,
    processTotal: false,
    latency: true
  },
  live: {
    cpuPercent: 12.5,
    load1: 0.42,
    load5: 0.31,
    load15: 0.28,
    memoryUsedBytes: 4 * 1024 ** 3,
    memoryTotalBytes: 8 * 1024 ** 3,
    swapUsedBytes: 128 * 1024 ** 2,
    swapTotalBytes: 2 * 1024 ** 3,
    disks: [{ id: "/", label: "Root disk", mountpoint: "/", usedBytes: 30 * 1024 ** 3, totalBytes: 100 * 1024 ** 3, usedPercent: 30 }],
    networkRxBytesPerSecond: 12_000,
    networkTxBytesPerSecond: 8_000,
    networkRxBytesTotal: 2 * 1024 ** 3,
    networkTxBytesTotal: 3 * 1024 ** 3,
    tcpConnections: 12,
    udpConnections: 4,
    processRunning: 2,
    processBlocked: 0,
    processTotal: null,
    uptimeSeconds: 86_400,
    lastReportAt: "2026-07-15T06:00:00.000Z"
  }
};

const series: ApiNodeDetailSeriesResponse = {
  nodeId: "rs1000",
  from: "2026-07-15T05:45:00.000Z",
  to: "2026-07-15T06:00:00.000Z",
  dataFrom: "2026-07-15T05:45:00.000Z",
  dataTo: "2026-07-15T06:00:00.000Z",
  stepSeconds: 300,
  aggregation: "avg",
  series: [
    { metric: "cpu", key: "cpu", unit: "percent", points: [[1_752_560_000, 10], [1_752_560_300, 12], [1_752_560_600, 11]] },
    { metric: "memory", key: "ram", unit: "bytes", points: [[1_752_560_000, 4e9], [1_752_560_300, 4.1e9], [1_752_560_600, 4e9]] },
    { metric: "disk", key: "disk", unit: "bytes", labels: { mountpoint: "/" }, points: [[1_752_560_000, 3e10], [1_752_560_300, 3e10], [1_752_560_600, 3e10]] },
    { metric: "network", key: "rx", unit: "bytes_per_second", points: [[1_752_560_000, 12_000], [1_752_560_300, 13_000], [1_752_560_600, 12_000]] },
    { metric: "network", key: "tx", unit: "bytes_per_second", points: [[1_752_560_000, 8_000], [1_752_560_300, 9_000], [1_752_560_600, 8_000]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "zhejiang_telecom", vantage_name: "浙江电信" }, points: [[1_752_560_000, 16], [1_752_560_300, 17], [1_752_560_600, 16]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "zhejiang_unicom", vantage_name: "浙江联通" }, points: [[1_752_560_000, 22], [1_752_560_300, 21], [1_752_560_600, 23]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "ping", vantage_name: "Ping" }, points: [[1_752_560_000, 25], [1_752_560_300, 27], [1_752_560_600, 26]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "zhejiang_mobile", vantage_name: "浙江移动" }, points: [[1_752_560_000, 18], [1_752_560_300, 19], [1_752_560_600, 18]] },
    { metric: "connections", key: "tcp", unit: "count", points: [[1_752_560_000, 12], [1_752_560_300, 13], [1_752_560_600, 12]] }
  ]
};

const latencyStats: ApiNodeLatencyStatsResponse = {
  nodeId: "rs1000",
  vantage: "zhejiang_mobile",
  vantageName: "浙江移动",
  source: {
    provider: "China Mobile",
    probeId: 1009298,
    asn: "AS56041",
    city: "Zhejiang",
    measurementId: 193845936
  },
  windowSeconds: 86_400,
  intervalSeconds: 900,
  type: "ICMP",
  measuredFrom: "2026-07-14T06:00:00.000Z",
  measuredTo: "2026-07-15T06:00:00.000Z",
  updatedAt: "2026-07-15T06:00:00.000Z",
  packetLossPercent: 2.546,
  minimumMs: 13,
  maximumMs: 19,
  averageMs: 17,
  latestMs: 18,
  p50Ms: 17,
  p99Ms: 19,
  standardDeviationMs: 1.2,
  jitterMs: 0.8,
  sampleCount: 288,
  validSampleCount: 287,
  packetsSent: 864,
  packetsReceived: 842
};

async function mockNodeDetail(page: import("@playwright/test").Page, seriesStatus = 200) {
  await page.route("**/api/public/nodes/rs1000/detail", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/public/nodes/rs1000/series**", async (route) => {
    if (seriesStatus === 200) await route.fulfill({ json: series });
    else await route.fulfill({ status: seriesStatus, json: { error: "trends_unavailable" } });
  });
  await page.route("**/api/public/nodes/rs1000/latency-stats?**", (route) => route.fulfill({ json: latencyStats }));
}

test("anonymous node detail renders in the React 19 public shell", async ({ page }) => {
  const seriesRequests: string[] = [];
  const rpcRequests: string[] = [];
  let latencyStatsRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/rpc2")) rpcRequests.push(request.url());
  });
  await page.route("**/api/public/nodes/rs1000/detail", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/public/nodes/rs1000/series**", async (route) => {
    seriesRequests.push(route.request().url());
    await route.fulfill({ json: series });
  });
  await page.route("**/api/public/nodes/rs1000/latency-stats?**", async (route) => {
    latencyStatsRequests += 1;
    await route.fulfill({ json: latencyStats });
  });

  await page.goto(`${PUBLIC_SHELL_URL}/nodes/rs1000`);
  await expect(page.locator('[data-page="node-detail"]')).toBeVisible();
  await expect(page.locator(".detail-main-content")).toHaveCount(0);
  await expect(page.getByText("RS1000", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Debian GNU/Linux 13")).toBeVisible();
  await expect(page.locator('[data-chart="cpu"]')).toBeVisible();
  await expect(page.locator('[data-chart="memory"]')).toBeVisible();
  await expect(page.locator('[data-chart="disk"]')).toBeVisible();
  await expect(page.locator('[data-chart="network"]')).toBeVisible();
  await expect(page.locator('[data-chart="connections"]')).toBeVisible();
  await expect(page.locator('[data-chart="latency"]')).toBeVisible();
  await expect(page.locator("[data-latency-stats]")).toContainText("Latency stats");
  await expect(page.locator("[data-latency-stats]")).toContainText("浙江移动");
  await expect(page.locator("[data-latency-stats]")).toContainText("2.5%");
  await expect(page.locator("[data-latency-stats]")).toContainText("900s");
  await expect(page.locator("[data-latency-stats]")).toContainText("ICMP");
  expect(latencyStatsRequests).toBeGreaterThan(0);
  expect(seriesRequests.length).toBeGreaterThan(0);
  expect(seriesRequests.every((url) => {
    const parsed = new URL(url);
    return parsed.searchParams.get("metrics") === "cpu,memory,disk,network,latency,connections"
      && parsed.searchParams.get("range") === "1d"
      && !url.toLowerCase().includes("promql");
  })).toBe(true);
  expect(rpcRequests).toEqual([]);

  const initialRequests = seriesRequests.length;
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Realtime" }).click();
  await expect.poll(() => seriesRequests.some((url) => url.includes("range=realtime"))).toBe(true);
  expect(seriesRequests.length).toBeGreaterThan(initialRequests);
});

test("anonymous node detail shows a loading state while initial data is pending", async ({ page }) => {
  let releaseStatus!: () => void;
  let releaseDetail!: () => void;
  const statusGate = new Promise<void>((resolve) => { releaseStatus = resolve; });
  const detailGate = new Promise<void>((resolve) => { releaseDetail = resolve; });

  await page.route("**/api/status", async (route) => {
    await statusGate;
    await route.continue();
  });
  await page.route("**/api/public/nodes/rs1000/detail", async (route) => {
    await detailGate;
    await route.fulfill({ json: detail });
  });
  await page.route("**/api/public/nodes/rs1000/series**", (route) => route.fulfill({ json: series }));
  await page.route("**/api/public/nodes/rs1000/latency-stats?**", (route) => route.fulfill({ json: latencyStats }));

  await page.goto(`${PUBLIC_SHELL_URL}/nodes/rs1000`);
  await expect(page.getByTestId("node-detail-loading")).toBeVisible();

  releaseStatus();
  releaseDetail();
  await expect(page.locator('[data-page="node-detail"]')).toBeVisible();
  await expect(page.getByTestId("node-detail-loading")).toHaveCount(0);
});

test("trend request failures keep the node detail visible", async ({ page }) => {
  await mockNodeDetail(page, 503);
  await page.goto(`${PUBLIC_SHELL_URL}/nodes/rs1000`);
  await expect(page.locator('[data-page="node-detail"]')).toBeVisible();
  await expect(page.getByText("RS1000", { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-chart="cpu"]')).toContainText("None");
});

test("mobile detail keeps chart text readable without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNodeDetail(page);
  await page.goto(`${PUBLIC_SHELL_URL}/nodes/rs1000`);

  await expect(page.locator('[data-page="node-detail"]')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
