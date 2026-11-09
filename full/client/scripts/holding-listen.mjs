#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// holding listener run: wake the LOCAL agent when the server broadcasts a next_action for this repo's company.
// Multi-project: one process for every repo in ~/.config/agents-holding/projects.json (see registry.mjs; --repo DIR = only that repo).
// Usage: holding listener run [--repo DIR] [--once] [--dry-jira] | [--run ISSUE --event E --stage S [--dry-jira]]   (license: $AGENTS_HOLDING_KEY or Keychain agents-holding-license|agents-holding-test-license)
// One agent run at a time; events arriving during a run are coalesced into one follow-up run. Logs: ~/Library/Logs/agents-holding/.
import * as O from "./outbound.mjs";
import { localMeta, crawlPublic } from "./skills.mjs";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, openSync, closeSync, unlinkSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import * as L from "./lean.mjs";
import { enrichBriefWithPackSkills, enrichBriefWithLocalSkills } from "./pack-skills.mjs";
import * as P from "./providers/index.mjs";
import * as R from "./registry.mjs";
import * as X from "./resilience.mjs";
import * as POL from "./policy.mjs";
import * as XT from "./crossteam.mjs";
import { client as jiraRaw } from "./jira.mjs";
import * as JR from "./jira-rules.mjs";
import * as ME from "./mirror-executor.mjs";
import { atlassianToken } from "./attach.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const onlyRepo = opt("--repo") ? resolve(opt("--repo")) : null;
let repo = onlyRepo ?? process.cwd(); // current run's repo (one run at a time; set per run by useCtx)
let runRepos = [repo];
const once = args.includes("--once");
const base = process.env.AH_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co";
const grokBin = process.env.GROK_BIN ?? "grok";
const logDir = join(homedir(), "Library/Logs/agents-holding");
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, "jira-listener.log");
process.title = "Jira Listener";
const runTimeoutMs = Number(process.env.AH_RUN_TIMEOUT_MIN ?? 15) * 60 * 1000; // hard cap per agent run
const stallMs = Number(process.env.AH_STALL_MIN ?? 5) * 60 * 1000;            // no session activity -> loud warning
const log = (...m) => { const l = `${new Date().toISOString()} ${m.join(" ")}`; appendFileSync(logFile, l + "\n"); console.log(l); };

