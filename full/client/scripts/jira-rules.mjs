// Company-defined Jira Listener rules. Local process JSON, deterministic planning/execution (no model).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { client as jiraClient } from "./jira.mjs";

export const EVENTS = ["issue_transitioned", "all_subtasks_done", "assignee_changed", "label_added", "comment_created"];
export const ACTION_TYPES = ["transition", "assign", "label", "comment", "run_staff", "notify"];
export const RULE_TEMPLATES = {
  "parent-auto-done": {
    id: "parent-auto-done", name: "Parent auto-Done when all subtasks Done", enabled: false, builtin_default: true,
    trigger: { event: "all_subtasks_done" },
    conditions: { issue_types: ["Sub-task"], include_epics: true, require_subtasks: true },
    actions: [{ type: "transition", target: "parent", to: "Done" }],
  },
};
const KEY = /^[A-Z][A-Z0-9_]{0,19}$/, ID = /^[a-z0-9][a-z0-9-]{0,50}$/;
const lower = (a) => (a ?? []).map((x) => String(x).toLowerCase());
const typeOf = (i) => String(i?.fields?.issuetype?.name ?? "").toLowerCase();
const statusOf = (i) => String(i?.fields?.status?.name ?? "").toLowerCase();
const done = (i) => i?.fields?.status?.statusCategory?.key === "done" || statusOf(i) === "done";
export function validateRule(r) {
  if (!ID.test(r?.id ?? "")) return "rule id must be kebab-case";
  if (!EVENTS.includes(r?.trigger?.event)) return `trigger.event must be one of ${EVENTS.join(", ")}`;
  if (r.trigger.project && !KEY.test(r.trigger.project)) return "trigger.project must be a Jira project key";
  if (!Array.isArray(r.actions) || !r.actions.length) return "at least one action is required";
  for (const a of r.actions) {
    if (!ACTION_TYPES.includes(a?.type)) return `unknown action ${a?.type}`;
    if (["transition", "assign", "label", "run_staff", "notify"].includes(a.type) && !(a.to ?? a.label ?? a.staff ?? a.text)) return `${a.type} needs a value`;
    if (a.type === "comment" && !a.text) return "comment needs text";
    if (a.target && !["issue", "parent"].includes(a.target)) return "action target must be issue or parent";
  }
  return null;
}
export function template(name, { project, id, includeEpics = true } = {}) {
  const base = RULE_TEMPLATES[name]; if (!base) throw new Error(`unknown template ${name}; available: ${Object.keys(RULE_TEMPLATES).join(", ")}`);
  const r = structuredClone(base); r.id = id ?? r.id; r.trigger.project = project?.toUpperCase(); if (r.conditions) r.conditions.include_epics = includeEpics;
  const e = validateRule(r); if (e) throw new Error(e); return r;
}
export async function defaultProcess(company, call) {
  if (!call) return false;
  try { const r = await call("get_company_flow", { company }); return r?.custom === false; } catch { return false; }
}
export function ruleFile(repo, company) {
  const agents = join(repo, ".agents");
  const dir = join(agents, `${company}-company`);
  return join(existsSync(dir) ? dir : agents, "jira-listener-rules.json");
}
export function loadRules(repo, company, { project, defaultProcess = false } = {}) {
  const file = ruleFile(repo, company); let data = { version: 1, company, rules: [] };
  try { data = { ...data, ...JSON.parse(readFileSync(file, "utf8")) }; } catch {}
  let rules = data.rules ?? [];
  if (defaultProcess && !rules.some((r) => r.id === "parent-auto-done")) {
    const r = template("parent-auto-done", { project }); r.enabled = true; rules = [r, ...rules];
  }
  return { file, rules };
}
export function saveRules(file, company, rules) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ version: 1, company, rules }, null, 2) + "\n", { mode: 0o600 });
}
export function matches(r, issue, event, { parent, subtasks = [] } = {}) {
  if (!r.enabled || r.trigger.event !== event) return false;
  const f = issue?.fields ?? {}, project = issue?.key?.split("-")[0];
  if (r.trigger.project && r.trigger.project !== project) return false;
  if (r.trigger.statuses?.length && !lower(r.trigger.statuses).includes(statusOf(issue))) return false;
  const c = r.conditions ?? {};
  if (c.issue_types?.length && !lower(c.issue_types).includes(typeOf(issue))) return false;
  if (c.labels?.length && !c.labels.every((x) => (f.labels ?? []).includes(x))) return false;
  if (typeOf(parent) === "epic" && !c.include_epics) return false;
  if (event === "all_subtasks_done") {
    if (!parent) return false;
    if (c.require_subtasks !== false && !subtasks.length) return false;
    if (!subtasks.length || !subtasks.every(done) || done(parent)) return false;
  }
  return true;
}
const interpolate = (s, issue, parent) => String(s ?? "").replaceAll("{issue}", issue.key).replaceAll("{parent}", parent?.key ?? "").replaceAll("{status}", issue.fields?.status?.name ?? "");
export function planRule(r, issue, event, { parent, subtasks = [] } = {}) {
  if (!matches(r, issue, event, { parent, subtasks })) return [];
  return r.actions.map((a, index) => ({ ...a, target: a.target ?? "issue", key: (a.target === "parent" ? parent : issue)?.key, rule: r.id, index, text: interpolate(a.text, issue, parent) })).filter((a) => a.key);
}
export async function contextFor(req, issue) {
  const parentKey = issue.fields?.parent?.key;
  const parent = parentKey ? await req("GET", `/issue/${encodeURIComponent(parentKey)}?fields=summary,status,issuetype,parent,labels,assignee,subtasks`) : null;
  return { parent, subtasks: parent?.fields?.subtasks ?? [] };
}
export async function executeActions(req, actions, { dry = true, runStaff, notify } = {}) {
  const out = [];
  for (const a of actions) {
    try {
      if (!dry) {
        if (a.type === "transition") {
          const ts = (await req("GET", `/issue/${encodeURIComponent(a.key)}/transitions`)).transitions ?? [];
          const hit = ts.find((t) => t.to?.name?.toLowerCase() === a.to.toLowerCase());
          if (!hit) throw new Error(`no transition to ${a.to} for ${a.key}`);
          await req("POST", `/issue/${encodeURIComponent(a.key)}/transitions`, { transition: { id: hit.id } });
        } else if (a.type === "assign") await req("PUT", `/issue/${encodeURIComponent(a.key)}/assignee`, { accountId: a.to === "source-assignee" ? null : a.to });
        else if (a.type === "label") await req("PUT", `/issue/${encodeURIComponent(a.key)}`, { update: { labels: [{ add: a.label }] } });
        else if (a.type === "comment") await req("POST", `/issue/${encodeURIComponent(a.key)}/comment`, { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: a.text }] }] } });
        else if (a.type === "run_staff") await runStaff?.(a);
        else if (a.type === "notify") await notify?.(a);
      }
      out.push({ ...a, ok: true, dry_run: dry });
    } catch (e) { out.push({ ...a, ok: false, error: e.message }); }
  }
  return out;
}
export async function evaluate(req, rules, issue, event, options = {}) {
  const ctx = await contextFor(req, issue), actions = rules.flatMap((r) => planRule(r, issue, event, ctx));
  return executeActions(req, actions, options);
}
async function main(argv) {
  const { resolveCompany } = await import("./company.mjs");
  const co = resolveCompany().company; if (!co) throw new Error("no company: run in a company repo or pass --company");
  let repo = process.cwd(); const ri = argv.indexOf("--repo"); if (ri >= 0) repo = resolve(argv.splice(ri, 2)[1]); else while (!existsSync(join(repo, ".agents")) && repo !== dirname(repo)) repo = dirname(repo);
  const cmd = argv.shift() ?? "list";
  const flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv.splice(i, 2)[1]; };
  const has = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
  flag("--company"); // company was already resolved from this option
  const templateProject = flag("--project")?.toUpperCase();
  const { defaultProcess } = await import("./jira-rules.mjs");
  const isDefault = await defaultProcess(co, async (name, args) => {
    const { readFileSync } = await import("node:fs");
    const { licenseKey, deviceId } = await import("./skills.mjs");
    const home = homedir(), key = licenseKey();
    if (!key) return null;
    const base = process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp";
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}`, "X-AH-Version": readFileSync(join(dirname(new URL(import.meta.url).pathname), "VERSION"), "utf8").trim() };
    const device = deviceId(); if (device) headers["X-AH-Device"] = device;
    const r = await fetch(base, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }), signal: AbortSignal.timeout(30000) });
    const j = await r.json(), t = j.result?.content?.[0]?.text; if (!t || j.result?.isError) throw new Error(t ?? `MCP HTTP ${r.status}`); return JSON.parse(t);
  });
  const cliProject = templateProject;
  let projectKey = cliProject;
  if (!projectKey) { try { const reg = JSON.parse(readFileSync(join(homedir(), ".config/agents-holding/projects.json"), "utf8")); projectKey = reg.projects?.find((p) => p.path === repo)?.boards?.find((b) => b.company === co)?.project_key; } catch {} }
  const { file, rules } = loadRules(repo, co, { project: projectKey, defaultProcess: isDefault });
  if (cmd === "list") { console.log(`${file}\n${rules.length ? rules.map((r) => `${r.id}: ${r.enabled ? "enabled" : "draft"}; ${r.trigger.event}; ${r.actions.map((a) => a.type).join(", ")}`).join("\n") : "No rules. Add: holding process rule add --template parent-auto-done --project NAIL"}`); return; }
  if (cmd === "add") {
    let r; const json = flag("--json"), t = flag("--template");
    if (json) r = JSON.parse(json); else r = template(t ?? "parent-auto-done", { project: templateProject, id: flag("--id"), includeEpics: !has("--exclude-epics") });
    const err = validateRule(r); if (err) throw new Error(err);
    const enable = has("--enable"), replace = has("--replace"); if (replace && !enable) r.enabled = rules.find((x) => x.id === r.id)?.enabled ?? false; else r.enabled = enable;
    if (rules.some((x) => x.id === r.id) && !replace) throw new Error(`rule ${r.id} exists; use --replace to change it`);
    saveRules(file, co, [...rules.filter((x) => x.id !== r.id), r]); console.log(`${r.enabled ? "Enabled" : "Draft saved"}: ${r.id}\nTest: holding process rule test ${r.id}\n${r.enabled ? "Restart: holding listener start" : `Enable: holding process rule add --json '${JSON.stringify({ ...r, enabled: true })}' --replace`}`); return;
  }
  if (cmd === "remove") { const id = argv[0]; if (!rules.some((r) => r.id === id)) throw new Error(`no rule ${id}`); saveRules(file, co, rules.filter((r) => r.id !== id)); console.log(`Removed ${id}; no Jira writes were made.`); return; }
  if (cmd === "test") {
    const id = argv[0], r = rules.find((x) => x.id === id); if (!r) throw new Error(`no rule ${id}`);
    const draft = { ...r, enabled: true }; // test a draft without enabling it
    let A = await (await import("./attach.mjs")).atlassian(homedir());
    if (!A?.auth && process.env.AH_JIRA_TEST_TOKEN) { const cfg = JSON.parse((await import("node:fs")).readFileSync(join(homedir(), ".config/agents-holding/jira.json"), "utf8")); A = { ...cfg, auth: () => "Basic " + Buffer.from(`${cfg.email}:${process.env.AH_JIRA_TEST_TOKEN}`).toString("base64"), jira: cfg.site.replace(/\/$/, "") + "/rest/api/3" }; }
    const req = jiraClient(A);
    let issue, key = flag("--issue")?.toUpperCase();
    if (key) issue = await req("GET", `/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,parent,labels,assignee,updated`);
    else {
      const project = r.trigger.project; if (!project) throw new Error("pass --issue KEY for a rule without a project");
      const j = await req("POST", "/search/jql", { jql: `project = ${project} AND parent is not EMPTY ORDER BY updated DESC`, fields: ["summary", "status", "issuetype", "parent", "labels", "assignee", "updated"], maxResults: 20 });
      const candidates = j.issues ?? [];
      for (const i of candidates) { const c = await contextFor(req, i); if (matches(draft, i, r.trigger.event, c)) { issue = i; break; } }
      issue ??= candidates[0];
    }
    if (!issue) { console.log("Dry-run: no real Jira subtask found; no writes made."); return; }
    const out = await evaluate(req, [draft], issue, r.trigger.event, { dry: true });
    console.log(JSON.stringify({ dry_run: true, jira_writes: 0, issue: issue.key, parent: issue.fields?.parent?.key ?? null, rule: r.id, actions: out, enabled: r.enabled }, null, 2)); return;
  }
  throw new Error("usage: holding process rule add|list|remove|test");
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
