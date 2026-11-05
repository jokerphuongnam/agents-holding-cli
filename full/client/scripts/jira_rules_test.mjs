import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { template, validateRule, planRule, evaluate, saveRules, loadRules } from "./jira-rules.mjs";
const sub = (status = "Done") => ({ key: "NAIL-2", fields: { status: { name: status, statusCategory: { key: status === "Done" ? "done" : "in-progress" } }, issuetype: { name: "Sub-task" }, parent: { key: "NAIL-1" }, labels: [] } });
const parent = (type = "Task", status = "In Progress") => ({ key: "NAIL-1", fields: { issuetype: { name: type }, status: { name: status, statusCategory: { key: "in-progress" } } } });
test("built-in template includes epics, is an opt-in CLI template, and validates", () => {
 const r = template("parent-auto-done", { project: "nail" }); assert.equal(r.trigger.project, "NAIL"); assert.equal(r.enabled, false); assert.equal(r.conditions.include_epics, true); assert.equal(r.builtin_default, true); assert.equal(validateRule(r), null); assert.equal(template("parent-auto-done").trigger.project, undefined);
 assert.equal(planRule({...r,enabled:true}, sub(), "all_subtasks_done", { parent: parent("Epic"), subtasks: [sub()] }).length, 1);
});
test("all subtasks Done transitions parent; pending subtask or Done parent does not", () => {
 const r = { ...template("parent-auto-done", { project: "NAIL" }), enabled: true };
 const p = planRule(r, sub(), "all_subtasks_done", { parent: parent(), subtasks: [sub()] });
 assert.deepEqual(p.map((a) => [a.type, a.key, a.to]), [["transition", "NAIL-1", "Done"]]);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent(), subtasks: [sub(), sub("Coding")] }).length, 0);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent(), subtasks: [] }).length, 0);
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent("Task", "Done"), subtasks: [sub()] }).length, 0);
});
test("epic opt-out and generic event conditions work", () => {
 const r = { ...template("parent-auto-done", { project: "NAIL", includeEpics: false }), enabled: true };
 assert.equal(planRule(r, sub(), "all_subtasks_done", { parent: parent("Epic"), subtasks: [sub()] }).length, 0);
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

test("default process has an enabled built-in rule; custom process and company overrides win", () => {
 const repo = mkdtempSync(join(tmpdir(), "ah-default-rule-"));
 let { rules } = loadRules(repo, "acme", { project: "acme", defaultProcess: true });
 assert.equal(rules[0].id, "parent-auto-done"); assert.equal(rules[0].enabled, true); assert.equal(rules[0].trigger.project, "ACME"); assert.equal(rules[0].conditions.include_epics, true);
 const file = ruleFileForTest(repo, "acme"); saveRules(file, "acme", []);
 rules = loadRules(repo, "acme", { project: "ACME", defaultProcess: false }).rules; assert.equal(rules.length, 0);
 saveRules(file, "acme", [{ ...template("parent-auto-done", { project: "ACME" }), enabled: false }]);
 rules = loadRules(repo, "acme", { project: "ACME", defaultProcess: true }).rules; assert.equal(rules.length, 1); assert.equal(rules[0].enabled, false);
});
function ruleFileForTest(repo, company) { return join(repo, `.agents/${company}-company/jira-listener-rules.json`); }
