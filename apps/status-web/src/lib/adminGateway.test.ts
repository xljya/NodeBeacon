import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAdminErrorBody, valueOr } from "./adminGateway.ts";

describe("admin gateway parsing", () => {
  it("reads NodeBeacon error envelopes", () => {
    const error = parseAdminErrorBody(400, {
      error: { code: "invalid_report", message: "Period must be daily, weekly or monthly." },
    });
    assert.equal(error.status, 400);
    assert.equal(error.code, "invalid_report");
    assert.match(error.message, /Period must be/);
  });

  it("degrades missing or damaged bodies", () => {
    assert.equal(parseAdminErrorBody(500, null).message, "500 request failed");
    assert.equal(parseAdminErrorBody(502, "<html>bad</html>").message, "502 request failed");
    assert.equal(valueOr(undefined, "offline"), "offline");
    assert.equal(valueOr(null, 0), 0);
    assert.equal(valueOr("ok", "fallback"), "ok");
  });
});
