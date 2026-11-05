// Jira Listener: executes the company's user-defined processes (holding company process ...). Reads REAL Jira issues/links (never fakes
// events); each action runs on its own (partial failures isolated), idempotent (executed-action ids persisted), loop-safe (chain).
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { companyProcesses, planProcesses } from "./policy-core.mjs";
import { move, comment } from "./jira.mjs";

export function loadState(file) { try { const j = JSON.parse(readFileSync(file, "utf8")); return { chains: j.chains ?? {}, done: new Set(j.done ?? []) }; } catch { return { chains: {}, done: new Set() }; } }
async function act(req, a, notify) {
  if (a.type === "transition") return move(req, a.target, a.to);
  if (a.type === "comment") return comment(req, a.target, a.text);
  if (a.type === "assign") { let id = a.to; if (id === "source-assignee") id = (await req("GET", `/issue/${encodeURIComponent(a.source)}?fields=assignee`)).fields?.assignee?.accountId;
    if (!id) throw new Error("no assignee to copy"); return req("PUT", `/issue/${encodeURIComponent(a.target)}/assignee`, { accountId: id }); }
  if (a.type === "notify_ceo") return notify(a);
}
/** procs = companyProcesses(layer); sources = Jira issues (with status + issuelinks). */
export async function runProcesses(req, procs, sources, { state = { chains: {}, done: new Set() }, allowed = () => true, notify = async () => {}, audit = () => {}, log = () => {} } = {}) {
  const res = [];
  for (const s of sources) {
    const plan = planProcesses(procs, s, { chain: state.chains[s.key] ?? [], allowed, done: state.done });
    for (const k of plan.skip) res.push({ source: s.key, target: k.key, process: k.process, ok: true, skipped: k.why });
    for (const a of plan.run) {
      let r; try { await act(req, a, notify); state.done.add(a.id); if (a.type === "transition") state.chains[a.target] = a.chain; r = { ok: true }; log(`process ${a.process}: ${a.type} ${a.target ?? a.source} ok`); }
      catch (e) { r = { ok: false, error: e.message }; log(`process ${a.process}: ${a.type} ${a.target ?? a.source} failed: ${e.message}`); }
      res.push({ source: s.key, target: a.target ?? null, process: a.process, type: a.type, ...r }); audit({ process: a.process, type: a.type, source: s.key, target: a.target ?? null, to: a.to ?? null, ...r });
    }
  }
  return res;
}
export const propagate = (req, rules, sources, o = {}) => runProcesses(req, rules.map((r) => ({ id: `link-${r.source.toLowerCase()}`, project: r.source, statuses: r.statuses, targets: r.targets, link_types: r.link_types, actions: [{ type: "transition", to: r.target_status }] })), sources, { ...o, state: { chains: o.chains ?? {}, done: new Set() } });
/** Listener sweep: JQL for recently-changed source issues per process, then run. */
export async function sweep(req, companyLayer, { stateDir, minutes = 30, allowed, notify, log = () => {} } = {}) {
  const procs = companyProcesses(companyLayer); if (!procs.length) return [];
  mkdirSync(stateDir, { recursive: true }); const file = join(stateDir, "processes.json"), state = loadState(file), sources = new Map();
  for (const p of procs) {
    const jql = `project = "${p.project}" AND status in (${p.statuses.map((x) => `"${x.replace(/"/g, "")}"`).join(",")}) AND updated >= -${minutes}m`;
    const j = await req("POST", "/search/jql", { jql, fields: ["summary", "status", "issuelinks"], maxResults: 50 });
    for (const i of j.issues ?? []) sources.set(i.key, i);
  }
  const res = await runProcesses(req, procs, [...sources.values()], { state, allowed, notify, log, audit: (a) => appendFileSync(join(stateDir, "process-audit.log"), JSON.stringify({ at: new Date().toISOString(), ...a }) + "\n") });
  writeFileSync(file, JSON.stringify({ chains: state.chains, done: [...state.done].slice(-5000) })); return res;
}
