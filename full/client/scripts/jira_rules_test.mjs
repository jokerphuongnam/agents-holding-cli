import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { template, validateRule, planRule, evaluate, saveRules, loadRules } from "./jira-rules.mjs";
const sub = (status = "Done") => ({ key: "NAIL-2", fields: { status: { name: status, statusCategory: { key: status === "Done" ? "done" : "in-progress" } }, issuetype: { name: "Sub-task" }, parent: { key: "NAIL-1" }, labels: [] } });
const parent = (type = "Task", status = "In Progress") => ({ key: "NAIL-1", fields: { issuetype: { name: type }, status: { name: status, statusCategory: { key: "in-progress" } } } });
test("built-in template excludes epics, is draft, and validates", () => {
 const r = template("parent-auto-done", { project: "nail" }); assert.equal(r.trigger.project, "NAIL"); assert.equal(r.enabled, false); assert.equal(r.conditions.include_epics, false); assert.equal(validateRule(r), null);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent("Epic"), subtasks: [sub()] }).length, 0);
});
test("all subtasks Done transitions parent; pending subtask or Done parent does not", () => {
 const r = { ...template("parent-auto-done", { project: "NAIL" }), enabled: true };
 const p = planRule(r, sub(), "all_subtasks_done", { parent: parent(), subtasks: [sub()] });
 assert.deepEqual(p.map((a) => [a.type, a.key, a.to]), [["transition", "NAIL-1", "Done"]]);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent(), subtasks: [sub(), sub("Coding")] }).length, 0);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent(), subtasks: [] }).length, 0);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent("Task", "Done"), subtasks: [sub()] }).length, 0);
});
test("epic opt-in and generic event conditions work", () => {
 const r = { ...template("parent-auto-done", { project: "NAIL", includeEpics: true }), enabled: true };
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent("Epic"), subtasks: [sub()] }).length, 1);
 const custom = { id: "comment-label", enabled: true, trigger: { event: "comment_created", project: "NAIL" }, conditions: { labels: ["automation"] }, actions: [{ type: "label", target: "issue", label: "triaged" }] };
 const i = sub("Coding"); i.fields.labels = ["automation"];
 assert.equal(planRule(custom, i, "comment_created", {}).length, 1);
});
test("dry-run executes zero writes and preserves proposed actions", async () => {
 const calls = [], req = async (...a) => { calls.push(a); if (a[0] === "GET") return { ...parent(), fields: { ...parent().fields, subtasks: [sub()] } }; throw new Error("unexpected read"); };
 const r = { ...template("parent-auto-done", { project: "NAIL" }), enabled: true };
 const out = await evaluate(req, [r], sub(), "all_subtasks_done", { dry: true });
 assert.equal(out.length, 1); assert.equal(out[0].dry_run, true); assert.equal(calls.filter((x) => x[0] !== "GET").length, 0);
});
test("local process storage survives a reload", () => {
 const repo = mkdtempSync(join(tmpdir(), "ah-rules-")), r = template("parent-auto-done", { project: "NAIL" });
 saveRules(join(repo, ".agents/nailly-company/jira-listener-rules.json"), "nailly", [r]); assert.equal(loadRules(repo, "nailly").rules[0].trigger.project, "NAIL"); assert.equal(JSON.parse(readFileSync(join(repo, ".agents/nailly-company/jira-listener-rules.json"))).company, "nailly");
});
