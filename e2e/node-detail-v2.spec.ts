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
    { metric: "network", key: "rxTotal", unit: "bytes", points: [[1_752_560_000, 2e9], [1_752_560_300, 2.1e9], [1_752_560_600, 2.2e9]] },
    { metric: "network", key: "txTotal", unit: "bytes", points: [[1_752_560_000, 3e9], [1_752_560_300, 3.1e9], [1_752_560_600, 3.2e9]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "zhejiang_telecom", vantage_name: "浙江电信", provider: "China Telecom", probe_id: "55328", asn: "AS4134", city: "Hangzhou, Zhejiang" }, points: [[1_752_560_000, 16], [1_752_560_300, 17], [1_752_560_600, 16]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "zhejiang_unicom", vantage_name: "浙江联通", provider: "China Unicom", probe_id: "1009966", asn: "AS4837", city: "Zhejiang" }, points: [[1_752_560_000, 22], [1_752_560_300, 21], [1_752_560_600, 23]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "ping", vantage_name: "Ping", provider: "NodeBeacon Huawei Cloud", probe_id: "1016690", asn: "AS55990", city: "Shanghai" }, points: [[1_752_560_000, 25], [1_752_560_300, 27], [1_752_560_600, 26]] },
    { metric: "latency", key: "ping", unit: "milliseconds", labels: { vantage: "zhejiang_mobile", vantage_name: "浙江移动", provider: "China Mobile", probe_id: "1009298", asn: "AS56041", city: "Zhejiang" }, points: [[1_752_560_000, 18], [1_752_560_300, 19], [1_752_560_600, 18]] },
    { metric: "connections", key: "tcp", unit: "count", points: [[1_752_560_000, 12], [1_752_560_300, 13], [1_752_560_600, 12]] },
    { metric: "connections", key: "udp", unit: "count", points: [[1_752_560_000, 4], [1_752_560_300, 5], [1_752_560_600, 4]] }
  ]
};

async function mockNodeDetail(page: import("@playwright/test").Page, seriesStatus = 200) {
  await page.route("**/api/public/nodes/rs1000/detail", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/public/nodes/rs1000/series**", async (route) => {
    if (seriesStatus === 200) await route.fulfill({ json: series });
    else await route.fulfill({ status: seriesStatus, json: { error: "trends_unavailable" } });
  });
}

test("anonymous node detail uses combined charts and polished layout controls", async ({ page }) => {
  const seriesRequests: string[] = [];
  await page.route("**/api/public/nodes/rs1000/detail", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/public/nodes/rs1000/series**", async (route) => {
    seriesRequests.push(route.request().url());
    await route.fulfill({ json: series });
  });

  await page.goto("/nodes/rs1000");
  await expect(page.locator(".detail-profile-card")).toBeVisible();
  await expect(page.locator(".detail-chart-card")).toHaveCount(5);
  await expect(page.locator('[data-chart-id="cpu"]')).toContainText("CPU");
  await expect(page.locator('[data-chart-id="memory"]')).toContainText("Memory");
  await expect(page.locator('[data-chart-id="cpu"] .trend-axis-right')).toBeVisible();
  await expect(page.locator(".detail-series-chip").first()).toBeVisible();
  await expect(page.locator('[data-chart-id="network"] .detail-series-chip')).toHaveCount(4);
  const latencyChips = page.locator('[data-chart-id="latency"] .detail-series-chip');
  await expect(latencyChips).toHaveCount(4);
  await expect(latencyChips).toContainText(["Ping", "浙江移动", "浙江联通", "浙江电信"]);
  await expect.poll(() => latencyChips.locator(".detail-series-dot").evaluateAll((dots) => (
    dots.map((dot) => getComputedStyle(dot).backgroundColor)
  ))).toEqual([
    "rgb(37, 99, 235)",
    "rgb(249, 115, 22)",
    "rgb(139, 92, 246)",
    "rgb(20, 184, 166)"
  ]);
  await expect(page.locator(".detail-chart-toolbar select").first().locator("option")).toHaveCount(9);

  const initialRequests = seriesRequests.length;
  await page.getByRole("button", { name: "1 day", exact: true }).click();
  await expect.poll(() => seriesRequests.length).toBeGreaterThan(initialRequests);

  const perChartRequests = seriesRequests.length;
  await page.locator('[data-chart-id="network"]').getByLabel("Chart time range").selectOption("realtime");
  await expect.poll(() => seriesRequests.length).toBeGreaterThan(perChartRequests);
  await expect.poll(() => seriesRequests.some((url) => url.includes("range=realtime"))).toBe(true);

  const aggregationRequests = seriesRequests.length;
  await page.locator(".detail-chart-toolbar select").first().selectOption("stddev");
  await expect.poll(() => seriesRequests.length).toBeGreaterThan(aggregationRequests);
  await expect.poll(() => seriesRequests.some((url) => url.includes("aggregation=stddev"))).toBe(true);

  await page.getByRole("switch", { name: "EWMA" }).click();
  await expect(page.getByRole("switch", { name: "EWMA" })).toBeChecked();
  expect(seriesRequests.every((url) => !url.includes("ewma="))).toBe(true);

  const networkCard = page.locator('[data-chart-id="network"]');
  await networkCard.getByRole("button", { name: "Remove Total Upload" }).click();
  await expect(networkCard.locator(".detail-series-chip")).toHaveCount(3);
  await networkCard.getByLabel("Add series").selectOption("series:txTotal");
  await expect(networkCard.locator(".detail-series-chip")).toHaveCount(4);
  await networkCard.getByRole("button", { name: "Hide all series" }).click();
  await expect(networkCard.locator(".detail-series-chip")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    localStorage.getItem("nb-node-detail-layout:v3") ?? "{}"
  ).charts?.find((chart: { id: string }) => chart.id === "network")?.defaultSeries)).toEqual([]);
  await page.reload();
  await expect(networkCard.locator(".detail-series-chip")).toHaveCount(0);
  await networkCard.getByRole("button", { name: "Show all series" }).click();
  await expect(networkCard.locator(".detail-series-chip")).toHaveCount(4);

  const cpuCard = page.locator('[data-chart-id="cpu"]');
  await cpuCard.getByRole("button", { name: "Medium chart" }).click();
  await expect(cpuCard).toHaveClass(/chart-size-m/);

  await page.getByLabel("Add chart").selectOption("connections");
  await expect(page.locator(".detail-chart-card")).toHaveCount(6);
  await page.locator('[data-chart-id="connections"]').getByRole("button", { name: "Remove chart" }).click();
  await expect(page.locator(".detail-chart-card")).toHaveCount(5);

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(cpuCard).toHaveClass(/chart-size-s/);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("nb-node-detail-layout:v3") ?? "{}").charts?.length)).toBe(5);
});

