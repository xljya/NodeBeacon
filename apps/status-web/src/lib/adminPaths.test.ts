import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAdminBase,
  getLoginPath,
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
});
