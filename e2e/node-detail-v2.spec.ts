import { test, expect } from "./fixtures";
import type { ApiNodeDetailSeriesResponse, ApiNodeDetailV2Response } from "@nodebeacon/shared";

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
    cpuModel: null,
    logicalCpuCores: 4,
    physicalCpuCores: null,
    gpuModel: null
  },
  capabilities: {
    realtime: true,
    cpuModel: false,
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
    { metric: "cpu", key: "load1", unit: "load", points: [[1_752_560_000, 0.4], [1_752_560_300, 0.5], [1_752_560_600, 0.42]] },
    { metric: "memory", key: "ram", unit: "bytes", points: [[1_752_560_000, 4e9], [1_752_560_300, 4.1e9], [1_752_560_600, 4e9]] },
    { metric: "swap", key: "swap", unit: "bytes", points: [[1_752_560_000, 1e8], [1_752_560_300, 1.2e8], [1_752_560_600, 1e8]] },
    { metric: "disk", key: "disk", unit: "bytes", labels: { mountpoint: "/" }, points: [[1_752_560_000, 3e10], [1_752_560_300, 3e10], [1_752_560_600, 3e10]] },
    { metric: "network", key: "rx", unit: "bytes_per_second", points: [[1_752_560_000, 12_000], [1_752_560_300, 13_000], [1_752_560_600, 12_000]] },
    { metric: "network", key: "tx", unit: "bytes_per_second", points: [[1_752_560_000, 8_000], [1_752_560_300, 9_000], [1_752_560_600, 8_000]] },
    { metric: "latency", key: "tcp", unit: "milliseconds", points: [[1_752_560_000, 25], [1_752_560_300, 27], [1_752_560_600, 26]] },
    { metric: "connections", key: "tcp", unit: "count", points: [[1_752_560_000, 12], [1_752_560_300, 13], [1_752_560_600, 12]] },
    { metric: "connections", key: "udp", unit: "count", points: [[1_752_560_000, 4], [1_752_560_300, 5], [1_752_560_600, 4]] }
  ]
};

test("anonymous node detail V2 supports charts and layout controls", async ({ page }) => {
  const seriesRequests: string[] = [];
  await page.route("**/api/public/nodes/rs1000/detail", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/public/nodes/rs1000/series**", async (route) => {
    seriesRequests.push(route.request().url());
    await route.fulfill({ json: series });
  });

  await page.goto("/nodes/rs1000");
  await expect(page.locator(".detail-profile-card")).toBeVisible();
  await expect(page.locator(".detail-chart-card")).toHaveCount(8);
  await expect(page.locator(".detail-series-chip").first()).toBeVisible();

  const initialRequests = seriesRequests.length;
  await page.getByRole("button", { name: "1天", exact: true }).click();
  await expect.poll(() => seriesRequests.length).toBeGreaterThan(initialRequests);

  const ewmaRequests = seriesRequests.length;
  await page.getByRole("button", { name: /EWMA/ }).click();
  await expect.poll(() => seriesRequests.length).toBe(ewmaRequests);

  await page.locator(".detail-series-chip").first().click();
  await page.getByRole("button", { name: /重置/ }).click();
  await expect(page.locator(".detail-chart-card")).toHaveCount(8);
});