test("a chart can add and persist a compatible metric group", async ({ page }) => {
  await page.route("**/api/public/nodes/rs1000/detail", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/public/nodes/rs1000/series**", async (route) => {
    await route.fulfill({ json: series });
  });

  await page.goto("/nodes/rs1000");
  const networkCard = page.locator('[data-chart-id="network"]');
  await networkCard.getByLabel("Add series").selectOption("metric:disk");
  await expect(networkCard.getByRole("button", { name: "Remove /" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    localStorage.getItem("nb-node-detail-layout:v3") ?? "{}"
  ).charts?.find((chart: { id: string }) => chart.id === "network")?.metrics)).toEqual(["network", "disk"]);

  await page.reload();
  await expect(networkCard.getByRole("button", { name: "Remove /" })).toBeVisible();
});

test("desktop geometry follows the Komari source layout", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockNodeDetail(page);
  await page.goto("/nodes/rs1000");
  await expect(page.locator(".detail-node-nav")).toBeVisible();
  await expect(page.locator(".detail-chart-card")).toHaveCount(5);

  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      sidebar: box(".detail-node-nav"),
      main: box(".detail-main-content"),
      overview: box(".detail-overview-card"),
      toolbar: box(".detail-chart-toolbar"),
      grid: box(".detail-chart-grid"),
      cpu: box('[data-chart-id="cpu"]'),
      network: box('[data-chart-id="network"]')
    };
  });

  expect(geometry.sidebar?.width).toBeCloseTo(300, 0);
  expect(geometry.main?.width).toBeCloseTo(1100, 0);
  expect((geometry.main?.x ?? 0) - ((geometry.sidebar?.x ?? 0) + (geometry.sidebar?.width ?? 0))).toBeCloseTo(16, 0);
  expect(geometry.overview?.width).toBeCloseTo(900, 0);
  expect(geometry.toolbar?.width).toBeCloseTo(1100, 0);
  expect(geometry.grid?.width).toBeCloseTo(1100, 0);
  expect(geometry.network?.width).toBeCloseTo(1100, 0);
  expect(geometry.network?.height ?? 0).toBeGreaterThan((geometry.cpu?.height ?? 0) * 1.8);
});

test("chart ordering supports the keyboard and persists", async ({ page }) => {
  await mockNodeDetail(page);
  await page.goto("/nodes/rs1000");
  await expect(page.locator(".detail-chart-card")).toHaveCount(5);

  const handle = page.locator('[data-chart-id="cpu"]').getByRole("button", { name: "Reorder chart" });
  await handle.focus();
  await page.keyboard.press("Alt+ArrowRight");

  await expect.poll(async () => page.locator(".detail-chart-card").first().getAttribute("data-chart-id")).toBe("memory");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("nb-node-detail-layout:v3") ?? "{}").charts?.[0]?.id)).toBe("memory");
});

