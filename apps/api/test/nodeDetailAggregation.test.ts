import { describe, expect, it } from "vitest";
import type { DetailAggregation } from "@nodebeacon/shared";
import { aggregationExpression } from "../src/services/nodeDetailService.js";

describe("node detail sampling algorithms", () => {
  const cases: Array<[DetailAggregation, string]> = [
    ["avg", "avg_over_time"],
    ["min", "min_over_time"],
    ["max", "max_over_time"],
    ["first", "last_over_time"],
    ["last", "last_over_time"],
    ["stddev", "stddev_over_time"],
    ["p70", "quantile_over_time(0.70"],
    ["p95", "quantile_over_time(0.95"],
    ["p99", "quantile_over_time(0.99"]
  ];

  it.each(cases)("maps %s to the expected PromQL function", (aggregation, expected) => {
    const query = aggregationExpression("node_load1{instance=\"rs1000\"}", aggregation, 15);
    expect(query).toContain(expected);
    expect(query).toContain(aggregation === "first" ? "[15s:15s] offset 15s" : "[30s:15s]");
  });
});
