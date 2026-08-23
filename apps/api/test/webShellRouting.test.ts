import { describe, expect, it } from "vitest";
import { getInstanceDetailRedirect, getLegacyAdminRedirect, usesLegacyWebShell } from "../src/server.js";

describe("web shell routing", () => {
  it.each([
    ["/", false],
    ["/instance/rs1000", false],
    ["/assets/flags/US.svg", false],
    ["/admin", false],
    ["/admin/nodes?tab=all", false],
    ["/login", false],
    ["/login-v2", false],
    ["/admin-v2", false],
    ["/admin-v2/servers", false],
    ["/nodes", false],
    ["/nodes/rs1000", false],
    ["/legacy/assets/app.js", true]
  ])("routes %s to the expected shell", (url, legacy) => {
    expect(usesLegacyWebShell(url)).toBe(legacy);
  });

  it.each([
    ["/login-v2", "/login"],
    ["/login-v2?error=github_failed&next=%2Fadmin-v2%2Fdashboard", "/login?error=github_failed&next=%2Fadmin-v2%2Fdashboard"],
    ["/admin-v2", "/admin"],
    ["/admin-v2/servers?tab=online", "/admin/servers?tab=online"],
    ["/admin-v20", null],
    ["/instance/admin-v2", null]
  ])("redirects retired shadow route %s to %s", (url, expected) => {
    expect(getLegacyAdminRedirect(url)).toBe(expected);
  });

  it.each([
    ["/instance/rs1000", "/nodes/rs1000"],
    ["/instance/rs1000/", "/nodes/rs1000"],
    ["/instance/rs1000?tab=cpu", "/nodes/rs1000?tab=cpu"],
    ["/instance", null],
    ["/instance/", null],
    ["/instance/foo/bar", null],
    ["/instance/../admin", null]
  ])("redirects retired instance route %s to %s", (url, expected) => {
    expect(getInstanceDetailRedirect(url)).toBe(expected);
  });
});