function license() {
  // Env override, then macOS Keychain (agents-holding-license, then agents-holding-test-license). Never plaintext files.
  if (process.env.AGENTS_HOLDING_KEY) return process.env.AGENTS_HOLDING_KEY.trim();
  for (const svc of ["agents-holding-license", "agents-holding-test-license"]) {
    try { const v = execFileSync("security", ["find-generic-password", "-s", svc, "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); if (v) return v; } catch {}
  }
  throw new Error('no license: set AGENTS_HOLDING_KEY or: security add-generic-password -U -s agents-holding-license -a "$USER" -w');
}
const key = license();
// 1 key = 1 machine: per-machine id generated once by connect.sh/install.sh into the Keychain (agents-holding-device).
const device = (() => { if (process.env.AGENTS_HOLDING_DEVICE) return process.env.AGENTS_HOLDING_DEVICE.trim();
  try { return execFileSync("security", ["find-generic-password", "-s", "agents-holding-device", "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } })();
const deviceHeaders = device ? { "X-AH-Device": device, "X-AH-Device-Name": (process.env.AGENTS_HOLDING_DEVICE_NAME || hostname()).slice(0, 80) } : {};
// ---- project registry (many-to-many Jira boards <-> repos); old single-repo setup is migrated once ----
const jiraSite = (() => { try { return JSON.parse(readFileSync(join(homedir(), ".config/agents-holding/jira.json"), "utf8")).site ?? null; } catch { return null; } })();
let registry = R.load(homedir());
if (!registry) {
  registry = R.migrate(homedir(), onlyRepo ?? process.env.AH_REPO_DIR ?? process.cwd(), { site: jiraSite });
  if (!registry) throw new Error("no projects: run `holding project add --jira-project KEY` inside a repo");
  R.save(homedir(), registry); log(`registry: migrated ${registry.projects[0].path} into ${R.registryPath(homedir())}`);
}
const registration = R.reconcile(registry);
if (registration.repaired.length) { R.save(homedir(), registry); log(`registry: auto-repaired ${registration.repaired.length} canonical mapping issue(s)`); }
for (const issue of registration.issues) log(`registry: ${issue.code}: ${issue.message}`);
if (onlyRepo) {
  registry = { ...registry, projects: registry.projects.filter((p) => p.path === onlyRepo) };
  if (!registry.projects.length) { const m = R.migrate(homedir(), onlyRepo, { site: jiraSite }); if (!m) throw new Error(`${onlyRepo}: no .agents/company.json and not in projects.json`); registry = m; }
}
const companyList = R.companies(registry);
let company = companyList[0];
const envStatusSyncSec = process.env.AH_JIRA_RECONCILE_SEC === undefined ? null : Math.min(86400, Math.max(60, Number(process.env.AH_JIRA_RECONCILE_SEC) || 60));
const statusSyncSec = Object.fromEntries(companyList.map((c) => [c, 60]));
const statusSyncAt = Object.fromEntries(companyList.map((c) => [c, 0]));
for (const p of registry.projects) log(`project ${p.name} ${p.path} boards ${p.boards.map((b) => `${b.project_key}@${b.company}`).join(",")} settings ${JSON.stringify(p.settings ?? {})}`);

// Server health: down / 5xx / timeout / quota -> red warning + one notification; recovery -> reconcile missed Jira changes.
const server = { down: null };
function serverDown(c) {
  const first = !server.down || server.down.cause !== c.cause;
  server.down = { cause: c.cause, msg: c.msg, since: server.down?.since ?? new Date().toISOString(), until: c.cause === "quota" ? Date.now() + 60000 : 0 };
  if (!first && c.cause === "quota") return;
  log(`\x1b[31mSERVER ${c.cause.toUpperCase()}: ${c.msg}\x1b[0m`);
  L.writeStatus(homedir(), { server: { state: c.cause, msg: c.msg, since: server.down.since } });
  if (first || c.cause === "quota") L.desktopNotify(homedir(), "agents-holding", c.cause === "quota" ? X.QUOTA_MSG : `Server problem: ${c.msg}. Work pauses; missed Jira changes are replayed on recovery.`);
}
function serverUp() {
  if (!server.down) return; const was = server.down; server.down = null;
  log(`server back after ${was.cause} since ${was.since}; reconciling missed Jira changes`);
  L.writeStatus(homedir(), { server: { state: "ok", msg: "", since: null, recovered_at: new Date().toISOString() } });
  L.desktopNotify(homedir(), "agents-holding", "Server is back; replaying missed Jira changes");
  for (const c of companyList) reconcile(c, was.since).catch((e) => log("reconcile failed:", e.message));
}
// Credits: key inactive or out of credits -> the Jira Listener stops working (no agent runs) until the owner adds credits/renews;
// it keeps the heartbeat so it resumes by itself. Message from the server (language of the input).
const credit = { blocked: null };
function creditBlock(msg) {
  const m = String(msg ?? "").replace(/\s*\[AH_NO_CREDIT\]/, "").trim();
  if (credit.blocked) return; credit.blocked = { msg: m, since: new Date().toISOString() };
  log(`\x1b[31mJIRA LISTENER STOPPED: ${m}\x1b[0m`);
  L.writeStatus(homedir(), { credit: { blocked: true, msg: m, since: credit.blocked.since } });
  L.desktopNotify(homedir(), "agents-holding", `Jira Listener stopped: ${m}`);
}
function creditOk() {
  if (!credit.blocked) return; credit.blocked = null; log("credits available again: Jira Listener resumes");
  L.writeStatus(homedir(), { credit: { blocked: false, msg: "", since: null } });
  for (const c of companyList) reconcile(c).catch((e) => log("reconcile failed:", e.message));
}
async function mcp(name, a) {
  if (server.down?.cause === "quota" && Date.now() < (server.down.until ?? 0)) throw new X.ServerError(server.down);
  if (O.governed(name)) a = O.outbound(name, a); // single outbound allowlist (telemetry / crawl / billing)
  let r, body;
  try { r = await fetch(`${base}/functions/v1/mcp`, { method: "POST", signal: AbortSignal.timeout(Number(process.env.AH_MCP_TIMEOUT_MS ?? 60000)), headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": AH_CLIENT_VERSION, Authorization: `Bearer ${key}`, ...deviceHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }) }); body = await r.text(); }
  catch (e) { const c = X.classifyServer({ err: e }); serverDown(c); throw new X.ServerError(c); }
  const c = X.classifyServer({ status: r.status, body });
  if (c.cause !== "ok" && c.cause !== "auth") { serverDown(c); throw new X.ServerError(c); }
  let j; try { j = JSON.parse(body); } catch { throw new Error(`${name} failed: HTTP ${r.status}`); } const t = j.result?.content?.[0]?.text;
  if (j.result?.isError && /quota|limit (reached|exceeded)/i.test(t ?? "")) { const q = { cause: "quota", msg: X.QUOTA_MSG }; serverDown(q); throw new X.ServerError(q); }
  if (j.result?.isError && /AH_NO_CREDIT/.test(t ?? "")) { creditBlock(t); throw new Error(`${name} stopped: ${t}`); }
  if (!t || j.result.isError) throw new Error(`${name} failed: ${t ?? JSON.stringify(j.error)}`);
  if (r.ok) serverUp();
  const v = JSON.parse(t);
  if (name === "listener_heartbeat") { if (v?.credit_blocked) creditBlock(v.credit_message); else creditOk(); }
  return v;
}

// ---- server-side last-seen heartbeat (for /listener and /doctor); best effort ----
const autostartPlist = join(homedir(), "Library/LaunchAgents/com.agentsholding.jira-listener.plist");
// Every 60s (server marks the Jira Listener offline after ~2.5 min without one). Back after an outage: post the offline
// comment once on every card that changed meanwhile (text from the server, task language), then reconcile replays the change.
const myJira = {}; // enterprise: this key's Jira account; work starts only on cards assigned to it
let lastBeat = 0;
const joined = new Set();
const mcpJiraFallback = !args.includes("--no-jira-mcp-fallback") && process.env.AH_JIRA_MCP_FALLBACK !== "0";
const readiness = () => joined.size === companyList.length && companyList.length > 0 && (listenerJira || mcpJiraFallback);
const heartbeatIfStale = () => { if (Date.now() - lastBeat > 300000) heartbeat(); };
const heartbeat = (requested = "online") => { const state = requested === "stopped" ? "stopped" : (readiness() ? "online" : "starting"); if (state === "online") log("readiness online", companyList.join(",")); return (lastBeat = Date.now(), Promise.all(companyList.map((company) => mcp("listener_heartbeat", { company, host: hostname(), pid: process.pid, autostart: existsSync(autostartPlist), version: AH_CLIENT_VERSION, state, meta: { ...localMeta(), jira_ready: listenerJira, process_ready: true, realtime_ready: readiness() } })
  .then(async (r) => { if (r?.communication) commMode[company] = r.communication; if (r?.enterprise) myJira[company] = r.jira_account ?? null; if (envStatusSyncSec === null && Number.isInteger(r?.jira_status_sync_sec)) statusSyncSec[company] = Math.min(86400, Math.max(60, r.jira_status_sync_sec)); L.writeStatus(homedir(), { companies: { [company]: { heartbeat_at: new Date().toISOString(), heartbeat_ok: true, jira_status_sync_sec: envStatusSyncSec ?? statusSyncSec[company] } } });
    if (state !== "online" || !(r?.was_offline || r?.missed?.length)) return;
    log(`Jira Listener back online for ${company} (server saw it offline since ${r.offline_since ?? "?"}); ${r.missed?.length ?? 0} card(s) changed meanwhile`);
    for (const m of r.missed ?? []) if (m.issue && m.comment) await comms(m.issue, m.comment);
    reconcile(company, r.offline_since ?? undefined).catch((e) => log("reconcile failed:", e.message)); return true; })
  .catch((e) => { log("heartbeat failed:", e.message); L.writeStatus(homedir(), { companies: { [company]: { heartbeat_at: new Date().toISOString(), heartbeat_ok: false } } }); return false; })))).then((results) => {
    const ok = results.every(Boolean);
    L.writeStatus(homedir(), { listener_state: state, ...(ok && state === "online" ? { heartbeat_ok_at: new Date().toISOString() } : {}) });
    return ok;
  }); };
L.writeStatus(homedir(), { pid: process.pid, started_at: new Date().toISOString(), notify: L.notifyOn(homedir()), running: null, listener_state: "starting", companies: {} });
// Keep the server heartbeat comfortably below the watchdog's 150s stale window.
// This is also the Rust listener contract: heartbeat is liveness, not event polling.
setInterval(heartbeat, Number(process.env.AH_HEARTBEAT_SEC ?? 60) * 1000);

// Auto-Done / Verified on Develop: poll gh for real merged PRs linked to issue keys (never forge Jira events).
const mergedPrSeen = new Set();
async function pollMergedForProjects() {
  for (const prj of registry.projects) {
    let list = [];
    try { list = L.pollMergedPrs(prj.path, { sinceHours: Number(process.env.AH_PR_POLL_HOURS ?? 72) }); }
    catch (e) { log(`pr-poll ${prj.name}: ${e.message}`); continue; }
    for (const pr of list) {
      const id = `${prj.path}:${pr.number || pr.url}`;
      if (mergedPrSeen.has(id)) continue;
      const company = (prj.boards.find((b) => pr.key.startsWith(b.project_key + "-")) ?? prj.boards[0])?.company;
      if (!company) continue;
      try {
        const r = await mcp("pr_merged", { company, task: pr.key, base: pr.base, branch: pr.branch, pr_url: pr.url, title: pr.title });
        mergedPrSeen.add(id);
        log(`pr-merged ${pr.key}: ${pr.branch} -> ${pr.base} => stage ${r?.stage ?? "?"} (${pr.url ?? ""})`);
        if (r?.move_to && listenerJira) {
          try {
            const cfgPath = join(homedir(), ".config/agents-holding/jira.json");
            if (!existsSync(cfgPath)) { log(`pr-merged: no jira.json; server stage ${r.stage}, card not moved`); continue; }
            const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
            const site = String(cfg.site || "").replace(/\/$/, "");
            const tok = L.jiraToken(cfg); const a = tok ? "Basic " + Buffer.from(`${cfg.email}:${tok}`).toString("base64") : null;
            if (!a) { log("pr-merged: no Jira token in Keychain"); continue; }
            if (dryJira) { log(`JIRA (dry): transition ${pr.key} -> ${r.move_to}`); continue; }
            const tr = await fetch(`${site}/rest/api/3/issue/${encodeURIComponent(pr.key)}/transitions`, { headers: { Authorization: a, Accept: "application/json" } }).then((x) => x.json());
            const hit = (tr.transitions ?? []).find((x) => String(x.to?.name || "").toLowerCase() === String(r.move_to).toLowerCase());
            if (hit) {
              await fetch(`${site}/rest/api/3/issue/${encodeURIComponent(pr.key)}/transitions`, { method: "POST", headers: { Authorization: a, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ transition: { id: hit.id } }) });
              log(`JIRA: moved ${pr.key} -> ${hit.to.name} (PR merged)`);
            } else log(`pr-merged: no Jira transition to "${r.move_to}" for ${pr.key}`);
          } catch (e) { log(`pr-merged jira move failed: ${e.message}`); }
        }
      } catch (e) {
        if (/no such task|not found|unknown|REJECTED/i.test(String(e.message))) mergedPrSeen.add(id);
        log(`pr-merged ${pr.key}: ${e.message}`);
      }
    }
  }
}
setInterval(() => { pollMergedForProjects().catch((e) => log("pr-poll failed:", e.message)); }, Number(process.env.AH_PR_POLL_SEC ?? 120) * 1000);
setTimeout(() => { pollMergedForProjects().catch((e) => log("pr-poll failed:", e.message)); }, 15_000);
// Periodic public-skill crawl (same privacy rules as `holding skill sync`; never runs scripts).
async function crawlSkillsForCompanies() {
  for (const company of companyList) {
    try {
      const results = await crawlPublic(homedir(), { company });
      for (const r of results) {
        if (r.status === "uploaded") log(`skill-crawl ${company}/${r.name}: uploaded ${r.files} file(s)`);
        else if (r.status === "error") log(`skill-crawl ${company}/${r.name}: ${r.error}`);
        else if (r.status === "held_back" || r.status === "blocked") log(`skill-crawl ${company}/${r.name}: ${r.status}`);
      }
    } catch (e) { log(`skill-crawl ${company}: ${e.message}`); }
  }
}
setInterval(() => { crawlSkillsForCompanies().catch((e) => log("skill-crawl failed:", e.message)); }, Number(process.env.AH_SKILL_CRAWL_SEC ?? 3600) * 1000);
setTimeout(() => { crawlSkillsForCompanies().catch((e) => log("skill-crawl failed:", e.message)); }, 45_000);


// Clean shutdown (launchctl bootout/unload, holding listener stop, Ctrl-C, logout): tell the server right away.
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => { if (stopping) return; stopping = true;
  log(`\x1b[31m${sig}: Jira Listener stopping; telling the MCP server it is offline\x1b[0m`);
  L.writeStatus(homedir(), { stopped_at: new Date().toISOString(), stop_signal: sig });
  Promise.race([heartbeat("stopped"), new Promise((r) => setTimeout(r, 4000))]).finally(() => process.exit(0)); });
process.on("SIGUSR1", () => heartbeat()); // `holding listener autostart on|off` pokes us to report the new state

// ---- one-at-a-time runner (token saving) ----
// One grok run at a time, per-issue queue (latest wins). Token saving:
//  * chained stages: the server's next_action returns the run of agent stages up to the next gate; the agent does them in ONE run,
//    and agent_move notices for the issue being run are ignored (a post-run check re-runs only if work is left);
//  * one grok session per task: resumed (--resume) after gates, fresh session + compact server context as fallback;
//  * per-stage model hint from the company flow (--model), overridable with AH_MODEL;
//  * deterministic Jira moves: the listener moves the card after the run (Jira REST with ~/.config/agents-holding/jira.json),
//    no AI tokens; --dry-jira prints every Jira action instead and denies the Jira MCP to the agent;
//  * tokens per run from the grok session usage.json -> jira-listener.log + report_usage (/billing usage per task/stage).
const dryJira = args.includes("--dry-jira");
let sessFile, sessions;
const loadSessions = () => { sessFile = join(homedir(), ".config/agents-holding", `sessions-${company}.json`); try { sessions = JSON.parse(readFileSync(sessFile, "utf8")); } catch { sessions = {}; } };
loadSessions();
const saveSessions = () => { try { writeFileSync(sessFile, JSON.stringify(sessions, null, 1), { mode: 0o600 }); } catch (e) { log("session store failed:", e.message); } };
// ~/.config/agents-holding/jira.json (chmod 600): {"site","email","keychain_service"} -- NO token. The API token lives in the macOS
// Keychain (security add-generic-password -s <keychain_service> -a <email> -w) and is read per request, kept in memory only.
const jiraCfg = await (async () => { try {
  const connected = await atlassianToken(homedir());
  if (connected) return connected;
  const p = join(homedir(), ".config/agents-holding/jira.json"); const j = JSON.parse(readFileSync(p, "utf8"));
  if (j.token) log("WARNING: jira.json contains a token; it is ignored. Move it to the Keychain and delete the field.");
  if (j.site && j.email && j.keychain_service) return { site: j.site, email: j.email, keychain_service: j.keychain_service, oauth: !!j.oauth };
  if (j.site && j.oauth) return { site: j.site, email: j.email || "", keychain_service: j.keychain_service || "", oauth: true };
  return null; } catch { return null; } })();
const lean = process.env.AH_LEAN !== "0";
// Prefer legacy API-token client; OAuth handled in jiraOps via attach.atlassianToken (no browser in launchd).
const jira = jiraCfg ? L.jiraClient(jiraCfg, { dry: dryJira, log }) : null;
if (!jira) log("Jira client: not ready (holding jira connect or Atlassian OAuth required); listener will remain offline until credentials are available.");
// Communication (per company, from the heartbeat; `holding company set communication jira+chat|chat`): everything the user must act on
// (question, 1/2/3, hire, blocked, gate, QC stop, failed, which repo) ALWAYS goes to the CEO inbox + an 'Agents Holding'
// notification; Jira comments only in jira+chat mode. Labels/status/assignee update in both modes. Runs never wait for input:
// they post the item and exit; the answer (Jira comment, /ceo or holding inbox reply) re-triggers the task from its checkpoint.
const commMode = {};
const WORKFLOW_FAILURE_LABEL = "ah-workflow-failed";
const mirrorCache = new Map();
const mirrorSeen = new Set();
async function mirrorSync(company, project, issue, status, updated) {
  if (!jira) return;
  let cfg = mirrorCache.get(company);
  if (!cfg || Date.now() - cfg.at > 30000) {
    try {
      const listed = await mcp("list_jira_mirrors", { company });
      const mirrors = listed.data ?? [];
      const mapped = await Promise.all(mirrors.map(async (m) => {
        try { return { ...m, tasks: (await mcp("list_jira_mirror_tasks", { company, mirror_id: m.id })).data ?? [] }; }
        catch { return { ...m, tasks: [] }; }
      }));
      cfg = { at: Date.now(), mirrors: mapped };
      mirrorCache.set(company, cfg);
    } catch (e) { log(`mirror config unavailable for ${company}: ${e.message}`); return; }
  }
  for (const m of cfg.mirrors) {
    const src = m.mirroring; const ctl = m.mirrorer;
    if (!src || !ctl || src.project_key !== project && ctl.project_key !== project) continue;
    const task = (m.tasks ?? []).find((t) => (t.source_issue === issue || t.control_issue === issue));
    if (!task) continue;
    const side = task.source_issue === issue && src.project_key === project ? "source" : task.control_issue === issue && ctl.project_key === project ? "mirror" : null;
    if (!side) continue;
    const executor = ME.createMirrorExecutor({ jira, seen: mirrorSeen, log, notify: async (a) => {
      log(`mirror notification ${a.issue} -> ${a.status}`);
      try { await mcp("inbox_post", { company, issue: a.issue, kind: "other", need: "Mirror status update", body: `Mirror ${m.id}: ${a.status}` }); } catch (e) { log(`mirror notification failed: ${e.message}`); }
    }});
    await executor(m, { side, issue, status, updated, source_issue: task.source_issue, control_issue: task.control_issue });
  }
}
async function comms(issue, text, kind = null) {
  if (kind) {
    try { const it = await mcp("inbox_post", { company, issue, kind, need: L.INBOX_NEED[kind] ?? "needs you", body: String(text).slice(0, 8000) });
      log(`inbox: ${issue} ${kind} -> ${it.short_id}${it.new ? "" : " (updated)"}`);
      // User interaction is MCP/CEO inbox only. Never open a native dialog or
      // local action prompt for workflow questions, gates, or registration.
    } catch (e) { log(`inbox_post failed: ${e.message}`); }
  }
  if (commMode[company] === "chat") return log(`chat mode: not commenting on ${issue}${kind ? ` (${kind} is in the CEO inbox)` : ""}`);
  if (!jira) return log(`JIRA (no client): ${String(text).slice(0, 160).replace(/\n/g, " ")}`);
  await jira.comment(issue, text).catch((e) => log("Jira comment failed:", e.message));
}
const WAITING_LABEL = "ah-awaiting-user";
const USER_RECOVERY_EVENTS = new Set(["user_move", "user_comment", "review_feedback", "work_started", "user_approved", "staff_chosen", "staffing_choice", "staffing_retry"]);
async function clearWaitingSignal(issue, event) {
  if (!jira || !USER_RECOVERY_EVENTS.has(event)) return;
  try {
    const meta = await jira.meta(issue);
    if (!(meta.labels ?? []).includes(WAITING_LABEL)) return;
    await jira.labels(issue, [], [WAITING_LABEL]);
    await jira.comment(issue, `${L.staffTag("ceo")} WAITING CLEARED\nUser action received (${event}); resuming from the saved workflow checkpoint.`);
    log(`JIRA: cleared ${WAITING_LABEL} on ${issue} after ${event}`);
  } catch (e) { log(`Jira waiting flag clear failed for ${issue}:`, e.message); }
}
const ASSIGNMENT_LABEL = "ah-assignment-required", AGENT_OWNED_LABEL = "ah-agent-owned";
const claimInFlight = new Set();
async function ensureAgentOwnedAssignment(issue, na) {
  const qp = na?.queue_policy;
  if (!jira || qp?.enabled === false || qp?.assignment !== "connected_account" || !Array.isArray(qp.claim_stages) || !qp.claim_stages.includes(na.stage) || na.stage_definition?.gate || na.waiting) return true;
  if (claimInFlight.has(issue)) return false;
  claimInFlight.add(issue);
  const meta = await jira.meta(issue), current = meta.assignee?.accountId ?? null;
  if (current) { claimInFlight.delete(issue); return true; } // explicit assignment wins; never reassign a user-owned card.
  try {
    const account = await jira.assignSelf(issue);
    if (!account) throw new Error("connected Jira account could not be resolved");
    const after = await jira.meta(issue); if (after.assignee?.accountId && after.assignee.accountId !== account) { claimInFlight.delete(issue); log(`claim: ${issue} lost race to another assignee`); return false; }
    await jira.labels(issue, [AGENT_OWNED_LABEL], [ASSIGNMENT_LABEL]);
    if (!(meta.labels ?? []).includes(AGENT_OWNED_LABEL)) await jira.comment(issue, `[agent-holding] [Jira Listener] Task picked up from ${na.stage_definition.name}; assigned to the connected listener account and resuming from the current Jira checkpoint.`);
    await mcp("set_task_assignee", { company, task: issue, account });
    log(`claim: ${issue} -> connected Jira account at ${na.stage_definition?.name ?? na.stage}`); claimInFlight.delete(issue); return true;
  } catch (e) {
    if (!(meta.labels ?? []).includes(ASSIGNMENT_LABEL)) await jira.labels(issue, [ASSIGNMENT_LABEL]);
    await comms(issue, `[agent-holding] [Jira Listener] ASSIGNMENT REQUIRED\n${issue} is in agent-owned stage "${na.stage_definition.name}" but has no assignee. Automatic assignment to the connected listener account failed: ${e.message}. Reconnect Jira or grant Assign Issues permission, then reply in CEO/chat inbox; the listener will resume from this checkpoint.`, "assignment");
    log(`claim: ${issue} failed: ${e.message}`); claimInFlight.delete(issue); return false;
  }
}
async function announceWaiting(issue, na, p) {
  if (!jira || dryJira) return log(`JIRA (dry): waiting signal ${issue} (${na?.stage ?? "?"})`);
  try {
    const meta = await jira.meta(issue);
    if ((meta.labels ?? []).includes(WAITING_LABEL)) return;
    const reason = p.workflow_error ?? (na?.steps ?? []).filter(Boolean).join("\n") ?? `Waiting at ${na?.stage ?? "the current checkpoint"}.`;
    const text = `${L.staffTag("ceo")} WORKFLOW WAITING\n${reason}\n\nCorrect the requested Jira action, then the listener will resume automatically from the checkpoint.`;
    await jira.labels(issue, [WAITING_LABEL]);
    await jira.comment(issue, text);
    try { await mcp("inbox_post", { company, issue, kind: p.workflow_error ? "blocked" : "gate", need: "Jira workflow action required", body: text }); } catch (e) { log(`waiting inbox failed for ${issue}:`, e.message); }
    log(`JIRA: waiting signal ${issue} (${na?.stage ?? "?"})`);
  } catch (e) { log(`Jira waiting signal failed for ${issue}:`, e.message); }
}
const leanHome = lean ? L.leanGrokHome(homedir()) : null;
let listenerJira = dryJira || !!jiraCfg; // prefer local deterministic Jira; the agent MCP is an optional fallback
let jiraRouteCheckedAt = 0;
async function refreshJiraRoute() {
  if (dryJira || !jiraCfg) { listenerJira = false; return false; }
  if (Date.now() - jiraRouteCheckedAt < 30_000) return listenerJira;
  jiraRouteCheckedAt = Date.now();
  try {
    const A = await atlassianToken();
    const auth = A?.jira ? A.auth() : (() => { const tok = L.jiraToken(jiraCfg); return tok ? "Basic " + Buffer.from(`${jiraCfg.email}:${tok}`).toString("base64") : null; })();
    const site = A?.jira ?? String(jiraCfg.site || "").replace(/\/$/, "");
    if (!auth || !site) throw new Error("no local Jira credential");
    const r = await fetch(`${site}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: "application/json" } });
    if (r.status === 401 || r.status === 403) {
      listenerJira = false;
      log(`local Jira credential rejected (HTTP ${r.status}); ${mcpJiraFallback ? "agent Atlassian MCP fallback enabled" : "MCP fallback disabled"}`);
    } else if (r.ok) listenerJira = true;
    else log(`local Jira credential probe returned HTTP ${r.status}; keeping current Jira route`);
  } catch (e) {
    listenerJira = false;
    log(`local Jira credential unavailable; ${mcpJiraFallback ? "agent Atlassian MCP fallback enabled" : "MCP fallback disabled"} (${e.message})`);
  }
  return listenerJira;
}
const sessDir = (sid, home = join(homedir(), ".grok")) => join(home, "sessions", encodeURIComponent(repo), sid);

// User events on the same card within AH_DEBOUNCE_SEC (default 15s) are coalesced into ONE run (latest notice wins):
// e.g. the user drags In Review -> Coding AND comments the feedback = 2 webhooks, but one coding run.
const DEBOUNCED = new Set(["user_move", "user_comment", "review_feedback"]);
const debounceMs = Number(process.env.AH_DEBOUNCE_SEC ?? 15) * 1000, timers = new Map();
function debounce(p) {
  const k = `${p.company ?? company}/${p.issue ?? p.task_id ?? "?"}`;
  if (timers.has(k)) { clearTimeout(timers.get(k)); log(`debounce: ${k} ${p.event} replaces the queued notice`); }
  timers.set(k, setTimeout(() => { timers.delete(k); wake(p); }, debounceMs));
}
let running = false, runningIssue = null;
const pending = new Map(); // issue -> latest notice; unassigned start-stage cards remain queued here
const issueLockDir = join(homedir(), ".config/agents-holding/active-runs");
mkdirSync(issueLockDir, { recursive: true, mode: 0o700 });
const issueLockKey = (k) => Buffer.from(String(k)).toString("hex").slice(0, 180);
function acquireIssueLock(k) {
  const path = join(issueLockDir, `${issueLockKey(k)}.lock`);
  try { const fd = openSync(path, "wx", 0o600); writeFileSync(fd, JSON.stringify({ pid: process.pid, key: k, at: new Date().toISOString() })); closeSync(fd); return path; }
  catch {
    try { const old = JSON.parse(readFileSync(path, "utf8")); if (old.pid) { process.kill(old.pid, 0); return null; } } catch {}
    try { unlinkSync(path); const fd = openSync(path, "wx", 0o600); writeFileSync(fd, JSON.stringify({ pid: process.pid, key: k, at: new Date().toISOString() })); closeSync(fd); return path; } catch { return null; }
  }
}
function releaseIssueLock(path) { try { if (path) unlinkSync(path); } catch {} }
const queueKey = (p) => `${p.company ?? company}/${p.issue ?? p.task_id ?? "?"}`;
const queueOrder = (p) => [Number.isFinite(Number(p.priority)) ? Number(p.priority) : 100000, Date.parse(p.created ?? p.updated ?? "") || Number.MAX_SAFE_INTEGER, queueKey(p)];
function publishQueue() {
  const items = [...pending.values()].sort((a, b) => { const aa = queueOrder(a), bb = queueOrder(b); return aa[0] - bb[0] || aa[1] - bb[1] || aa[2].localeCompare(bb[2]); });
  L.writeStatus(homedir(), { queue: items.map((p) => ({ issue: p.issue ?? p.task_id, company: p.company ?? company, priority: p.priority ?? null, created: p.created ?? p.updated ?? null })) });
  return items;
}
function wake(p) {
  if (credit.blocked) { log(`stopped (${credit.blocked.msg}); ignoring ${p.event} ${p.issue ?? p.task_id ?? "?"}`); return; }
  const k = queueKey(p);
  if (running) {
    if (p.event === "agent_move" && k === runningIssue) { log(`chain: ignoring agent_move ${k} -> ${p.stage} (the active run continues it)`); return; }
    const had = pending.has(k); pending.delete(k); pending.set(k, p); publishQueue();
    log(`busy (run active for ${runningIssue}); ${had ? "replaced queued" : "queued"} ${p.event} ${k} stage ${p.stage}; pending: ${[...pending.keys()].join(",")}`);
    return;
  }
  running = true; runningIssue = k;
  const lock = acquireIssueLock(k);
  if (!lock) { running = false; runningIssue = null; log(`skip duplicate active run for ${k}`); return; }
  run(p).catch((e) => log("run error", e.message)).finally(() => {
    releaseIssueLock(lock);
    running = false; runningIssue = null;
    if (pending.size) { const n = publishQueue()[0]; const k0 = queueKey(n); pending.delete(k0); publishQueue(); log("running queued notice", n.event, k0, "stage", n.stage); wake(n); }
    else if (once || opt("--run")) process.exit(0);
  });
}

// Route one notice to its repo(s): sets company/repo/runRepos for this run. Several candidate repos and no
// repo:<name> label / component -> one Jira comment asking which, nothing runs (never guess).
async function useCtx(p) {
  const issue = p.issue ?? p.task_id ?? "";
  company = p.company ?? company; loadSessions();
  // A foreground replay scoped to --repo may start from a parent/child repo while
  // the active company points at the other subscription. Resolve the board on that repo.
  let meta = { labels: [], components: [] };
  // --repo is an explicit manual replay scope; the default company supplied by
  // --run must not bypass repo-scoped routing for parent/child boards.
  const scopedRoute = onlyRepo ? R.routeForRepo(registry, { repo: onlyRepo, issue, site: jiraSite }) : null;
  if (scopedRoute?.company) company = scopedRoute.company;
  const cands = R.candidates(registry, { company, issue, site: jiraSite });
  if (cands.length > 1 && jira) { try { meta = await jira.meta(issue); } catch (e) { log(`route: Jira labels for ${issue} failed (${e.message})`); } }
  let r = scopedRoute ? R.routeForRepo(registry, { repo: onlyRepo, company, issue, site: jiraSite, ...meta }) : R.route(registry, { company, issue, site: jiraSite, ...meta });
  // OAuth may report an API cloud endpoint while the persisted board has its
  // human site hostname. If canonical company+project mapping is unique and
  // the repo/config are valid, repair the site mismatch silently; never do
  // this for missing or ambiguous registrations.
  if (r.none && !registration.issues.some((x) => x.path && registry.projects.some((p) => p.path === x.path && p.boards?.some((b) => b.project_key === String(issue).split("-")[0])))) {
    const canonical = R.candidates(registry, { company, issue, site: null });
    if (canonical.length === 1) r = R.route(registry, { company, issue, site: null, ...meta });
  }
  if (r.none) {
    const relevant = registration.issues.filter((x) => x.path && registry.projects.some((p) => p.path === x.path && p.boards?.some((b) => b.project_key === String(issue).split("-")[0])));
    const why = relevant.length ? relevant : [{ message: `no valid registered repo for Jira project ${String(issue).split("-")[0]}` }];
    const st = L.stateDir(homedir(), company), plan = L.loadPlan(st, issue);
    if (!plan.registration_asked) {
      if (jira) await jira.labels(issue, ["ah-registration-required"]).catch((e) => log(`route: ${issue} registration label failed: ${e.message}`));
      try { await comms(issue, R.registrationComment(issue, why), "registration"); } catch (e) { log(`route: ${issue} registration comment failed: ${e.message}`); }
      L.savePlan(st, issue, { registration_asked: true });
    }
    log(`route: ${issue} registration invalid; actionable Jira flag/comment emitted`); return false;
  }
  if (r.ask) {
    const st = L.stateDir(homedir(), company);
    if (!L.loadPlan(st, issue).repo_asked) { const t = R.askComment(issue, r.ask); await comms(issue, t, "repo"); L.savePlan(st, issue, { repo_asked: r.ask }); }
    log(`route: ${issue} feeds ${r.ask.join(",")}; no repo:<name> label/component -> asked on Jira, waiting`); return false;
  }
  runRepos = r.repos.map((x) => x.path); repo = runRepos[0]; runSettings = r.repos[0].settings ?? {};
  if (jira) {
    try {
      const fixed = await jira.meta(issue);
      if ((fixed.labels ?? []).includes("ah-registration-required")) await jira.labels(issue, [], ["ah-registration-required"]);
      const st = L.stateDir(homedir(), company); if (L.loadPlan(st, issue).registration_asked) L.savePlan(st, issue, { registration_asked: null });
    } catch (e) { log(`route: ${issue} registration recovery check failed: ${e.message}`); }
  }
  log(`route: ${issue} (${company}) -> ${r.repos.map((x) => x.name).join(", ")}`); return true;
}
let runSettings = {};

async function run(p, depth = 0) {
  const issue = p.issue ?? p.task_id ?? "";
  if (depth === 0 && !(await useCtx(p))) return;
  await refreshJiraRoute();
  await clearWaitingSignal(issue, p.event);
  let na = null;
  try {
    na = await mcp("next_action", { company, task: issue, listener_jira: listenerJira });
  } catch (e) {
    // Jira can transition before its webhook creates the server task. Bootstrap
    // from the card and retry; never launch an agent without a next_action.
    const msg = String(e?.message ?? e);
    if (/quota|limit (reached|exceeded)/i.test(msg) || server.down?.cause === "quota") {
      log(`paused ${issue}: MCP quota active; no agent dispatch`);
      return;
    }
    if (/task not found/i.test(msg) && jira && issue) {
      try {
        const card = await jira.issue(issue);
        const title = String(card?.fields?.summary ?? card?.summary ?? issue).slice(0, 300);
        const body = String(card?.fields?.description ?? card?.description ?? "").slice(0, 4000);
        await mcp("start_task", { company, title, body, issue_key: issue });
        na = await mcp("next_action", { company, task: issue, listener_jira: listenerJira });
        log(`next_action: bootstrapped missing task ${issue} for company ${company}`);
      } catch (boot) {
        log(`next_action failed for ${issue}: ${msg}; bootstrap failed: ${boot.message}`);
        return;
      }
    } else {
      log("next_action failed:", msg);
      return;
    }
  }
  if (na && !(await ensureAgentOwnedAssignment(issue, na))) return;
  if ((na?.waiting || p.workflow_error) && p.event !== "manual") { await announceWaiting(issue, na, p); log(`waiting ${issue}: ${na?.stage ?? "workflow-invalid"}`); return; }
  if (lean && na) return leanRun(p, na, depth);
  const model = process.env.AH_MODEL || na?.model || null;
  const chainTxt = na?.chain?.length ? ` Chain these stages in this run: ${na.chain.map((c) => c.name).join(" -> ")}.` : "";
  const jiraTxt = dryJira
    ? ` DRY JIRA: never call any Jira/Atlassian tool. Print every Jira action you would take (comments, transitions, links) under "JIRA ACTIONS (dry)" instead.`
    : listenerJira ? ` Do NOT transition Jira cards (pass listener_jira=true to next_action/advance; the listener moves cards). Post Jira comments with my Atlassian MCP.`
    : mcpJiraFallback ? ` The local Jira credential is unavailable. Use my own Atlassian MCP session to read, comment and transition ${issue}; verify the intended company account/site first. If MCP is unavailable or lacks permission, report the exact missing account/permission instead of pretending success.`
    : ` Jira access is unavailable and MCP fallback is disabled. Do not mutate Jira; report the exact re-authentication needed.`;
  const prev = process.env.AH_RESUME === "0" ? null : sessions[issue];
  const resume = prev && existsSync(sessDir(prev));
  const prompt = resume
    ? `Continue task ${issue} (event ${p.event}, stage ${na?.stage ?? p.stage}). Call next_action (company ${company}, listener_jira=${listenerJira}) and do the current step(s).${chainTxt}${jiraTxt} Never set Done; stop at a user gate.`
    : `/ceo A next_action notice arrived for task ${issue} (event ${p.event}, stage ${na?.stage ?? p.stage}). Using the agents-holding MCP tools, call next_action for it (company ${company}, with_context=true, listener_jira=${listenerJira}); the returned context is the project brief, so do not re-read project docs unless needed. Do exactly the current step(s) locally with my own accounts and tools.${chainTxt}${jiraTxt} Advance only as the instructions allow; never set Done; stop at a user gate.`;
  const sid = resume ? prev : randomUUID();
  if (!resume) { sessions[issue] = sid; saveSessions(); }
  const out = join(logDir, `run-${Date.now()}.log`);
  const before = usageOf(sid);
  const gargs = grokArgs(prompt, sid, { resume, model });
  log("launch grok for", issue, resume ? "RESUME session" : "session", sid, model ? `model ${model}` : "", dryJira ? "(dry-jira)" : "", "->", out);
  const t0 = Date.now();
  const code = await spawnGrok(gargs, out, issue, sid);
  const wall = Date.now() - t0;
  log("grok exited", code, "for", issue, `after ${Math.round(wall / 1000)}s`);
  if (resume && code !== 0 && Date.now() - t0 < 20000 && depth === 0) { // resume failed: fresh session with the compact server context
    log("resume failed; retrying with a new session"); delete sessions[issue]; saveSessions(); return run(p, depth + 1);
  }
  // tokens for this run (delta of the session totals)
  const after = usageOf(sid);
  const d = after && { input: after.inputTokens - (before?.inputTokens ?? 0), output: after.outputTokens - (before?.outputTokens ?? 0), cached: after.cachedReadTokens - (before?.cachedReadTokens ?? 0),
    reasoning: (after.reasoningTokens ?? 0) - (before?.reasoningTokens ?? 0), calls: after.modelCalls - (before?.modelCalls ?? 0), model: after.primaryModelId };
  let na2 = null; try { na2 = await mcp("next_action", { company, task: issue, listener_jira: listenerJira }); } catch {}
  const stages = [na?.stage, na2?.stage].filter((x, i, a) => x && a.indexOf(x) === i).join(">");
  if (d) {
    log(`TOKENS ${issue} ${stages}: input ${d.input} output ${d.output} cached ${d.cached} reasoning ${d.reasoning} calls ${d.calls} model ${d.model} wall ${Math.round(wall / 1000)}s session ${sid}`);
    mcp("report_usage", { company, issue, stage: stages, session_id: sid, model: d.model, input_tokens: d.input, output_tokens: d.output, cached_tokens: d.cached, reasoning_tokens: d.reasoning, model_calls: d.calls, wall_ms: wall, dry: dryJira })
      .catch((e) => log("report_usage failed:", e.message));
  } else log(`TOKENS ${issue}: no usage.json for session ${sid}`);
  await jiraOps(issue);
  // chain safety net: work left (not waiting, stage moved) -> one more resumed run
  if (code === 0 && na2 && !na2.waiting && na2.stage !== na?.stage && depth < 3) { log(`post-run: ${issue} now ${na2.stage}, not waiting; continuing`); return run({ ...p, event: "chain", stage: na2.stage }, depth + 1); }
}

function usageOf(sid, home) { try { return JSON.parse(readFileSync(join(sessDir(sid, home), "usage.json"), "utf8")).session; } catch { return null; } }

function spawnGrok(gargs, out, issue, sid, o = {}) {
  return new Promise((res) => {
    const env = o.env ?? (o.home ? { ...process.env, GROK_HOME: o.home } : { ...process.env, AGENTS_HOLDING_KEY: key });
    if (o.home) delete env.AGENTS_HOLDING_KEY; // lean runs need no server access
    const w = POL.wrapLaunch({ co: company, role: o.role ?? "staff", bin: o.bin ?? grokBin, args: gargs, env, cwd: repo }); // unified staff policy + OS sandbox
    const spawnOne = (wrapped) => spawn("nice", ["-n", "10", wrapped.bin, ...wrapped.args], { cwd: repo, env: wrapped.env, stdio: ["ignore", "pipe", "pipe"] });
    const ch = spawnOne(w);
    let lastOut = Date.now(); // claude/codex have no grok events file: stdout activity counts as progress
    let stderr = "", stdout = "";
    ch.stdout.on("data", (d) => { lastOut = Date.now(); stdout += d.toString(); appendFileSync(out, d); if (o.collect) o.collect.push(d); });
    ch.stderr.on("data", (d) => { lastOut = Date.now(); stderr += d.toString(); appendFileSync(out, d); });
    const t0 = Date.now(); let warned = "";
    const events = join(sessDir(sid, o.home), "events.jsonl");
    const watch = setInterval(() => {
      let lines = []; let mtime = o.env ? lastOut : t0;
      try { lines = readFileSync(events, "utf8").trim().split("\n"); mtime = Math.max(t0, statSync(events).mtimeMs); } catch {}
      const last = (() => { try { return JSON.parse(lines.at(-1)); } catch { return {}; } })();
      const idle = Date.now() - mtime;
      let why = "";
      if (last.type === "permission_requested" || last.phase === "permission_prompt") why = `WAITING FOR PERMISSION/INPUT (${last.tool_name ?? "?"})`;
      else if (/ask_?user|AskUserQuestion/i.test(lines.at(-1) ?? "")) why = "WAITING FOR USER ANSWER";
      else if (idle > stallMs) why = `STALLED ${Math.round(idle / 1000)}s, last event ${last.type ?? "?"} ${last.server_name ?? ""}${last.tool_name ? "/" + last.tool_name : ""}`;
      if (why && why.split(" ")[0] !== warned) { warned = why.split(" ")[0]; log(`!!! grok run for ${issue} (pid ${ch.pid}, session ${sid}) ${why}; see ${out}`); }
      if (Date.now() - t0 > runTimeoutMs) {
        log(`!!! grok run for ${issue} exceeded ${runTimeoutMs / 60000} min; killing pid ${ch.pid} (last: ${why || last.type || "?"})`);
        ch.kill("SIGTERM"); setTimeout(() => { try { ch.kill("SIGKILL"); } catch {} }, 10000);
        clearInterval(watch);
      }
    }, 15000);
    ch.on("close", (code, sig) => {
      clearInterval(watch);
      // macOS sandbox-exec can be present but unusable in managed/hosted terminals.
      // Retry once without the outer OS sandbox; the provider-native policy remains active
      // and this prevents a false "no commit" failure before the worker can read the repo.
      if (code !== 0 && w.sandbox === "sandbox-exec" && Date.now() - t0 < 15000 &&
          /(?:Operation not permitted|sandbox_apply|sandbox-exec)/i.test(`${stderr}\n${stdout}`) && !o._sandboxRetried) {
        log(`worker ${issue}: OS sandbox rejected process; retrying once with provider policy`);
        const env2 = { ...w.env, AH_SANDBOX: "off" };
        spawnGrok(gargs, out, issue, sid, { ...o, env: env2, _sandboxRetried: true, collect: o.collect }).then(res);
        return;
      }
      res(code ?? sig);
    });
  });
}

// ---- lean run: scripts drive the stages, the model only writes text/code (see lean.mjs) ----
let stageModels = {}; // flow per-stage models of the current run (next_action model/chain[].model), honored by leanModel
async function leanModel(kind, issue, stage, prompt, role = null, context = null) {
  const sid = randomUUID(), out = join(logDir, `run-${Date.now()}.log`), buf = [];
  const text = kind !== "code", schema = kind === "tech" ? L.TECH_SCHEMA : kind === "habits" ? L.HABITS_SCHEMA : text ? L.TEXT_SCHEMA : L.CODE_SCHEMA, system = kind === "tech" ? L.TECH_SYSTEM : kind === "habits" ? L.HABITS_SYSTEM : text ? L.TEXT_SYSTEM : null;
  const rsv = L.resolveAgent({ cfg: { agent: runSettings?.agent, model: runSettings?.model, text_model: runSettings?.text_model, ...L.loadAgentCfg(homedir(), company) }, text, role, stageModel: stageModels[stage] ?? null });
  const CM = await import("./providers/command.mjs");
  const cmds = [{ label: rsv.command ? CM.shortCmd(rsv.command) : rsv.agent, rsv }, ...(rsv.fallback ?? []).map((c) => ({ label: CM.shortCmd(c), rsv: { ...rsv, agent: "command", command: c, binding: { command: c }, model: null, effort: null } }))];
  const cliKind = (r) => r.command ? CM.kindOf(r.command) : r.agent;
  const lang = L.getLang(), stp = L.stateDir(homedir(), company);
  try {
    const { value, used } = await X.runWithFallback(cmds, async (cm, { resume }) => {
      try { return { ok: true, value: await leanModelOnce(kind, issue, stage, resume ? `${prompt}\n\n${L.resumeHint(L.loadPlan(stp, issue), X.ckptLoad(stp, issue))}` : prompt, role, context, cm.rsv, { sid, out, buf, text, schema, system }) }; }
      catch (e) { if (!e.agentOut) throw e; return { ok: false, out: e.agentOut, code: e.agentCode, kind: cliKind(cm.rsv) }; }
    }, {
      onRetry: async (cm, c, ms) => { log(`lean ${kind} ${issue}: ${cm.label} ${c.cause}${ms ? `; backoff ${Math.round(ms / 1000)}s` : "; retrying fresh from the checkpoint"}`); X.ckptSave(stp, issue, { last_error: c.cause }); },
      onSwitch: async (from, to, c) => { log(`lean ${kind} ${issue}: ${from.label} ${c.cause} -> fallback ${to.label}`); await comms(issue, `[agent-holding] ${X.switchNote(lang, from.label, to.label, c)}`); },
    });
    if (used !== cmds[0]) log(`lean ${kind} ${issue}: done by fallback ${used.label}`);
    return value;
  } catch (e) { if (e.agent) e.cmd = cmds.at(-1).label; throw e; }
}
async function leanModelOnce(kind, issue, stage, prompt, role, context, rsv, { sid, out, buf, text, schema, system }) {
  buf.length = 0;
  const { agent, model, effort, bin, command, binding } = rsv;
  const prov = command ? (await import("./providers/command.mjs")).commandProvider(binding) : await P.getProvider(agent, homedir());
  log(`lean ${kind} call for ${issue} ${stage}${role ? ` staff ${role}` : ""} agent ${agent} session ${sid} ${model ?? "default model"}${effort ? ` effort ${effort}` : ""} prompt ${prompt.length} chars -> ${out}`);
  // AgentProvider protocol (providers/): built-in CLIs spawn via ctx.spawn; HTTP providers (openai-compatible, custom) run their own loop
  const ctx = { spawn: (args, so = {}) => { if (so.env) delete so.env.AGENTS_HOLDING_KEY; return spawnGrok(args, out, issue, sid, { collect: buf, role, ...so }); },
    stdout: () => Buffer.concat(buf).toString("utf8"), grokUsage: (s) => usageOf(s, leanHome), leanHome, logDir, log: (m) => log(`lean ${kind} ${issue}: ${m}`) };
  const t0 = Date.now();
  if (role) context = [context, POL.rulesText(POL.loadPolicy(homedir(), company, role))].filter(Boolean).join("\n\n");
  prompt = POL.redactText(prompt); if (context) context = POL.redactText(context);
  const res = await prov.run({ prompt, system, context, schema, kind, text, cwd: repo, model, effort, sid, bin, company, role }, ctx).catch((e) => ({ result: {}, usage: null, exitCode: 1, error: e.message }));
  const wall = Date.now() - t0, code = res.exitCode ?? 0;
  if (res.text) appendFileSync(out, res.text); // HTTP providers: keep the answer in the run log too
  const r = res.result, u = res.usage;
  if (res.error) log(`lean ${kind} ${agent} error for ${issue}: ${String(res.error).slice(0, 200)}`);
  if (u) {
    log(`TOKENS ${issue} ${stage}: input ${u.input} output ${u.output} cached ${u.cached} reasoning ${u.reasoning} calls ${u.calls} model ${u.model ?? agent} wall ${Math.round(wall / 1000)}s session ${sid} (lean ${kind}, ${agent})`);
    mcp("report_usage", { company, issue, stage, session_id: sid, model: u.model ?? agent, input_tokens: u.input, output_tokens: u.output, cached_tokens: u.cached,
      reasoning_tokens: u.reasoning, model_calls: u.calls, wall_ms: wall, dry: dryJira }).catch((e) => log("report_usage failed:", e.message));
  } else log(`TOKENS ${issue} ${stage}: no usage reported by ${agent}`);
  const outTxt = () => { let t = ""; try { t = readFileSync(out, "utf8").slice(-6000); } catch {} return `${t}\n${ctx.stdout().slice(-4000)}\n${res.error ?? ""}`; };
  if (code !== 0) { log(`lean ${kind} call exited ${code} for ${issue}`);
    const e = new Error(code === "SIGTERM" || code === "SIGKILL" ? `${kind} call timed out (${runTimeoutMs / 60000} min cap)` : `${kind} call exited ${code}`);
    e.agentOut = outTxt(); e.agentCode = code; e.command = `${agent}${model ? ` -m ${model}` : ""}${effort ? ` --effort ${effort}` : ""}`;
    throw e; }
  const sig = L.compactionSignal(outTxt());
  if (sig && (!r || !Object.keys(r).length)) { const e = new Error(`${kind} call lost its context (${sig})`); e.agentOut = `compacted conversation: ${sig}`; e.agentCode = 1; throw e; }
  if (sig) log(`lean ${kind} ${issue}: compaction signal "${sig}" (answer kept; checkpoint saved)`);
  return r;
}
// Visibility wrapper: Jira "agent-working" label while the run works, "Started <stage>…" once per stage, "Failed <stage>: why" on error,
// macOS notifications (holding notify on|off), local status file for `holding status`.
async function leanRun(p, na, depth = 0) {
  const issue = na.issue ?? p.issue ?? p.task_id; const vis = { labeled: false, started: new Set(), stage: na.stage, staff: L.stageStaff(na, na.stage), worked: false };
  try { const r = await leanRunInner(p, na, depth, vis);
    { const stp = L.stateDir(homedir(), company), ck = X.ckptLoad(stp, issue); if (ck?.blocked || ck?.failed) { X.ckptSave(stp, issue, { blocked: null, failed: null }); if (jira) await jira.labels(issue, [], [X.BLOCKED_LABEL, WORKFLOW_FAILURE_LABEL]).catch(() => {}); } }
    if (vis.worked && depth === 0) { L.desktopNotify(homedir(), `agents-holding: ${issue}`, `Finished ${L.stageTitle(vis.stage)}`); L.writeStatus(homedir(), { last_run: { issue, result: `ok (${vis.stage})`, at: new Date().toISOString() } }); }
    return r; }
  catch (e) {
    log(`lean run ${issue} FAILED in ${vis.stage}: ${e.message}`);
    const stp = L.stateDir(homedir(), company);
    const detail = [e.message, e.agentCode !== undefined && `exit_code=${e.agentCode}`, e.command && `command=${e.command}`, e.agentOut && `stderr/progress:\n${String(e.agentOut).slice(-5000)}`].filter(Boolean).join("\n");
    X.ckptSave(stp, issue, { stage: X.ckptLoad(stp, issue)?.stage ?? vis.stage, failed: e.message.slice(0, 200), failure: { message: e.message, command: e.command ?? null, exit_code: e.agentCode ?? null, stderr_progress: String(e.agentOut ?? "").slice(-5000), at: new Date().toISOString() }, blocked: e.agent?.cause ?? null });
    if (e.server) { L.writeStatus(homedir(), { last_run: { issue, result: `PAUSED ${vis.stage}: ${e.message.slice(0, 120)}`, at: new Date().toISOString() } }); return; } // server problem: already warned; resumes from the checkpoint on the replay
    if (e.agent) {
      if (jira) { await jira.labels(issue, [X.BLOCKED_LABEL]).catch((x) => log("Jira label failed:", x.message));
        await comms(issue, `${L.staffTag(vis.staff)} ${X.blockedComment(L.getLang(), e.agent, { cmd: e.cmd, stage: L.stageTitle(vis.stage), tried: e.tried ?? [] })}`, "blocked"); }
      L.desktopNotify(homedir(), `agents-holding: ${issue} agent blocked`, `${e.agent.kind} ${e.agent.cause}${e.agent.fix ? ` - fix: ${e.agent.fix}` : ""}`);
      L.writeStatus(homedir(), { last_run: { issue, result: `BLOCKED ${vis.stage}: ${e.agent.kind} ${e.agent.cause}`, at: new Date().toISOString() } });
      return;
    }
    if (jira && /git staging|commit failed|\.agents\//i.test(String(e.message))) await jira.labels(issue, [WORKFLOW_FAILURE_LABEL]).catch((x) => log("workflow failure label failed:", x.message));
    await comms(issue, `${L.failedComment(vis.staff, vis.stage, e.message)}\n\nFailure evidence:\n${detail}\n\nNext action: remain in ${L.stageTitle(vis.stage)}; fix the failed command/evidence and rerun from this checkpoint.`, "failed");
    L.desktopNotify(homedir(), `agents-holding: ${issue} FAILED`, `${L.stageTitle(vis.stage)}: ${e.message}`);
    L.writeStatus(homedir(), { last_run: { issue, result: `FAILED ${vis.stage}: ${String(e.message).slice(0, 120)}`, at: new Date().toISOString() } });
  } finally {
    if (vis.labeled && jira) await jira.label(issue, "remove").catch((x) => log("Jira label remove failed:", x.message));
    if (depth === 0) L.writeStatus(homedir(), { running: null });
  }
}
async function leanRunInner(p, na, depth, vis) {
  const issue = na.issue ?? p.issue ?? p.task_id; const st = L.stateDir(homedir(), company); const saved = L.loadPlan(st, issue);
  let iss = { key: issue, summary: na.title ?? "", description: String(na.request ?? "").slice(0, 1500), comments: [] };
  const readKey = opt("--jira-read-as") || process.env.AH_JIRA_READ_AS || issue; // dry replays may read the real issue (GET only)
  if (jira) { try { iss = { key: issue, ...L.compactIssue(await jira.issue(readKey)) }; } catch (e) { log(`lean: Jira read ${readKey} failed (${e.message}); using server title/request`); } }
  const fb = L.feedbackOf(na);
  { const userC = [...(iss.comments ?? [])].reverse().find((c) => !/^\[agent-holding\]/.test(String(c.t ?? ""))); // reply language: latest user comment, else the card
    const lang = L.setLang(L.pickLang(L.loadAgentCfg(homedir(), company).lang, userC?.t, `${iss.summary}\n${iss.description ?? ""}`)); if (lang !== "en") log(`lean ${issue}: output language ${lang}`); }
  L.cacheStageOwners(homedir(), na.stage_owners);
  stageModels = { ...stageModels, ...Object.fromEntries([[na.stage, na.model ?? null], ...(na.chain ?? []).map((c) => [c.stage, c.model ?? null])].filter(([, m]) => m)) }; // single source = server STAGE_OWNERS; cached for runs without it
  const habits = L.loadHabits(homedir(), company);
  vis.briefs ??= {};
  const brief = async (role) => { // persona + 2 relevant own skills, summaries only (~1.5k tokens max), once per role per run
    if (!role || process.env.AH_BRIEF === "0") return null;
    if (!(role in vis.briefs)) { try { vis.briefs[role] = await mcp("staff_brief", { company, role, text: `${iss.summary}\n${iss.description}`.slice(0, 2000), max_skills: 2 }); } catch (e) { log(`staff_brief ${role} failed: ${e.message}`); vis.briefs[role] = null; } }
    return enrichBriefWithLocalSkills(company, role, enrichBriefWithPackSkills(company, role, vis.briefs[role]));
  };
  const say = async (staff, t0, kind = null) => { const t = staff === false ? t0 : `${L.staffTag(staff)} ${t0}`; // every comment: [agent-holding] [<staff name>] ...
    if (dryJira && !jira) return log(`JIRA (dry): comment ${issue} "${t.slice(0, 160).replace(/\n/g, " ")}"`);
    await comms(issue, t, kind);
  };
  if (na.waiting) return log(`lean: ${issue} waiting (${na.stage})`);
  const record = (kind, body) => mcp("record_artifact", { company, task: issue, kind, body: body || kind, role: "agent" }).catch((e) => log(`record ${kind} failed:`, e.message));
  const advance = async (from, to, art) => {
    for (let i = 0; i < 2; i++) {
      try { const r = await mcp("advance", { company, task: issue, to_stage: to, listener_jira: true }); log(`lean: ${issue} ${from} -> ${r.stage}`);
        await jiraOps(issue); // move the card NOW, before the next stage's work starts (the board shows what is actually happening)
        if (jira && r.stage !== "done") { const role = L.stageRole(na, r.stage, { developer: L.loadPlan(st, issue).developer }); if (role && vis.staffRole !== role) { vis.staffRole = role; await jira.staffLabel(issue, role, L.loadAgentCfg(homedir(), company).staff?.[role]?.jira_user || null).then(async (acct) => { if (!acct) return null; const cur = await jira.meta(issue).catch(() => null); if (cur?.assignee?.accountId === acct) return null; return mcp("set_task_assignee", { company, task: issue, account: acct }).catch((e) => log("persist assignee failed:", e.message)); }).catch((e) => log("Jira staff label failed:", e.message)); } } // staff:<id> = owner of the stage just entered
        X.ckptSave(st, issue, { stage: r.stage, done: [] });
        vis.gates ??= new Set();
        if (r.stage === to && L.GATE_HINTS[to] && !vis.gates.has(to)) { vis.gates.add(to); await say(false, L.gateComment(L.stageStaff(na, to), to), "gate"); } // explicit gate: how to approve / revise
        return true; }
      catch (e) { const m = e.message.match(/kind=(\w+)/); if (i || !m) { log(`lean: advance ${from} -> ${to} failed: ${e.message}`); return false; } await record(m[1], art?.(m[1])); }
    }
  };
  log(`lean run ${issue} (${p.event}) segments ${L.segments(na).map((s) => `${s.kind}:${s.stages.join(">")}`).join(" | ") || "none"}`);
  let plan = saved.plan ?? null;
  const ck0 = X.ckptLoad(st, issue), resumable = (s0, step) => !fb && X.ckptDone(ck0, s0, step) && (ck0.running || ck0.failed); // died / failed mid-stage -> resume
  const stepDone = (s0, step) => { const ck = X.ckptLoad(st, issue) ?? {}; X.ckptSave(st, issue, { stage: s0, done: [...new Set([...(ck.stage === s0 ? ck.done ?? [] : []), step])] }); };
  const startStage = async (s0, kind) => { // one "Started" comment per stage per run; label on first real work
    const dev0 = L.loadPlan(st, issue).developer;
    vis.stage = s0; vis.staff = L.stageStaff(na, s0, { kind, developer: dev0 }); vis.worked = true;
    const role = L.stageRole(na, s0, { kind, developer: dev0 });
    L.writeStatus(homedir(), { running: { issue, stage: s0, at: new Date().toISOString(), pid: process.pid } });
    { const ck = X.ckptLoad(st, issue); if (ck?.stage !== s0) X.ckptSave(st, issue, { stage: s0, done: [], code_done: [], running: true }); else X.ckptSave(st, issue, { running: true }); }
    if (vis.started.has(s0)) return; vis.started.add(s0);
    if (jira && !vis.labeled) { vis.labeled = true; await jira.label(issue, "add").catch((e) => log("Jira label add failed:", e.message)); }
    if (jira && kind !== "script" && vis.staffRole !== role) { vis.staffRole = role; await jira.staffLabel(issue, role, L.loadAgentCfg(homedir(), company).staff?.[role]?.jira_user || null).then(async (acct) => { if (!acct) return null; const cur = await jira.meta(issue).catch(() => null); if (cur?.assignee?.accountId === acct) return null; return mcp("set_task_assignee", { company, task: issue, account: acct }).catch((e) => log("persist assignee failed:", e.message)); }).catch((e) => log("Jira staff label failed:", e.message)); }
    if (kind !== "script" && !(kind === "code" && na.review_feedback)) await say(false, L.startedComment(vis.staff, s0, L.staffWhy(na, s0, { kind, developer: dev0 }))); // review: the "back to Coding" comment says it
    const ck = L.loadPlan(st, issue);
    if (!ck[`work_checklist_${s0}`]) {
      const checklist = L.workChecklist(na, { issue, stage: s0, plan: ck.plan ?? ck.tech_plan ?? null });
      if (commMode[company] === "chat") await comms(issue, checklist, "gate");
      else if (jira) await jira.comment(issue, `[agent-holding] [${L.stageTitle(s0)}]\n${checklist}`).catch((e) => log(`work checklist comment failed: ${e.message}`));
      L.savePlan(st, issue, { [`work_checklist_${s0}`]: { marker: `<!-- agents-holding:work-checklist:${issue}:${s0} -->`, status: "started", at: new Date().toISOString(), fallback: commMode[company] === "chat" ? "CEO/chat inbox" : "Jira comment" } });
    }
    L.desktopNotify(homedir(), `agents-holding: ${issue}`, `Started ${L.stageTitle(s0)}`);
  };
  for (const seg of L.segments(na)) {
    const s0 = seg.stages[0];
    if (seg.kind !== "move" && !(seg.kind === "script" && s0 === "done")) await startStage(s0, seg.kind);
    if (seg.kind === "move") { if (!(await advance(s0, seg.moves[0]))) return; continue; }
    if (seg.kind === "text") {
      if (resumable(s0, "plan") && saved.plan) { plan = saved.plan; log(`lean: ${issue} ${s0}: resume from checkpoint (plan already done, no model call)`); if (seg.moves[0] && !(await advance(s0, seg.moves[0]))) return; continue; }
      const r = await leanModel("text", issue, s0, L.textPrompt(iss, {  prevPlan: s0 === "planned" ? plan : null, feedback: fb, allowQuestion: s0 !== "planned" && (na.flow_stages ?? []).includes("ba_question") }), L.stageRole(na, s0), L.contextOf({ brief: await brief(L.stageRole(na, s0)), habits }));
      if (r.question && s0 !== "planned") { await record("question", r.question); await say(L.stageStaff(na, s0), `QUESTION\n${r.question}`, "question"); await advance(s0, "ba_question"); break; }
      plan = r.plan || r.summary || ""; if (!plan) { throw new Error("the model returned an empty plan"); }
      await record("plan", plan); await say(L.stageStaff(na, s0), `PLAN\n${plan}`); L.savePlan(st, issue, { plan }); stepDone(s0, "plan");
      if (seg.moves[0] && !(await advance(s0, seg.moves[0]))) return;
      continue;
    }
    const branch = `feature/${issue}`;
    const host = (r) => { const steps = L.prSteps(na, seg);
      const h = L.gitHost(repo, { ...steps, autoPr: !!na.auto_pr && runSettings.auto_pr !== false && !dryJira, branch, title: `${issue}: ${iss.summary}`.slice(0, 120), body: `${r?.summary ?? ""}

Jira: ${issue}` });
      if (steps.open || steps.merge) log(`lean git host (${na.auto_pr ? "auto_pr ON" : "auto_pr OFF"}${dryJira ? ", dry: no push" : ""}): ${h.msg.join("; ")}`); return h; };
    if (seg.kind === "script") { // done / todo / review / merge / PR / comment-only stages: no model call
      const steps = L.prSteps(na, seg), saved2 = L.loadPlan(st, issue);
      if (s0 === "done") { // template comment + local state cleanup; merge only if the flow says so (per auto_pr rules)
        const h = steps.merge ? host(saved2) : { msg: [] };
        await say(false, [L.doneComment(issue, saved2, L.stageStaff(na, "done")), ...h.msg].join("\n"));
        if (jira) await jira.staffLabel(issue, null).catch((e) => log("Jira staff label remove failed:", e.message));
        await learnHabits(issue, readKey, L.stageStaff(na, "done"));
        X.ckptClear(st, issue); log(`lean: ${issue} done (script); state ${L.clearState(st, issue) ? "cleared" : "none"}`);
        continue;
      }
      if (!steps.open && !steps.merge && !(na.on_enter?.[s0] ?? []).some((a) => a.action === "comment") && !seg.moves[0]) { log(`lean: ${issue} ${s0}: nothing to do (script)`); continue; }
      const h = (steps.open || steps.merge) ? host(saved2) : { msg: [] }; const note = h.msg.join("\n") || "moved on";
      await say(L.stageStaff(na, s0), `${seg.stages.join(">")}\n${note}`);
      if (h.msg.some((m) => /NOT done|failed/.test(m))) return; // never force: stop for the user
      for (let i = 0; i < seg.stages.length; i++) { const to = seg.moves[i]; if (!to) break; await record("note", note); if (!(await advance(seg.stages[i], to))) return; }
      continue;
    }
    const devRoles = na.dev_roles ?? [], rname = (rp) => rp.split("/").pop();
    const filesOf = (rp) => { try { return L.git(rp, "ls-files").split("\n").filter(Boolean); } catch { return []; } };
    const approval = plan || p.event === "user_approved" ? "Plan approved; go ahead." : null;
    if (seg.kind === "techplan") { // Pre Coding: tech plan + pick the developer. NO code changes here.
      const who = L.stageStaff(na, s0, { kind: "techplan" });
      if (resumable(s0, "tech_plan") && saved.tech_plan) { log(`lean: ${issue} ${s0}: resume from checkpoint (tech plan already done)`); if (seg.moves[0] && !(await advance(s0, seg.moves[0], () => saved.tech_plan))) return; continue; }
      const files = filesOf(repo), hints = L.fileHints(files, `${iss.summary} ${iss.description} ${plan ?? ""}`);
      const listed = files.length <= 40 ? files : hints;
      const r = await leanModel("tech", issue, s0, L.techPlanPrompt(iss, {  plan, feedback: fb, files: listed, snippets: L.fileSnippets(repo, hints.slice(0, 5)), devRoles }), L.stageRole(na, s0, { kind: "techplan" }), L.contextOf({ brief: await brief(L.stageRole(na, s0, { kind: "techplan" })), habits }));
      if (r.question && !r.tech_plan) { await record("question", r.question); await say(who, `QUESTION\n${r.question}`, "question"); return; }
      const techPlan = r.tech_plan || r.summary || ""; if (!techPlan) { throw new Error("the model returned an empty tech plan"); }
      const dev = L.pickDeveloper(devRoles, r.developer, na.assigned_role, `${iss.summary} ${iss.description} ${techPlan}`);
      if (dev !== "tech-lead" && dev !== na.assigned_role) await mcp("assign", { company, task: issue, role: dev }).catch((e) => log(`assign ${dev} failed:`, e.message));
      L.savePlan(st, issue, { tech_plan: techPlan, developer: dev, qc_baseline: null });
      await record("tech_plan", techPlan);
      await say(who, `TECH PLAN\n${techPlan}\nDeveloper: ${L.staffName(dev)} (${dev})`); stepDone(s0, "tech_plan");
      log(`lean: ${issue} ${s0}: tech plan recorded, developer ${dev} (no code in this stage)`);
      if (seg.moves[0] && !(await advance(s0, seg.moves[0], (k) => k === "tech_plan" ? techPlan : techPlan))) return;
      continue;
    }
    const segs = L.segments(na), qcAhead = segs.some((x) => x.kind === "qc");
    const codeOnce = async (stage, o) => { // one coding call per repo (multi-repo task = feature/<KEY> in each), commit by script
      let r = null; const wheres = [];
      for (const rp of runRepos) {
        repo = rp;
        log(`lean: ${rp} branch ${branch}: ${L.ensureBranch(rp, branch)}`);
        const files = filesOf(rp);
        const multi = runRepos.length > 1 ? `\nThis task spans repos ${runRepos.map(rname).join(", ")}; you are in ${rname(rp)}: change only what belongs here.` : "";
        const r1 = await leanModel("code", issue, stage, L.codePrompt(iss, {  plan: (plan ?? "") + multi, techPlan: o.techPlan, approval, feedback: o.feedback, hints: L.fileHints(files, `${iss.summary} ${iss.description} ${plan ?? ""}`), qc: !!o.selfCheck?.[rp], preexisting: L.preexistingFails(L.loadPlan(st, issue).qc_baseline?.[rp] ?? o.baselines?.[rp]), review: !!o.review, branch }), o.dev, L.contextOf({ brief: await brief(o.dev), habits }));
        if (r1.question && !r1.summary) { await record("question", r1.question); await say(o.who, `QUESTION (${rname(rp)})\n${r1.question}`, "question"); repo = runRepos[0]; return null; }
        const sha = L.commitAll(rp, `${o.wip ? `WIP(${issue}) ${o.wip}: ` : `${issue}: `}${r1.commit_message || iss.summary || "agent change"}`);
        if (typeof sha === "string" && sha.startsWith("failed:")) { const e = new Error(`git staging/commit failed: ${sha}`); e.command = "git add -u --; git ls-files --others --exclude-standard; git add -- <eligible paths>; git commit"; e.agentOut = sha; e.agentCode = 1; throw e; }
        const h = o.host ? host(r1) : { msg: [] };
        wheres.push(`${runRepos.length > 1 ? rname(rp) + ": " : ""}Branch ${branch}${sha ? ` @ ${sha}` : " (no changes)"}${h.url ? ` PR ${h.url}${h.merged ? " (merged)" : ""}` : " (local, not pushed)"}${h.msg.length && !h.url ? ` - ${h.msg.join("; ")}` : ""}`);
        if (!r) r = { ...r1, commit: sha }; else r = { ...r, summary: `${r.summary ?? ""}\n${r1.summary ?? ""}`, tests: [r.tests, r1.tests].filter(Boolean).join("\n"), tech_plan: [r.tech_plan, r1.tech_plan].filter(Boolean).join("\n") };
      }
      repo = runRepos[0]; return { ...r, where: wheres.join("\n") };
    };
    if (seg.kind === "code") { // Coding: the card is already in Coding (moved by advance), now the developer codes
      const sv = L.loadPlan(st, issue);
      // review feedback (In Review -> Coding): the SAME developer who coded it fixes it on the existing feature/<KEY> branch
      const review = !!na.review_feedback;
      const dev = sv.developer || (review && L.codingDeveloper(sv, na.assigned_role, devRoles)) || L.pickDeveloper(devRoles, null, na.assigned_role, `${iss.summary} ${iss.description}`);
      const who = L.stageStaff(na, s0, { kind: "code", developer: dev });
      if (review) { await jiraOps(issue); await say(false, L.reviewBackComment(dev)); log(`lean: ${issue} review feedback -> back to Coding, developer ${dev}`); }
      // QC baseline (script, no tokens): run the repo's checks on the untouched tree so QC only blames new failures
      const baselines = { ...(sv.qc_baseline ?? {}) }, selfCheck = {};
      for (const rp of runRepos) {
        L.ensureBranch(rp, branch);
        const checks = qcAhead ? L.detectChecks(rp) : [];
        if (checks.length && !baselines[rp]) { baselines[rp] = L.runChecks(rp, checks).map(({ name, ok }) => ({ name, ok })); log(`lean: ${issue} QC baseline ${rname(rp)}: ${baselines[rp].map((x) => `${x.name}=${x.ok ? "ok" : "fail"}`).join(", ")}`); }
        selfCheck[rp] = L.needsSelfCheck(baselines[rp]); // no script check at all -> the developer runs the cheapest check itself (a failing baseline is ignored, not looped on)
      }
      const steps = review ? [sv.tech_plan ?? ""] : X.splitSteps(sv.tech_plan, Number(process.env.AH_CODE_STEPS ?? 3)), host1 = L.prSteps(na, seg).open || L.prSteps(na, seg).merge;
      let r = null;
      if (steps.length === 1) r = await codeOnce(s0, { techPlan: sv.tech_plan, feedback: review ? na.review_feedback : fb, review, baselines, selfCheck, who, dev, host: host1 });
      else { // sub-steps: one WIP commit each on feature/<KEY>, checkpoint + progress note after each; a rerun skips finished steps
        const ck = X.ckptLoad(st, issue) ?? {};
        let done = ck.stage === s0 && (ck.running || ck.failed) ? [...(ck.code_done ?? [])] : [];
        // A stale checkpoint can claim every sub-step is done without a
        // durable implementation commit (for example after a worker crash).
        // Never enter the evidence gate in that state: restart Coding at step 1.
        if (done.length >= steps.length && !sv.commit && !ck.last_commit) {
          log(`lean: ${issue} coding checkpoint ${done.length}/${steps.length} has no commit; resetting to sub-step 1/${steps.length}`);
          done = [];
          X.ckptSave(st, issue, { stage: s0, code_done: [], last_commit: null, failed: null, running: true });
        }
        if (done.length) log(`lean: ${issue} coding: resume at sub-step ${done.length + 1}/${steps.length}`);
        const parts = [];
        for (let i = 0; i < steps.length; i++) {
          if (done.includes(i)) continue;
          const last = i === steps.length - 1;
          const ri = await codeOnce(s0, { techPlan: `${sv.tech_plan}\n\nDo ONLY sub-step ${i + 1}/${steps.length} now${done.length ? ` (steps ${done.map((d) => d + 1).join(", ")} are already committed)` : ""}:\n${steps[i]}`, feedback: fb, baselines, selfCheck: last ? selfCheck : {}, who, dev, host: last && host1, wip: last ? null : `${i + 1}/${steps.length}` });
          if (!ri) return;
          parts.push(ri); done.push(i); X.ckptSave(st, issue, { stage: s0, code_done: done, last_commit: ri.commit ?? null });
          if (!last) await say(who, X.progressNote(L.getLang(), L.stageTitle(s0), steps, done));
        }
        r = parts.length
          ? { ...parts.at(-1), summary: parts.map((x) => x.summary).filter(Boolean).join("\n"), tests: parts.map((x) => x.tests).filter(Boolean).join("\n") }
          : { summary: sv.summary ?? "resumed: all sub-steps were already committed", tests: sv.tests ?? "", commit: sv.commit ?? ck.last_commit ?? null, where: sv.where ?? `Branch ${branch}` };
      }
      if (!r) return;
      const evidencePolicy = { ...(na.implementation_policy ?? na.workflow_policy?.implementation ?? {}), allow_missing_tests: qcAhead };
      const evidence = L.implementationEvidence(r, r.commit, r.where, evidencePolicy);
      if (!evidence.ok) { const e = new Error(`implementation evidence gate failed: ${evidence.reasons.join("; ")}`); e.command = "coding worker + local commit + required build/test"; e.agentCode = 1; e.agentOut = JSON.stringify({ summary: r.summary ?? "", tests: r.tests ?? "", commit: r.commit ?? null, where: r.where ?? "", reasons: evidence.reasons }); throw e; }
      L.savePlan(st, issue, { tech_plan: sv.tech_plan ?? r.tech_plan, summary: r.summary, tests: r.tests, commit: r.commit, branch, repos: runRepos, developer: dev, qc_baseline: baselines, where: r.where, implementation_evidence: evidence });
      await say(who, [review ? "CODE (review feedback)" : "CODE", !sv.tech_plan && r.tech_plan && `Tech plan:\n${r.tech_plan}`, `Summary: ${r.summary ?? ""}`, r.tests && `Checks: ${r.tests}`, r.where].filter(Boolean).join("\n"));
      const art = (k) => ({ tech_plan: r.tech_plan, pr: `${r.summary}\n${r.where}`, qc_pass: r.tests || r.summary, note: `${r.summary}\n${r.tests ?? ""}\n${r.where}` }[k] ?? r.summary);
      const to = seg.moves[0];
      if (to) { const need = L.neededArtifact(s0, to); if (need) await record(need, art(need)); if (!(await advance(s0, to, art))) return; }
      continue;
    }
    if (seg.kind === "qc") { // QC by script: the repo's checks vs the baseline; one cheap fix round through Coding on a new failure
      const who = L.stageStaff(na, s0, { kind: "qc" });
      const checklistState = L.loadPlan(st, issue);
      if (!checklistState.qc_checklist_posted) {
        const checklist = L.qcChecklist(na.qc_policy ?? {}, { issue });
        if (jira) { await jira.comment(issue, `[agent-holding] [QC]\n${checklist}`).catch((e) => log(`QC checklist comment failed: ${e.message}`)); }
        L.savePlan(st, issue, { qc_checklist_posted: true, qc_checklist_marker: `<!-- agents-holding:qc-checklist:${issue} -->`, qc_checklist_fallback: "Jira comment edit API unavailable; marker is stable and checklist state is persisted in checkpoint." });
      }
      const codingKey = (na.flow_stages ?? []).includes("coding") ? "coding" : null;
      const runQc = () => { const sv = L.loadPlan(st, issue); return runRepos.map((rp) => ({ rp, v: L.qcVerdict(sv.qc_baseline?.[rp] ?? null, L.runChecks(rp, L.detectChecks(rp))) })); };
      const qcText = (res) => res.map((x) => `${runRepos.length > 1 ? rname(x.rp) + ": " : ""}${x.v.text}`).join("\n");
      for (const rp of runRepos) L.ensureBranch(rp, branch);
      let res = runQc(), fixes = 0;
      while (res.some((x) => !x.v.pass) && fixes < 1 && codingKey) {
        const txt = qcText(res); await record("qc_fail", txt); await say(who, `QC FAIL\n${txt}\nBack to Coding for one fix.`);
        const recoveryKey = (na.flow_stages ?? []).includes("reopened") ? "reopened" : codingKey;
        if (!(await advance(s0, recoveryKey))) return;
        const sv = L.loadPlan(st, issue), dev = sv.developer ?? "tech-lead", dwho = L.stageStaff(na, codingKey, { kind: "code", developer: dev });
        const r = await codeOnce(codingKey, { techPlan: sv.tech_plan, dev, feedback: `QC failed, fix it:\n${res.filter((x) => !x.v.pass).map((x) => x.v.failed.map((f) => `${f.name}: ${f.out}`).join("\n")).join("\n")}`, who: dwho });
        if (!r) return;
        L.savePlan(st, issue, { summary: `${sv.summary ?? ""}\nFix: ${r.summary ?? ""}`, commit: r.commit, where: r.where });
        await say(dwho, `FIX\n${r.summary ?? ""}\n${r.where}`);
        if (!(await advance(codingKey, s0))) return;
        fixes++; res = runQc();
      }
      const sv = L.loadPlan(st, issue);
      if (res.some((x) => !x.v.pass)) { const txt = qcText(res); await record("qc_fail", txt); await say(who, `QC FAIL\n${txt}\nStopping: needs a look from you.`, "qc"); log(`lean: ${issue} QC failed after ${fixes} fix(es); stopped`); return; }
      const txt = [qcText(res), res.every((x) => !x.v.passed.length) && sv.tests && `Developer check: ${sv.tests}`].filter(Boolean).join("\n");
      const steps = L.prSteps(na, seg), h = steps.open || steps.merge ? host(sv) : { msg: [] };
      const where = [sv.where, ...h.msg].filter(Boolean).join("\n");
      await say(who, `QC PASS\n${txt}${where ? `\n${where}` : ""}`);
      if (h.msg.some((m) => /NOT done|failed/.test(m))) return;
      const digest = (s) => `sha256:${createHash("sha256").update(String(s ?? "")).digest("hex")}`;
      const configured = na.qc_policy?.checks ?? ["implementation_command", "build_install", "tests", "working_tree_artifact_policy", "local_commit"].map((id) => ({ id, required: true }));
      const checksOut = res.flatMap((x) => [...x.v.passed, ...x.v.failed]);
      const checkRows = configured.map((spec) => { const id = String(spec.id), match = checksOut.find((x) => (id.includes("static") && /lint|typecheck|analy/i.test(x.name)) || (id === "build" && /build|install/i.test(x.name)) || (id.includes("unit") && /test|unit/i.test(x.name)) || (id.includes("integration") && /integration|smoke/i.test(x.name))); const x = id === "implementation_command" ? { command: "coding worker result + local commit", ok: !!sv.implementation_evidence, out: sv.implementation_evidence?.summary ?? "missing" } : id === "artifact-check" || id === "working_tree_artifact_policy" ? { command: "git status / artifact policy", ok: !!sv.where, out: sv.where ?? "missing" } : id === "local_commit" ? { command: "git commit (local, no push)", ok: !!sv.commit, out: sv.commit ?? "missing" } : match ? { command: match.name, ok: !!match.ok, out: match.out } : { command: spec.commands?.join(" && ") || spec.tool || id, ok: false, out: "missing configured evidence" }; return { id, ...x, exit_code: x.ok ? 0 : 1, stdout_digest: digest(x.out), stderr_digest: digest(x.ok ? "" : x.out), commit: sv.commit ?? "", tree: digest(sv.where ?? ""), artifacts: [sv.where, sv.commit].filter(Boolean), timestamp: new Date().toISOString(), actor: "agents-holding-qc", model: "script", ok: !!x.ok }; });
      const qcReport = { timestamp: new Date().toISOString(), actor: "agents-holding-qc", developer: sv.developer ?? null, model: "script", pass: checkRows.every((x) => x.ok), checks: checkRows };
      if (!qcReport.pass) {
        const failed = checkRows.filter((x) => !x.ok).map((x) => x.id).join(", ");
        const failureText = `QC evidence gate failed: ${failed}`;
        await record("qc_fail", failureText);
        await say(who, `QC FAIL\n${failureText}\nReturning to Coding for remediation.`);
        const recoveryKey = (na.flow_stages ?? []).includes("reopened") ? "reopened" : codingKey;
        if (recoveryKey) await advance(s0, recoveryKey);
        else log(`lean: ${issue} QC failed; no recovery stage configured`);
        return;
      }
      await record("qc_report", JSON.stringify(qcReport));
      const art = (k) => ({ pr: `${sv.summary ?? ""}\n${where}`, qc_pass: txt, note: `${txt}\n${where}` }[k] ?? txt);
      const to = seg.moves[0];
      if (to) { const need = L.neededArtifact(s0, to); if (need) await record(need, art(need)); else await record("qc_pass", txt); if (!(await advance(s0, to, art))) return; }
      else await record("qc_pass", txt);
      continue;
    }
  }
  await jiraOps(issue);
  X.ckptSave(st, issue, { running: false });
  let na2 = null; try { na2 = await mcp("next_action", { company, task: issue, listener_jira: true }); } catch {}
  if (na2 && !na2.waiting && na2.stage !== na.stage && depth < 2) { log(`lean post-run: ${issue} now ${na2.stage}, not waiting; continuing`); return leanRunInner({ ...p, event: "chain" }, na2, depth + 1, vis); }
}

// Done: distill the user's own comments on the task into general habits (one cheap call, only if there are user comments).
async function learnHabits(issue, readKey, staff) {
  if (!jira) return log(`habits: ${issue}: no Jira client, skipped`);
  let j; try { j = await jira.issue(readKey); } catch (e) { return log(`habits: Jira read ${readKey} failed (${e.message})`); }
  const cm = L.userComments(j); if (!cm.length) return log(`habits: ${issue}: no user comments, no model call`);
  const old = L.loadHabits(homedir(), company), iss = { key: issue, ...L.compactIssue(j) };
  const r = await leanModel("habits", issue, "done", L.habitsPrompt(iss, cm, old));
  const { all, added } = L.mergeHabits(old, Array.isArray(r?.habits) ? r.habits : []);
  if (!added.length) return log(`habits: ${issue}: nothing new (${old.length} kept)`);
  L.saveHabits(homedir(), company, all); log(`habits: ${issue}: +${added.length} (${all.length} total)`);
  await comms(issue, L.learnedComment(staff, added));
}

// Deterministic Jira card moves (no AI): transition by target STATUS NAME, fallback stage comment. Dry: print only.
async function jiraOps(issue) {
  if (!listenerJira) return;
  let ops = []; try { ops = (await mcp("jira_ops", { company, issue })).ops; } catch (e) { return log("jira_ops failed:", e.message); }
  for (const o of ops) {
    if (dryJira) { log(`JIRA (dry): ${o.notice ? `comment ${o.issue} "${o.notice}"; ` : ""}transition ${o.issue} -> ${o.to_names.join(" | ")} (else comment "${o.fallback_comment}")`); continue; }
    try {
      let authHdr = null, base = null;
      const { atlassianToken } = await import("./attach.mjs");
      const A = await atlassianToken();
      if (A?.jira) { authHdr = A.auth(); base = A.jira; }
      else if (jiraCfg) {
        const tok = L.jiraToken(jiraCfg); if (!tok) throw new Error("no Jira token (holding jira connect)");
        authHdr = "Basic " + Buffer.from(`${jiraCfg.email}:${tok}`).toString("base64");
        base = `${jiraCfg.site.replace(/\/$/, "")}/rest/api/3`;
      } else { log(`JIRA: not connected; cannot move ${o.issue} (holding jira connect)`); continue; }
      const api = (m, path, body) => fetch(`${base}/issue/${encodeURIComponent(o.issue)}${path}`, { method: m,
        headers: { Authorization: authHdr, "Content-Type": "application/json", Accept: "application/json" }, body: body && JSON.stringify(body) });
      const adf = (t) => ({ body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } });
      const cur = (await (await api("GET", "?fields=status")).json())?.fields?.status?.name ?? "";
      if (o.to_names.some((n) => n.toLowerCase() === cur.toLowerCase())) { log(`JIRA: ${o.issue} already in ${cur}`); continue; }
      if (o.notice) await api("POST", "/comment", adf(o.notice));
      const tr = (await (await api("GET", "/transitions")).json()).transitions ?? [];
      const hit = o.to_names.map((n) => tr.find((t) => t.to?.name?.toLowerCase() === n.toLowerCase())).find(Boolean);
      if (hit) { const r = await api("POST", "/transitions", { transition: { id: hit.id } }); log(`JIRA: moved ${o.issue} -> ${hit.to.name} (${r.status})`); }
      else { await api("POST", "/comment", adf(o.fallback_comment)); log(`JIRA: no transition to ${o.to_names.join("|")} for ${o.issue}; commented stage. Manual move needed.`); }
    } catch (e) {
      log(`JIRA op failed for ${o.issue}:`, e.message);
      if (/JIRA_AUTH_EXPIRED/.test(String(e?.message))) {
        const guidance = `Jira authorization expired or was rejected. Run \`holding jira connect --switch\` to refresh OAuth, then \`holding listener restart\`. The task is paused safely until Jira access is restored.`;
        try { await mcp("inbox_post", { company, issue: o.issue, kind: "blocked", need: "refresh Jira authorization", body: guidance }); } catch (notify) { log("JIRA auth guidance inbox failed:", notify.message); }
        L.writeStatus(homedir(), { jira_auth: { state: "expired", issue: o.issue, guidance, at: new Date().toISOString() } });
      }
    }
  }
}

// Headless grok must never block on an approval prompt: auto-approve, and also explicitly allow every
// configured MCP server (global ~/.grok/config.toml + repo .grok/config.toml), e.g. agents-holding and the
// Atlassian one whatever it's named. Override with AH_GROK_ARGS (space-separated) if needed. --dry-jira denies Jira MCP servers.
function mcpServers() {
  const names = new Set(["agents-holding"]);
  for (const f of [join(homedir(), ".grok/config.toml"), join(repo, ".grok/config.toml")]) {
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/^\[mcp_servers\.("?)([^\]".]+)\1\]/gm)) names.add(m[2]);
  }
  return [...names];
}
const isJiraServer = (n) => /jira|atlassian|confluence/i.test(n);
function grokArgs(prompt, sid, o = {}) {
  const sess = o.resume ? ["--resume", sid] : ["--session-id", sid];
  const mdl = o.model ? ["--model", o.model] : [];
  if (process.env.AH_GROK_ARGS) return [...process.env.AH_GROK_ARGS.split(" ").filter(Boolean), ...sess, ...mdl, "--single", prompt];
  const servers = mcpServers();
  const allows = servers.filter((n) => !(dryJira && isJiraServer(n))).flatMap((n) => ["--allow", `mcp__${n}`]);
  const denies = dryJira ? servers.filter(isJiraServer).flatMap((n) => ["--deny", `mcp__${n}`]) : [];
  return ["--trust", "--always-approve", ...allows, ...denies, ...sess, ...mdl, "--single", prompt];
}

// ---- Supabase Realtime (Phoenix v1 protocol over native WebSocket) ----
let ref = 0;
// Watchdog (every 30s): a socket with nothing received for > AH_STALE_SEC (default 120s; Phoenix heartbeats are answered every 25s)
// is closed -> the normal reconnect path; the user gets one notification per outage.
const sockets = {}, lastRx = {}, downNotified = {}, staleMs = Number(process.env.AH_STALE_SEC ?? 300) * 1000;
setInterval(() => {
  for (const c of companyList) {
    if (!L.socketStale(lastRx[c], Date.now(), staleMs)) continue;
    log(`watchdog: ${c} realtime silent > ${staleMs / 1000}s; reconnecting`);
    if (!downNotified[c]) { downNotified[c] = true; L.desktopNotify(homedir(), "agents-holding", `Listener lost the server connection (${c}); reconnecting`); }
    lastRx[c] = Date.now(); try { sockets[c]?.close(); } catch {}
  }
}, 30000).unref?.();
// Replay real Jira changes missed during an outage (listener or server down): issues updated since the last seen event,
// one reconcile_issue per (issue, status, updated), deduped locally and on the server. Reads Jira only; never writes Jira events.
const reconciling = {};
async function reconcile(company, sinceIso) {
  if (!jira || reconciling[company]) return; reconciling[company] = true;
  try {
    const stc = L.readStatus(homedir())?.companies?.[company] ?? {};
    const since = [sinceIso, stc.last_event_at].filter(Boolean).sort()[0] ?? new Date(Date.now() - 3600e3).toISOString();
    const st = L.stateDir(homedir(), company), seen = X.replaySeen(st), boards = registry.projects.flatMap((p) => p.boards).filter((b) => b.company === company);
    let n = 0;
    for (const b of boards) {
      const res = await jira.search(X.jqlSince(b.project_key, since), ["status", "updated", "summary", "description", "labels", "assignee", "comment"]);
      for (const x of X.replayTodo(res, seen)) {
        const f = res.find((i) => i.key === x.key)?.fields ?? {};
        await mirrorSync(company, b.project_key, x.key, x.status, x.updated);
        const latestComment = [...(f.comment?.comments ?? [])].sort((a, z) => String(z.created ?? "").localeCompare(String(a.created ?? ""))).at(-1);
        const r = await mcp("reconcile_issue", { company, issue: x.key, status: x.status, updated: x.updated, project_key: b.project_key, summary: f.summary ?? "", description: f.description ?? "", labels: f.labels ?? [], assignee_account: f.assignee?.accountId ?? null,
          comment: latestComment ? { id: latestComment.id, body: latestComment.body, author: latestComment.author } : null });
        X.replayMark(st, [X.replayKey(x.key, x.status, x.updated)]); n++;
        await applyJiraRules({ company, issue: x.key, event: x.status?.toLowerCase() === "done" ? "issue_transitioned" : "label_added" });
        log(`reconcile ${x.key} "${x.status}": ${r.duplicate ? "already applied" : r.replayed ? `replayed (${r.event ?? "?"}, ${r.stage_before ?? "new"} -> ${r.stage_after ?? "?"})` : `skipped (${r.reason ?? "?"})`}`);
      }
    }
    log(`reconcile ${company}: ${n} change(s) since ${since}`);
    L.writeStatus(homedir(), { companies: { [company]: { reconciled_at: new Date().toISOString(), reconciled: n } } });
  } finally { reconciling[company] = false; }
}
// Webhooks require Jira site-admin permission. Keep a bounded, read-only
// reconcile fallback active even when realtime is healthy.
// Company setting: Jira status sync interval. AH_JIRA_RECONCILE_SEC remains a
// local diagnostic override; never poll faster than once per minute.
setInterval(() => {
  const now = Date.now();
  for (const c of companyList) if (now - statusSyncAt[c] >= (envStatusSyncSec ?? statusSyncSec[c]) * 1000) {
    statusSyncAt[c] = now;
    reconcile(c).catch((e) => log(`scheduled reconcile ${c} failed:`, e.message));
  }
}, 10000).unref?.();
// Company-defined Jira Listener rules: real events only; deterministic planning and Jira actions use zero model tokens.
const RULE_EVENTS = { user_move: "issue_transitioned", agent_move: "issue_transitioned", issue_transitioned: "issue_transitioned", user_comment: "comment_created", comment_created: "comment_created", task_done: "issue_transitioned", subtask_done: "all_subtasks_done", assignee_changed: "assignee_changed", label_added: "label_added" };
async function applyJiraRules(p) {
  if (!p.issue || !jiraCfg) return;
  const board = registry.projects.flatMap((pr) => pr.boards ?? []).find((b) => b.project_key === p.issue.split("-")[0] && b.company === (p.company ?? company));
  const project = registry.projects.find((pr) => pr.path && (pr.boards ?? []).includes(board));
  if (!project) return;
  const co = p.company ?? company;
  const { rules } = JR.loadRules(project.path, co, { project: board?.project_key, defaultProcess: await JR.defaultProcess(co, mcp) }); if (!rules.some((r) => r.enabled)) return;
  const stateDir = join(homedir(), ".config/agents-holding/state", p.company ?? company), auditFile = join(stateDir, "jira-rule-actions.json");
  let audit = {}; try { audit = JSON.parse(readFileSync(auditFile, "utf8")); } catch {}
  const updated = issueUpdated(p.issue);
  try {
    const A = await (await import("./attach.mjs")).atlassianToken(homedir(), { site: board?.site }); if (!A?.auth) return log("rules: Jira not connected");
    const req = jiraRaw(A), issue = await req("GET", `/issue/${encodeURIComponent(p.issue)}?fields=summary,status,issuetype,parent,labels,assignee,updated`);
    const status = issue.fields?.status?.name, isDone = issue.fields?.status?.statusCategory?.key === "done" || status?.toLowerCase() === "done";
    const event = RULE_EVENTS[p.event] ?? p.event, events = [...new Set([event, event === "issue_transitioned" && isDone && issue.fields?.parent ? "all_subtasks_done" : null].filter(Boolean))];
    const actions = [];
    for (const ev of events) { const ctx = await JR.contextFor(req, issue); for (const r of rules) for (const a of JR.planRule(r, issue, ev, ctx)) { const id = `${r.id}:${ev}:${a.index}:${a.key}:${issue.fields?.updated ?? updated}`; if (!audit[id]) actions.push({ ...a, audit_id: id }); } }
    const result = await JR.executeActions(req, actions, { dry: dryJira,
      runStaff: async (a) => { const cp = await import("node:child_process"); cp.execFileSync(process.execPath, [join(homedir(), ".agents-holding/scripts/run-cli.mjs"), a.staff, a.request ?? interpolateRule(a.text, issue), "--company", p.company ?? company], { cwd: project.path, stdio: "inherit" }); },
      notify: async (a) => { appendFileSync(join(homedir(), ".config/agents-holding/state", p.company ?? company, "ceo-notices.log"), `${new Date().toISOString()} [${a.rule}] ${a.text ?? a.to}\n`); } });
    for (const a of result) { if (a.ok && !dryJira) audit[a.audit_id] = new Date().toISOString(); log(`rule ${a.rule}: ${a.type} ${a.key} ${dryJira ? "(dry-run)" : a.ok ? "ok" : `failed: ${a.error}`}`); }
    if (!dryJira && result.length) { mkdirSync(stateDir, { recursive: true }); writeFileSync(auditFile, JSON.stringify(Object.fromEntries(Object.entries(audit).slice(-5000)), null, 2), { mode: 0o600 }); }
  } catch (e) { log(`rules ${p.issue}: ${e.message}`); }
}
const issueUpdated = () => new Date().toISOString();
const interpolateRule = (text, issue) => String(text ?? "").replaceAll("{issue}", issue.key).replaceAll("{status}", issue.fields?.status?.name ?? "");
const backoffs = {}, joinedOnce = {};
async function connect(company) {
  backoffs[company] ??= 1000;
  const sub = await mcp("realtime_subscription", { company });
  const ws = new WebSocket(`${sub.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${sub.publishable_key}&vsn=1.0.0`);
  const topic = `realtime:${sub.topic}`;
  const send = (t, event, payload) => ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) }));
  let hb;
  sockets[company] = ws; lastRx[company] = Date.now();
  const rt = (state) => L.writeStatus(homedir(), { companies: { [company]: { realtime: state, realtime_at: new Date().toISOString() } } });
  rt("connecting");
  ws.onopen = () => {
    send(topic, "phx_join", { config: { broadcast: { self: false, ack: false }, presence: { key: "" }, postgres_changes: [], private: true }, access_token: sub.publishable_key });
    hb = setInterval(() => send("phoenix", "heartbeat", {}), 25000);
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data); lastRx[company] = Date.now();
    if (msg.event === "phx_reply" && msg.topic === topic) { log("join", msg.payload.status, "company", company); if (msg.payload.status === "ok") { joined.add(company); backoffs[company] = 1000; heartbeat(); rt("joined"); if (!joinedOnce[company]) { joinedOnce[company] = true; reconcile(company).catch((e) => log("reconcile failed:", e.message)); } if (downNotified[company]) { downNotified[company] = false; L.desktopNotify(homedir(), "agents-holding", `Listener reconnected (${company})`); reconcile(company).catch((e) => log("reconcile failed:", e.message)); } } else { joined.delete(company); heartbeat("starting"); rt(`join ${msg.payload.status}`); } }
    if (msg.event === "broadcast" && msg.payload?.event === "next_action") {
      const p = { ...(msg.payload.payload ?? {}), company };
      if (p.enterprise && company in myJira && p.assignee_account !== myJira[company]) { log("skip", p.issue ?? "", "(assigned to someone else)"); return; }
      if (p.rules_only) { applyJiraRules(p).catch((e) => log("rules failed:", e.message)); return; }
      L.writeStatus(homedir(), { companies: { [company]: { last_event_at: new Date().toISOString(), last_event: `${p.event} ${p.issue ?? ""}`.trim() } } });
      log("next_action", company, p.event, p.issue ?? p.task_id ?? "", "stage", p.stage, p.waiting ? "(waiting on user)" : "");
      const sf = p.staffing; // staffing gate (needs-hire / needs-decision): post ONE rich comment + label, no run; cleared -> remove labels
      if (sf && (p.issue ?? p.task_id)) {
        const k = p.issue ?? p.task_id, other = ["needs-hire", "needs-decision"].filter((l) => l !== sf.label);
        const nd = { ...(L.readStatus(homedir())?.companies?.[company]?.needs ?? {}) }; if (sf.kind === "ok") delete nd[k]; else nd[k] = sf.label;
        L.writeStatus(homedir(), { companies: { [company]: { needs: nd } } });
        if (sf.kind !== "ok") {
          log(`staffing ${k}: ${sf.kind} ${[...(sf.missing_roles ?? []), ...(sf.missing_skills ?? [])].join(",")}${sf.post ? "" : " (already asked)"}`);
          if (jira) jira.labels(k, [sf.label], other).catch((e) => log("Jira label failed:", e.message))
            .then(() => (p.say ? comms(k, p.say) : null)).then(() => (sf.post && sf.text ? comms(k, sf.text, sf.kind === "needs_hire" ? "hire" : "decision") : null)).catch((e) => log("Jira comment failed:", e.message));
          if (sf.post) L.notify?.(`Jira Listener: ${k} ${sf.kind === "needs_hire" ? "needs a hire" : "needs your decision"}`);
          return;
        }
        if (sf.clear && jira) jira.labels(k, [], ["needs-hire", "needs-decision"]).catch((e) => log("Jira label failed:", e.message));
      }
      if (p.say && (p.issue ?? p.task_id)) { // server-decided one-off reply (To Do comment / "who should take this?"): post as is, no run
        const k = p.issue ?? p.task_id;
        comms(k, p.say);
        if (!(p.event === "staffing_choice" && !p.waiting)) return; // "3 proceed": confirm, then run
      }
      applyJiraRules(p).catch((e) => log("rules failed:", e.message));
      if (p.waiting) return; // user gate
      if (DEBOUNCED.has(p.event)) return debounce(p); // a drag + comment arrive as 2 webhooks: one run, after both landed
      // agent_move: the agent's own advance. If a run for that issue is still active it is queued and handled
      // after exit (the run may stop right after advancing, e.g. pre_coding -> coding, leaving the new stage undone).
      wake(p);
      return;
    }
  };
  ws.onclose = () => { clearInterval(hb); joined.delete(company); heartbeat("starting"); if (sockets[company] === ws) delete sockets[company]; rt("disconnected"); log(`\x1b[31mrealtime disconnected (${company})\x1b[0m`);
    if (!downNotified[company]) { downNotified[company] = true; L.desktopNotify(homedir(), "agents-holding", `Jira Listener lost the server connection (${company}); reconnecting`); } const b = backoffs[company]; log("socket closed", company, "; reconnect in", b, "ms"); setTimeout(() => connect(company).catch(fail(company)), b); backoffs[company] = Math.min(b * 2, 60000); };
  ws.onerror = () => {};
}
const fail = (company) => (e) => { const b = backoffs[company] ?? 1000; log("error", company, e.message); setTimeout(() => connect(company).catch(fail(company)), b); backoffs[company] = Math.min(b * 2, 60000); };
// Manual one-shot replay of a missed/killed run: holding listener run --run KAN-1 --event user_comment --stage todo
if (opt("--run")) { log("manual run", opt("--run")); wake({ company: opt("--company", company), issue: opt("--run"), event: opt("--event", "manual"), stage: opt("--stage", "?") }); }
else {
log("holding listener run:", registry.projects.length, "project(s),", companyList.length, "company subscription(s)", lean ? "LEAN" : "legacy", dryJira ? "DRY-JIRA" : listenerJira ? "jira-by-listener" : "jira-by-agent", "mcp", mcpServers().join(","), "timeout", runTimeoutMs / 60000, "min");
for (const c of companyList) connect(c).catch(fail(c));
}

