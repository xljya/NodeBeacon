import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNodeDetailPath } from "./nodebeacon.ts";

describe("node detail handoff", () => {
  it("links the public shell straight to the React 18 detail path", () => {
    assert.equal(getNodeDetailPath("rs1000"), "/nodes/rs1000");
    assert.equal(getNodeDetailPath("a/b"), "/nodes/a%2Fb");
  });
});
