import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGithubLoginUrl,
  getAdminBase,
  getLoginPath,
  getOfficialAdminPath,
  sanitizeNextPath,
  withAdminBase,
} from "./adminPaths.ts";

describe("admin path helpers", () => {
  it("selects the shadow prefix from the current location", () => {
    assert.equal(getAdminBase("/admin-v2/servers"), "/admin-v2");
    assert.equal(getLoginPath("/admin-v2/dashboard"), "/login-v2");
    assert.equal(withAdminBase("/admin/servers", "/admin-v2"), "/admin-v2/servers");
    assert.equal(withAdminBase("/", "/admin-v2"), "/");
  });

  it("rejects open redirects and external URLs", () => {
    const fallback = "/admin-v2/dashboard";
    assert.equal(sanitizeNextPath("https://evil.example/admin", fallback), fallback);
    assert.equal(sanitizeNextPath("//evil.example", fallback), fallback);
    assert.equal(sanitizeNextPath("/\\evil", fallback), fallback);
    assert.equal(sanitizeNextPath("/nodes/rs1000", fallback, "/admin-v2"), fallback);
    assert.equal(
      sanitizeNextPath("/admin-v2/servers?tab=all", fallback, "/admin-v2"),
      "/admin-v2/servers?tab=all",
    );
  });

  it("preserves the sanitized shadow return path for GitHub login", () => {
    assert.equal(
      buildGithubLoginUrl("/admin-v2/servers?tab=all", "/login-v2"),
      "/api/auth/github?next=%2Fadmin-v2%2Fservers%3Ftab%3Dall",
    );
    assert.equal(
      buildGithubLoginUrl("https://evil.example", "/login-v2"),
      "/api/auth/github?next=%2Fadmin-v2%2Fdashboard",
    );
  });

  it("maps retired shadow routes to official paths without losing query strings", () => {
    assert.equal(getOfficialAdminPath("/login-v2", "?next=%2Fadmin-v2%2Fdashboard"), "/login?next=%2Fadmin-v2%2Fdashboard");
    assert.equal(getOfficialAdminPath("/admin-v2/servers", "?tab=online"), "/admin/servers?tab=online");
    assert.equal(getOfficialAdminPath("/admin-v20", ""), "/admin-v20");
  });
});
