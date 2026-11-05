import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EVENTS, template, validateRule, planRule, evaluate, executeActions, saveRules, loadRules, defaultProcess } from "./jira-rules.mjs";
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

test("default-process lookup is read-only and explicit for custom workflows", async () => { const calls = []; const call = async (name, args) => { calls.push([name,args]); return { custom: false }; }; assert.equal(await defaultProcess("acme", call), true); assert.deepEqual(calls, [["get_company_flow", { company: "acme" }]]); assert.equal(await defaultProcess("acme", async () => ({ custom: true })), false); });

test("all event/action types dry-run across trigger conditions with zero side effects", async () => {
 let reads=0,writes=0,staff=0,notices=0; const req=async(method)=>{if(method==="GET"){reads++;return null;}writes++;throw new Error("write attempted");};
 for(const event of EVENTS){
  const r={id:`event-${event.replaceAll("_","-")}`,enabled:true,trigger:{event},actions:[{type:"transition",to:"Done"},{type:"assign",to:"account-unit"},{type:"label",label:"triaged"},{type:"comment",text:"event {issue}"},{type:"run_staff",staff:"qa"},{type:"notify",text:"done"}]};
  const issue={key:"UNIT-1",fields:{status:{name:"In Progress"},issuetype:{name:"Task"},labels:[]}};
  const ctx=event === "all_subtasks_done" ? {parent:issue,subtasks:[{fields:{status:{name:"Done",statusCategory:{key:"done"}}}}]} : {};
  const actions=r.actions.flatMap((a)=>planRule({...r,actions:[a]},issue,event,ctx));
  const out=await executeActions(req,actions,{dry:true,runStaff:()=>staff++,notify:()=>notices++});
  assert.equal(out.length,6);assert.ok(out.every((a)=>a.ok&&a.dry_run));
 }
 assert.equal(writes,0);assert.equal(staff,0);assert.equal(notices,0);assert.equal(reads,0);
});
test("event filters for status, project, labels, issue type and disabled rules",()=>{
 const issue={key:"UNIT-1",fields:{status:{name:"Review"},issuetype:{name:"Bug"},labels:["automation","urgent"]}};
 const r={id:"filters",enabled:true,trigger:{event:"issue_transitioned",project:"UNIT",statuses:["review"]},conditions:{labels:["automation"],issue_types:["Bug"]},actions:[{type:"notify",text:"notify"}]};
 assert.equal(planRule(r,issue,"issue_transitioned").length,1);assert.equal(planRule({...r,enabled:false},issue,"issue_transitioned").length,0);
 assert.equal(planRule(r,{...issue,key:"OTHER-1"},"issue_transitioned").length,0);assert.equal(planRule(r,{...issue,fields:{...issue.fields,labels:[]}},"issue_transitioned").length,0);
});
test("dry-run never invokes staff or notification even when callbacks would fail",async()=>{
 const r={id:"callbacks",enabled:true,trigger:{event:"notify_created"},actions:[]}; // malformed rule is rejected instead of executing unknown work
 assert.match(validateRule(r),/trigger.event/);
 const actions=[{type:"run_staff",staff:"qa",key:"UNIT-1"},{type:"notify",text:"hi",key:"UNIT-1"}];
 const out=await executeActions(async()=>{throw new Error("unexpected Jira request");},actions,{dry:true,runStaff:()=>{throw new Error("staff started");},notify:()=>{throw new Error("notification sent");}});
 assert.deepEqual(out.map((x)=>x.ok),[true,true]);assert.ok(out.every((x)=>x.dry_run));
});
test("comment interpolation cannot fabricate parent data",()=>{const r={id:"comment",enabled:true,trigger:{event:"comment_created"},actions:[{type:"comment",text:"{issue}/{parent}/{status}"}]};const issue={key:"UNIT-9",fields:{status:{name:"Review"},issuetype:{name:"Task"}}};const a=planRule(r,issue,"comment_created")[0];assert.equal(a.text,"UNIT-9//Review");});