test.describe("touch chart sorting", () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });

  test("the drag handle reorders cards without hijacking page scrolling", async ({ page }) => {
    await mockNodeDetail(page);
    await page.goto("/nodes/rs1000");
    const handle = page.locator('[data-chart-id="cpu"]').getByRole("button", { name: "Reorder chart" });
    const target = page.locator('[data-chart-id="memory"]');
    await target.scrollIntoViewIfNeeded();
    const targetHandle = target.getByRole("button", { name: "Reorder chart" });
    const handleBox = await handle.boundingBox();
    const targetBox = await targetHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    if (!handleBox || !targetBox) return;

    const client = await page.context().newCDPSession(page);
    const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await page.waitForTimeout(220);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: end.x, y: (start.y + end.y) / 2 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect.poll(async () => page.locator(".detail-chart-card").first().getAttribute("data-chart-id")).toBe("memory");
  });
});

test("custom V1 layouts migrate merged metrics without losing chart choices", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("nb-node-detail-layout:v3");
    localStorage.removeItem("nb-node-detail-layout:v2");
    localStorage.setItem("nb-node-detail-layout:v1", JSON.stringify({
      aggregation: "p95",
      ewma: true,
      charts: [
        { id: "network", metric: "network", size: "l", defaultSeries: ["rx", "tx"] },
        { id: "load", metric: "cpu", size: "s", defaultSeries: ["load1"] },
        { id: "cpu", metric: "cpu", size: "m", defaultSeries: ["cpu"] },
        { id: "swap", metric: "swap", size: "s", defaultSeries: ["swap"] },
        { id: "memory", metric: "memory", size: "m", defaultSeries: ["ram"] },
        { id: "connections", metric: "connections", size: "s", defaultSeries: ["tcp"] }
      ]
    }));
  });
  await mockNodeDetail(page);
  await page.goto("/nodes/rs1000");

  await expect(page.locator(".detail-chart-card")).toHaveCount(4);
  await expect.poll(async () => page.locator(".detail-chart-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-chart-id"))))
    .toEqual(["network", "cpu", "memory", "connections"]);
  await expect(page.locator('[data-chart-id="cpu"]')).toHaveClass(/chart-size-m/);
  await expect(page.locator('[data-chart-id="cpu"] .detail-series-chip')).toHaveCount(2);
  await expect(page.locator(".detail-chart-toolbar select").first()).toHaveValue("p95");
  await expect(page.getByRole("switch", { name: "EWMA" })).toHaveAttribute("aria-checked", "true");
});

test("standard V2 layouts migrate to the source-complete default tags", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("nb-node-detail-layout:v3");
    localStorage.setItem("nb-node-detail-layout:v2", JSON.stringify({
      aggregation: "avg",
      ewma: false,
      charts: [
        { id: "cpu", metrics: ["cpu"], size: "s", defaultSeries: ["cpu", "load1"] },
        { id: "memory", metrics: ["memory", "swap"], size: "s", defaultSeries: ["ram", "swap"] },
        { id: "disk", metrics: ["disk"], size: "s", defaultSeries: ["disk"] },
        { id: "network", metrics: ["network"], size: "l", defaultSeries: ["rx", "tx"] },
        { id: "latency", metrics: ["latency"], size: "l", defaultSeries: ["tcp"] }
      ]
    }));
  });
  await mockNodeDetail(page);
  await page.goto("/nodes/rs1000");

  await expect(page.locator('[data-chart-id="network"] .detail-series-chip')).toHaveCount(4);
  await expect(page.locator('[data-chart-id="latency"] .detail-series-chip')).toHaveCount(4);
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    localStorage.getItem("nb-node-detail-layout:v3") ?? "{}"
  ).charts?.find((chart: { id: string }) => chart.id === "network")?.defaultSeries)).toEqual([
    "rx",
    "tx",
    "rxTotal",
    "txTotal"
  ]);
});

test("mobile detail uses a node selector and keeps chart text readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNodeDetail(page);
  await page.goto("/nodes/rs1000");

  await expect(page.locator(".detail-node-nav")).toBeHidden();
  await expect(page.locator(".detail-mobile-node-select")).toBeVisible();
  await expect(page.locator(".detail-chart-card")).toHaveCount(5);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect.poll(async () => page.locator(".trend-tick").first().evaluate((element) => getComputedStyle(element).fontSize)).toBe("12px");
});

test("trend request failures render a clear chart state", async ({ page }) => {
  await mockNodeDetail(page, 503);
  await page.goto("/nodes/rs1000");
  await expect(page.getByText("Trend data unavailable").first()).toBeVisible();
});
