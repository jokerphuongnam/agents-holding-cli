import assert from "node:assert/strict";
import { actionsFor, createMirrorExecutor } from "./mirror-executor.mjs";

const m = { id: "m1", direction: "both", status_map: { source_to_mirror: { "Verified on Dev": "Verified on Dev" }, control_to_source: { "Verified on Dev": "Ready on Dev" } }, notify: ["Verified on Dev"], policy: { done: "source_to_mirror_only" } };
assert.deepEqual(actionsFor(m, { side: "mirror", status: "Verified on Dev", source_issue: "B-1", control_issue: "P-1" }), [
  { type: "notify", issue: "P-1", status: "Verified on Dev" }, { type: "transition_source", issue: "B-1", to: "Ready on Dev" },
]);
assert.equal(actionsFor(m, { side: "mirror", status: "Done", source_issue: "B-1", control_issue: "P-1" }).some((x) => x.type === "transition_source"), false);
const moved = []; const x = createMirrorExecutor({ jira: { transition: async (issue, to) => moved.push([issue, to]) }, seen: new Set() });
await x(m, { side: "mirror", status: "Verified on Dev", source_issue: "B-1", control_issue: "P-1", updated: "1" });
const dup = await x(m, { side: "mirror", status: "Verified on Dev", source_issue: "B-1", control_issue: "P-1", updated: "1" });
assert.equal(dup.duplicate, true); assert.deepEqual(moved, [["B-1", "Ready on Dev"]]);
console.log("mirror-executor_test: pass");