// Cross-team linked propagation (generic; rules: holding company link add <SRC> --to P1,P2). Real Jira links only; per-target isolation.
async function crossTeamSweep() {
  if (!listenerJira || !jiraCfg || dryJira) return;
  let layer = null; try { const d = await mcp("staff_policy_get", { company, staff: "*" }); layer = (d?.data ?? d)?.company; } catch (e) { return log("cross-team: policy read failed:", e.message); }
  if (!layer?.cross_team?.length && !layer?.processes?.length) return;
  const boardCo = (pk) => registry.projects.flatMap((p) => p.boards ?? []).find((b) => b.project_key === pk)?.company;
  const allowed = (pk) => { const co = boardCo(pk); if (!co) return process.env.AH_CROSS_STRICT === "0";
    try { const p = POL.loadPolicy(homedir(), co, "jira-listener"); return p?.permissions?.jira_transition !== false; } catch { return process.env.AH_CROSS_STRICT === "0"; } };
  const res = await XT.sweep(jiraRaw(jiraCfg), layer, { stateDir: join(homedir(), ".config/agents-holding/state", company), allowed, log,
    notify: async (a) => { appendFileSync(join(homedir(), ".config/agents-holding/state", company, "ceo-notices.log"), `${new Date().toISOString()} [${a.process}] ${a.text}\n`); log(`CEO notice: ${a.text}`); } });
  const bad = res.filter((r) => !r.ok); if (bad.length) log(`cross-team: ${bad.length} target(s) failed; will retry next sweep`);
}
setInterval(() => { crossTeamSweep().catch((e) => log("cross-team sweep failed:", e.message)); }, Number(process.env.AH_CROSS_SEC ?? 120) * 1000);
