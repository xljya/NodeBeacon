import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProbeReconciled } from "./probeSync.ts";

describe("probe sync feedback", () => {
  it("does not treat a saved-but-unreconciled write as live", () => {
    assert.equal(isProbeReconciled({ reconciled: false }), false);
    assert.equal(isProbeReconciled({}), false);
    assert.equal(isProbeReconciled({ reconciled: true }), true);
  });
});
