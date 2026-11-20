import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAutomationEcho } from "../full/client/scripts/listener-events.mjs";

assert.equal(isAutomationEcho("agent_comment"), true, "listener must ignore its own audit comments");
assert.equal(isAutomationEcho("user_comment"), false, "user comments must resume the workflow");
assert.equal(isAutomationEcho("user_move"), false, "user status moves must resume the workflow");
assert.equal(isAutomationEcho("issue_transitioned"), false, "status transition events must still dispatch");
assert.equal(isAutomationEcho("agent_move"), false, "workflow-owned stage advances must continue");
const listener = readFileSync(new URL("../full/client/scripts/holding-listen.mjs", import.meta.url), "utf8");
assert.match(listener, /if \(isAutomationEcho\(r\.event\)\) \{[\s\S]{0,240}continue;/, "reconcile must not wake from the listener's own Jira comment");
console.log("listener_events_test: pass");
