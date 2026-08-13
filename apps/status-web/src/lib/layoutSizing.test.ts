import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMainContentWidth } from "./layoutSizing.ts";

describe("public layout sizing", () => {
  it("uses the containing block so classic scrollbars cannot create page overflow", () => {
    assert.equal(getMainContentWidth(100), "100%");
    assert.equal(getMainContentWidth(80), "80%");
    assert.equal(getMainContentWidth(120), "100%");
  });
});
