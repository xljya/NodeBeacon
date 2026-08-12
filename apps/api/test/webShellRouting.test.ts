import { describe, expect, it } from "vitest";
import { usesLegacyWebShell } from "../src/server.js";

describe("web shell routing", () => {
  it.each([
    ["/", false],
    ["/instance/rs1000", false],
    ["/assets/flags/US.svg", false],
    ["/admin", true],
    ["/admin/nodes?tab=all", true],
    ["/login", true],
    ["/nodes/rs1000", true],
    ["/legacy/assets/app.js", true]
  ])("routes %s to the expected shell", (url, legacy) => {
    expect(usesLegacyWebShell(url)).toBe(legacy);
  });
});
