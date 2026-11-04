#!/usr/bin/env node
// holding listen: wake the LOCAL agent when the server broadcasts a next_action for this repo's company.
// Multi-project: one process for every repo in ~/.config/agents-holding/projects.json (see registry.mjs; --repo DIR = only that repo).
// Usage: holding listen [--repo DIR] [--once] [--dry-jira] | [--run ISSUE --event E --stage S [--dry-jira]]   (license: $AGENTS_HOLDING_KEY or Keychain agents-holding-license|agents-holding-test-license)
// One agent run at a time; events arriving during a run are coalesced into one follow-up run. Logs: ~/Library/Logs/agents-holding/.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import * as L from "./lean.mjs";
import * as R from "./registry.mjs";

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
const logFile = join(logDir, "listen.log");
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
  if (!registry) throw new Error("no projects: run `holding add-project --jira-project KEY` inside a repo");
  R.save(homedir(), registry); log(`registry: migrated ${registry.projects[0].path} into ${R.registryPath(homedir())}`);
}
if (onlyRepo) {
  registry = { ...registry, projects: registry.projects.filter((p) => p.path === onlyRepo) };
  if (!registry.projects.length) { const m = R.migrate(homedir(), onlyRepo, { site: jiraSite }); if (!m) throw new Error(`${onlyRepo}: no .agents/company.json and not in projects.json`); registry = m; }
}
const companyList = R.companies(registry);
let company = companyList[0];
for (const p of registry.projects) log(`project ${p.name} ${p.path} boards ${p.boards.map((b) => `${b.project_key}@${b.company}`).join(",")} settings ${JSON.stringify(p.settings ?? {})}`);

async function mcp(name, a) {
  const r = await fetch(`${base}/functions/v1/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}`, ...deviceHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }) });
  const j = await r.json(); const t = j.result?.content?.[0]?.text;
  if (!t || j.result.isError) throw new Error(`${name} failed: ${t ?? JSON.stringify(j.error)}`);
  return JSON.parse(t);
}

// ---- server-side last-seen heartbeat (for /listener and /doctor); best effort ----
const autostartPlist = join(homedir(), "Library/LaunchAgents/com.agentsholding.listener.plist");
const heartbeat = () => Promise.all(companyList.map((company) => mcp("listener_heartbeat", { company, host: hostname(), pid: process.pid, autostart: existsSync(autostartPlist), version: "3" })
  .then(() => L.writeStatus(homedir(), { companies: { [company]: { heartbeat_at: new Date().toISOString(), heartbeat_ok: true } } }))
  .catch((e) => { log("heartbeat failed:", e.message); L.writeStatus(homedir(), { companies: { [company]: { heartbeat_at: new Date().toISOString(), heartbeat_ok: false } } }); })));
L.writeStatus(homedir(), { pid: process.pid, started_at: new Date().toISOString(), notify: L.notifyOn(homedir()), running: null, companies: {} });
setInterval(heartbeat, 10 * 60 * 1000);
process.on("SIGUSR1", () => heartbeat()); // `holding listener autostart on|off` pokes us to report the new state

// ---- one-at-a-time runner (token saving) ----
// One grok run at a time, per-issue queue (latest wins). Token saving:
//  * chained stages: the server's next_action returns the run of agent stages up to the next gate; the agent does them in ONE run,
//    and agent_move notices for the issue being run are ignored (a post-run check re-runs only if work is left);
//  * one grok session per task: resumed (--resume) after gates, fresh session + compact server context as fallback;
//  * per-stage model hint from the company flow (--model), overridable with AH_MODEL;
//  * deterministic Jira moves: the listener moves the card after the run (Jira REST with ~/.config/agents-holding/jira.json),
//    no AI tokens; --dry-jira prints every Jira action instead and denies the Jira MCP to the agent;
//  * tokens per run from the grok session usage.json -> listen.log + report_usage (/usage per task/stage).
const dryJira = args.includes("--dry-jira");
let sessFile, sessions;
const loadSessions = () => { sessFile = join(homedir(), ".config/agents-holding", `sessions-${company}.json`); try { sessions = JSON.parse(readFileSync(sessFile, "utf8")); } catch { sessions = {}; } };
loadSessions();
const saveSessions = () => { try { writeFileSync(sessFile, JSON.stringify(sessions, null, 1), { mode: 0o600 }); } catch (e) { log("session store failed:", e.message); } };
// ~/.config/agents-holding/jira.json (chmod 600): {"site","email","keychain_service"} -- NO token. The API token lives in the macOS
// Keychain (security add-generic-password -s <keychain_service> -a <email> -w) and is read per request, kept in memory only.
const jiraCfg = (() => { const p = join(homedir(), ".config/agents-holding/jira.json"); try { const j = JSON.parse(readFileSync(p, "utf8"));
  if (j.token) log("WARNING: jira.json contains a token; it is ignored. Move it to the Keychain and delete the field.");
  return j.site && j.email && j.keychain_service ? { site: j.site, email: j.email, keychain_service: j.keychain_service } : null; } catch { return null; } })();
const lean = process.env.AH_LEAN !== "0";
const jira = jiraCfg ? L.jiraClient(jiraCfg, { dry: dryJira, log }) : null;
const leanHome = lean ? L.leanGrokHome(homedir()) : null;
const listenerJira = dryJira || !!jiraCfg;
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
const pending = new Map(); // issue -> latest notice
function wake(p) {
  const k = `${p.company ?? company}/${p.issue ?? p.task_id ?? "?"}`;
  if (running) {
    if (p.event === "agent_move" && k === runningIssue) { log(`chain: ignoring agent_move ${k} -> ${p.stage} (the active run continues it)`); return; }
    const had = pending.has(k); pending.delete(k); pending.set(k, p);
    log(`busy (run active for ${runningIssue}); ${had ? "replaced queued" : "queued"} ${p.event} ${k} stage ${p.stage}; pending: ${[...pending.keys()].join(",")}`);
    return;
  }
  running = true; runningIssue = k;
  run(p).catch((e) => log("run error", e.message)).finally(() => {
    running = false; runningIssue = null;
    if (pending.size) { const [k0, n] = pending.entries().next().value; pending.delete(k0); log("running queued notice", n.event, k0, "stage", n.stage); wake(n); }
    else if (once || opt("--run")) process.exit(0);
  });
}

// Route one notice to its repo(s): sets company/repo/runRepos for this run. Several candidate repos and no
// repo:<name> label / component -> one Jira comment asking which, nothing runs (never guess).
async function useCtx(p) {
  const issue = p.issue ?? p.task_id ?? "";
  company = p.company ?? company; loadSessions();
  let meta = { labels: [], components: [] };
  const cands = R.candidates(registry, { company, issue, site: jiraSite });
  if (cands.length > 1 && jira) { try { meta = await jira.meta(issue); } catch (e) { log(`route: Jira labels for ${issue} failed (${e.message})`); } }
  const r = R.route(registry, { company, issue, site: jiraSite, ...meta });
  if (r.none) { log(`route: ${issue} (${company}) matches no registered repo; skipped`); return false; }
  if (r.ask) {
    const st = L.stateDir(homedir(), company);
    if (!L.loadPlan(st, issue).repo_asked) { const t = R.askComment(issue, r.ask); if (jira) await jira.comment(issue, t).catch((e) => log("Jira comment failed:", e.message)); else log(`JIRA (no client): ${t.replace(/\n/g, " ")}`); L.savePlan(st, issue, { repo_asked: r.ask }); }
    log(`route: ${issue} feeds ${r.ask.join(",")}; no repo:<name> label/component -> asked on Jira, waiting`); return false;
  }
  runRepos = r.repos.map((x) => x.path); repo = runRepos[0]; runSettings = r.repos[0].settings ?? {};
  log(`route: ${issue} (${company}) -> ${r.repos.map((x) => x.name).join(", ")}`); return true;
}
let runSettings = {};

async function run(p, depth = 0) {
  const issue = p.issue ?? p.task_id ?? "";
  if (depth === 0 && !(await useCtx(p))) return;
  let na = null; try { na = await mcp("next_action", { company, task: issue, listener_jira: listenerJira }); } catch (e) { log("next_action failed:", e.message); }
  if (na?.waiting && p.event !== "manual") { log(`skip ${issue}: waiting (${na.stage})`); return; }
  if (lean && na) return leanRun(p, na, depth);
  const model = process.env.AH_MODEL || na?.model || null;
  const chainTxt = na?.chain?.length ? ` Chain these stages in this run: ${na.chain.map((c) => c.name).join(" -> ")}.` : "";
  const jiraTxt = dryJira
    ? ` DRY JIRA: never call any Jira/Atlassian tool. Print every Jira action you would take (comments, transitions, links) under "JIRA ACTIONS (dry)" instead.`
    : listenerJira ? ` Do NOT transition Jira cards (pass listener_jira=true to next_action/advance; the listener moves cards). Post Jira comments with my Atlassian MCP.`
    : ` Jira comments/transitions via my Atlassian MCP if available; otherwise print them under "JIRA ACTIONS".`;
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
    const ch = spawn("nice", ["-n", "10", o.bin ?? grokBin, ...gargs], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
    let lastOut = Date.now(); // claude/codex have no grok events file: stdout activity counts as progress
    ch.stdout.on("data", (d) => { lastOut = Date.now(); appendFileSync(out, d); if (o.collect) o.collect.push(d); }); ch.stderr.on("data", (d) => { lastOut = Date.now(); appendFileSync(out, d); });
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
    ch.on("close", (code, sig) => { clearInterval(watch); res(code ?? sig); });
  });
}

// ---- lean run: scripts drive the stages, the model only writes text/code (see lean.mjs) ----
async function leanModel(kind, issue, stage, prompt) {
  const sid = randomUUID(), out = join(logDir, `run-${Date.now()}.log`), buf = [];
  const text = kind !== "code", schema = kind === "tech" ? L.TECH_SCHEMA : kind === "habits" ? L.HABITS_SCHEMA : text ? L.TEXT_SCHEMA : L.CODE_SCHEMA, system = kind === "tech" ? L.TECH_SYSTEM : kind === "habits" ? L.HABITS_SYSTEM : text ? L.TEXT_SYSTEM : null;
  const { agent, model, bin } = L.resolveAgent({ cfg: { agent: runSettings?.agent, model: runSettings?.model, text_model: runSettings?.text_model, ...L.loadAgentCfg(homedir(), company) }, text });
  let gargs, o = { collect: buf };
  if (agent === "claude") { gargs = L.claudeArgs({ model, text: text && kind !== "tech", prompt, schema, system, codeTools: kind === "tech" ? "Read,Grep,Glob" : undefined, maxTurns: kind === "tech" ? 4 : undefined }); o = { ...o, bin, env: { ...process.env } }; }
  else if (agent === "codex") {
    const schemaFile = join(logDir, `schema-${sid}.json`); writeFileSync(schemaFile, JSON.stringify({ ...schema, additionalProperties: false, required: Object.keys(schema.properties) }));
    gargs = L.codexArgs({ model, text, prompt, schemaFile, system }); o = { ...o, bin, env: { ...process.env, CODEX_HOME: L.leanCodexHome(homedir()) } };
  } else { gargs = L.leanGrokArgs({ sid, model, text, prompt, schema, system, ...(kind === "tech" ? { tools: L.TECH_TOOLS, maxTurns: 4 } : {}) }); o = { ...o, home: leanHome, bin }; }
  if (o.env) delete o.env.AGENTS_HOLDING_KEY; // lean runs need no server access
  log(`lean ${kind} call for ${issue} ${stage} agent ${agent} session ${sid} ${model ?? "default model"} prompt ${prompt.length} chars -> ${out}`);
  const t0 = Date.now(); const code = await spawnGrok(gargs, out, issue, sid, o); const wall = Date.now() - t0;
  const stdout = Buffer.concat(buf).toString("utf8");
  let r, u = null;
  if (agent === "grok") { r = L.parseResult(stdout); const g = usageOf(sid, leanHome); if (g) u = { input: g.inputTokens, output: g.outputTokens, cached: g.cachedReadTokens, reasoning: g.reasoningTokens ?? 0, calls: g.modelCalls, model: g.primaryModelId }; }
  else { const p = agent === "claude" ? L.parseClaude(stdout, model) : L.parseCodex(stdout, model); r = p.result; u = p.usage; if (p.error) log(`lean ${kind} ${agent} error for ${issue}: ${p.error.slice(0, 200)}`); }
  if (u) {
    log(`TOKENS ${issue} ${stage}: input ${u.input} output ${u.output} cached ${u.cached} reasoning ${u.reasoning} calls ${u.calls} model ${u.model ?? agent} wall ${Math.round(wall / 1000)}s session ${sid} (lean ${kind}, ${agent})`);
    mcp("report_usage", { company, issue, stage, session_id: sid, model: u.model ?? agent, input_tokens: u.input, output_tokens: u.output, cached_tokens: u.cached,
      reasoning_tokens: u.reasoning, model_calls: u.calls, wall_ms: wall, dry: dryJira }).catch((e) => log("report_usage failed:", e.message));
  } else log(`TOKENS ${issue} ${stage}: no usage reported by ${agent}`);
  if (code !== 0) { log(`lean ${kind} call exited ${code} for ${issue}`);
    if (!r || !Object.keys(r).length) throw new Error(code === "SIGTERM" || code === "SIGKILL" ? `${kind} call timed out (${runTimeoutMs / 60000} min cap)` : `${kind} call exited ${code}`); }
  return r;
}
// Visibility wrapper: Jira "agent-working" label while the run works, "Started <stage>…" once per stage, "Failed <stage>: why" on error,
// macOS notifications (holding notify on|off), local status file for `holding status`.
async function leanRun(p, na, depth = 0) {
  const issue = na.issue ?? p.issue ?? p.task_id; const vis = { labeled: false, started: new Set(), stage: na.stage, staff: L.stageStaff(na, na.stage), worked: false };
  try { const r = await leanRunInner(p, na, depth, vis);
    if (vis.worked && depth === 0) { L.desktopNotify(homedir(), `agents-holding: ${issue}`, `Finished ${L.stageTitle(vis.stage)}`); L.writeStatus(homedir(), { last_run: { issue, result: `ok (${vis.stage})`, at: new Date().toISOString() } }); }
    return r; }
  catch (e) {
    log(`lean run ${issue} FAILED in ${vis.stage}: ${e.message}`);
    if (jira) await jira.comment(issue, L.failedComment(vis.staff, vis.stage, e.message)).catch((x) => log("Jira comment failed:", x.message));
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
  const habits = L.loadHabits(homedir(), company);
  const say = async (staff, t0) => { const t = staff === false ? t0 : `${L.staffTag(staff)} ${t0}`; // every comment: [agent-holding] [<staff name>] ...
    if (dryJira && !jira) return log(`JIRA (dry): comment ${issue} "${t.slice(0, 160).replace(/\n/g, " ")}"`);
    if (jira) await jira.comment(issue, t).catch((e) => log("Jira comment failed:", e.message));
  };
  if (na.waiting) return log(`lean: ${issue} waiting (${na.stage})`);
  const record = (kind, body) => mcp("record_artifact", { company, task: issue, kind, body: body || kind, role: "agent" }).catch((e) => log(`record ${kind} failed:`, e.message));
  const advance = async (from, to, art) => {
    for (let i = 0; i < 2; i++) {
      try { const r = await mcp("advance", { company, task: issue, to_stage: to, listener_jira: true }); log(`lean: ${issue} ${from} -> ${r.stage}`);
        await jiraOps(issue); // move the card NOW, before the next stage's work starts (the board shows what is actually happening)
        return true; }
      catch (e) { const m = e.message.match(/kind=(\w+)/); if (i || !m) { log(`lean: advance ${from} -> ${to} failed: ${e.message}`); return false; } await record(m[1], art?.(m[1])); }
    }
  };
  log(`lean run ${issue} (${p.event}) segments ${L.segments(na).map((s) => `${s.kind}:${s.stages.join(">")}`).join(" | ") || "none"}`);
  let plan = saved.plan ?? null;
  const startStage = async (s0, kind) => { // one "Started" comment per stage per run; label on first real work
    vis.stage = s0; vis.staff = L.stageStaff(na, s0, { kind, developer: L.loadPlan(st, issue).developer }); vis.worked = true;
    L.writeStatus(homedir(), { running: { issue, stage: s0, at: new Date().toISOString(), pid: process.pid } });
    if (vis.started.has(s0)) return; vis.started.add(s0);
    if (jira && !vis.labeled) { vis.labeled = true; await jira.label(issue, "add").catch((e) => log("Jira label add failed:", e.message)); }
    if (kind !== "script" && !(kind === "code" && na.review_feedback)) await say(false, L.startedComment(vis.staff, s0)); // review: the "back to Coding" comment says it
    L.desktopNotify(homedir(), `agents-holding: ${issue}`, `Started ${L.stageTitle(s0)}`);
  };
  for (const seg of L.segments(na)) {
    const s0 = seg.stages[0];
    if (seg.kind !== "move" && !(seg.kind === "script" && s0 === "done")) await startStage(s0, seg.kind);
    if (seg.kind === "move") { if (!(await advance(s0, seg.moves[0]))) return; continue; }
    if (seg.kind === "text") {
      const r = await leanModel("text", issue, s0, L.textPrompt(iss, { habits, prevPlan: s0 === "planned" ? plan : null, feedback: fb, allowQuestion: s0 !== "planned" && (na.flow_stages ?? []).includes("ba_question") }));
      if (r.question && s0 !== "planned") { await record("question", r.question); await say(L.stageStaff(na, s0), `QUESTION\n${r.question}`); await advance(s0, "ba_question"); break; }
      plan = r.plan || r.summary || ""; if (!plan) { throw new Error("the model returned an empty plan"); }
      await record("plan", plan); await say(L.stageStaff(na, s0), `PLAN\n${plan}`); L.savePlan(st, issue, { plan });
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
        await learnHabits(issue, readKey, L.stageStaff(na, "done"));
        log(`lean: ${issue} done (script); state ${L.clearState(st, issue) ? "cleared" : "none"}`);
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
      const files = filesOf(repo), hints = L.fileHints(files, `${iss.summary} ${iss.description} ${plan ?? ""}`);
      const listed = files.length <= 40 ? files : hints;
      const r = await leanModel("tech", issue, s0, L.techPlanPrompt(iss, { habits, plan, feedback: fb, files: listed, snippets: L.fileSnippets(repo, hints.slice(0, 5)), devRoles }));
      if (r.question && !r.tech_plan) { await record("question", r.question); await say(who, `QUESTION\n${r.question}`); return; }
      const techPlan = r.tech_plan || r.summary || ""; if (!techPlan) { throw new Error("the model returned an empty tech plan"); }
      const dev = L.pickDeveloper(devRoles, r.developer, na.assigned_role, `${iss.summary} ${iss.description} ${techPlan}`);
      if (dev !== "tech-lead" && dev !== na.assigned_role) await mcp("assign", { company, task: issue, role: dev }).catch((e) => log(`assign ${dev} failed:`, e.message));
      L.savePlan(st, issue, { tech_plan: techPlan, developer: dev, qc_baseline: null });
      await record("tech_plan", techPlan);
      await say(who, `TECH PLAN\n${techPlan}\nDeveloper: ${L.staffName(dev)} (${dev})`);
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
        const r1 = await leanModel("code", issue, stage, L.codePrompt(iss, { habits, plan: (plan ?? "") + multi, techPlan: o.techPlan, approval, feedback: o.feedback, hints: L.fileHints(files, `${iss.summary} ${iss.description} ${plan ?? ""}`), qc: !!o.selfCheck?.[rp], preexisting: L.preexistingFails(L.loadPlan(st, issue).qc_baseline?.[rp] ?? o.baselines?.[rp]), review: !!o.review, branch }));
        if (r1.question && !r1.summary) { await record("question", r1.question); await say(o.who, `QUESTION (${rname(rp)})\n${r1.question}`); repo = runRepos[0]; return null; }
        const sha = L.commitAll(rp, `${issue}: ${r1.commit_message || iss.summary || "agent change"}`);
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
      const r = await codeOnce(s0, { techPlan: sv.tech_plan, feedback: review ? na.review_feedback : fb, review, baselines, selfCheck, who, host: L.prSteps(na, seg).open || L.prSteps(na, seg).merge });
      if (!r) return;
      L.savePlan(st, issue, { tech_plan: sv.tech_plan ?? r.tech_plan, summary: r.summary, tests: r.tests, commit: r.commit, branch, repos: runRepos, developer: dev, qc_baseline: baselines, where: r.where });
      await say(who, [review ? "CODE (review feedback)" : "CODE", !sv.tech_plan && r.tech_plan && `Tech plan:\n${r.tech_plan}`, `Summary: ${r.summary ?? ""}`, r.tests && `Checks: ${r.tests}`, r.where].filter(Boolean).join("\n"));
      const art = (k) => ({ tech_plan: r.tech_plan, pr: `${r.summary}\n${r.where}`, qc_pass: r.tests || r.summary, note: `${r.summary}\n${r.tests ?? ""}\n${r.where}` }[k] ?? r.summary);
      const to = seg.moves[0];
      if (to) { const need = L.neededArtifact(s0, to); if (need) await record(need, art(need)); if (!(await advance(s0, to, art))) return; }
      continue;
    }
    if (seg.kind === "qc") { // QC by script: the repo's checks vs the baseline; one cheap fix round through Coding on a new failure
      const who = L.stageStaff(na, s0, { kind: "qc" });
      const codingKey = (na.flow_stages ?? []).includes("coding") ? "coding" : null;
      const runQc = () => { const sv = L.loadPlan(st, issue); return runRepos.map((rp) => ({ rp, v: L.qcVerdict(sv.qc_baseline?.[rp] ?? null, L.runChecks(rp, L.detectChecks(rp))) })); };
      const qcText = (res) => res.map((x) => `${runRepos.length > 1 ? rname(x.rp) + ": " : ""}${x.v.text}`).join("\n");
      for (const rp of runRepos) L.ensureBranch(rp, branch);
      let res = runQc(), fixes = 0;
      while (res.some((x) => !x.v.pass) && fixes < 1 && codingKey) {
        const txt = qcText(res); await record("qc_fail", txt); await say(who, `QC FAIL\n${txt}\nBack to Coding for one fix.`);
        if (!(await advance(s0, codingKey))) return;
        const sv = L.loadPlan(st, issue), dev = sv.developer ?? "tech-lead", dwho = L.stageStaff(na, codingKey, { kind: "code", developer: dev });
        const r = await codeOnce(codingKey, { techPlan: sv.tech_plan, feedback: `QC failed, fix it:\n${res.filter((x) => !x.v.pass).map((x) => x.v.failed.map((f) => `${f.name}: ${f.out}`).join("\n")).join("\n")}`, who: dwho });
        if (!r) return;
        L.savePlan(st, issue, { summary: `${sv.summary ?? ""}\nFix: ${r.summary ?? ""}`, commit: r.commit, where: r.where });
        await say(dwho, `FIX\n${r.summary ?? ""}\n${r.where}`);
        if (!(await advance(codingKey, s0))) return;
        fixes++; res = runQc();
      }
      const sv = L.loadPlan(st, issue);
      if (res.some((x) => !x.v.pass)) { const txt = qcText(res); await record("qc_fail", txt); await say(who, `QC FAIL\n${txt}\nStopping: needs a look from you.`); log(`lean: ${issue} QC failed after ${fixes} fix(es); stopped`); return; }
      const txt = [qcText(res), res.every((x) => !x.v.passed.length) && sv.tests && `Developer check: ${sv.tests}`].filter(Boolean).join("\n");
      const steps = L.prSteps(na, seg), h = steps.open || steps.merge ? host(sv) : { msg: [] };
      const where = [sv.where, ...h.msg].filter(Boolean).join("\n");
      await say(who, `QC PASS\n${txt}${where ? `\n${where}` : ""}`);
      if (h.msg.some((m) => /NOT done|failed/.test(m))) return;
      const art = (k) => ({ pr: `${sv.summary ?? ""}\n${where}`, qc_pass: txt, note: `${txt}\n${where}` }[k] ?? txt);
      const to = seg.moves[0];
      if (to) { const need = L.neededArtifact(s0, to); if (need) await record(need, art(need)); else await record("qc_pass", txt); if (!(await advance(s0, to, art))) return; }
      else await record("qc_pass", txt);
      continue;
    }
  }
  await jiraOps(issue);
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
  if (jira) await jira.comment(issue, L.learnedComment(staff, added)).catch((e) => log("Jira comment failed:", e.message));
}

// Deterministic Jira card moves (no AI): transition by target STATUS NAME, fallback stage comment. Dry: print only.
async function jiraOps(issue) {
  if (!listenerJira) return;
  let ops = []; try { ops = (await mcp("jira_ops", { company, issue })).ops; } catch (e) { return log("jira_ops failed:", e.message); }
  for (const o of ops) {
    if (dryJira) { log(`JIRA (dry): ${o.notice ? `comment ${o.issue} "${o.notice}"; ` : ""}transition ${o.issue} -> ${o.to_names.join(" | ")} (else comment "${o.fallback_comment}")`); continue; }
    if (!jiraCfg) { log(`JIRA: no ~/.config/agents-holding/jira.json; cannot move ${o.issue}`); continue; }
    try {
      const tok = L.jiraToken(jiraCfg); if (!tok) throw new Error(`no token in Keychain service ${jiraCfg.keychain_service}`);
      const api = (m, path, body) => fetch(`${jiraCfg.site.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(o.issue)}${path}`, { method: m,
        headers: { Authorization: "Basic " + Buffer.from(`${jiraCfg.email}:${tok}`).toString("base64"), "Content-Type": "application/json", Accept: "application/json" }, body: body && JSON.stringify(body) });
      const adf = (t) => ({ body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } });
      const cur = (await (await api("GET", "?fields=status")).json())?.fields?.status?.name ?? "";
      if (o.to_names.some((n) => n.toLowerCase() === cur.toLowerCase())) { log(`JIRA: ${o.issue} already in ${cur}`); continue; }
      if (o.notice) await api("POST", "/comment", adf(o.notice));
      const tr = (await (await api("GET", "/transitions")).json()).transitions ?? [];
      const hit = o.to_names.map((n) => tr.find((t) => t.to?.name?.toLowerCase() === n.toLowerCase())).find(Boolean);
      if (hit) { const r = await api("POST", "/transitions", { transition: { id: hit.id } }); log(`JIRA: moved ${o.issue} -> ${hit.to.name} (${r.status})`); }
      else { await api("POST", "/comment", adf(o.fallback_comment)); log(`JIRA: no transition to ${o.to_names.join("|")} for ${o.issue}; commented stage. Manual move needed.`); }
    } catch (e) { log(`JIRA op failed for ${o.issue}:`, e.message); }
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
const sockets = {}, lastRx = {}, downNotified = {}, staleMs = Number(process.env.AH_STALE_SEC ?? 120) * 1000;
setInterval(() => {
  for (const c of companyList) {
    if (!L.socketStale(lastRx[c], Date.now(), staleMs)) continue;
    log(`watchdog: ${c} realtime silent > ${staleMs / 1000}s; reconnecting`);
    if (!downNotified[c]) { downNotified[c] = true; L.desktopNotify(homedir(), "agents-holding", `Listener lost the server connection (${c}); reconnecting`); }
    lastRx[c] = Date.now(); try { sockets[c]?.close(); } catch {}
  }
}, 30000).unref?.();
const backoffs = {};
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
    if (msg.event === "phx_reply" && msg.topic === topic) { log("join", msg.payload.status, "company", company); if (msg.payload.status === "ok") { backoffs[company] = 1000; heartbeat(); rt("joined"); if (downNotified[company]) { downNotified[company] = false; L.desktopNotify(homedir(), "agents-holding", `Listener reconnected (${company})`); } } else rt(`join ${msg.payload.status}`); }
    if (msg.event === "broadcast" && msg.payload?.event === "next_action") {
      const p = { ...(msg.payload.payload ?? {}), company };
      L.writeStatus(homedir(), { companies: { [company]: { last_event_at: new Date().toISOString(), last_event: `${p.event} ${p.issue ?? ""}`.trim() } } });
      log("next_action", company, p.event, p.issue ?? p.task_id ?? "", "stage", p.stage, p.waiting ? "(waiting on user)" : "");
      if (p.waiting) return; // user gate
      if (DEBOUNCED.has(p.event)) return debounce(p); // a drag + comment arrive as 2 webhooks: one run, after both landed
      // agent_move: the agent's own advance. If a run for that issue is still active it is queued and handled
      // after exit (the run may stop right after advancing, e.g. pre_coding -> coding, leaving the new stage undone).
      wake(p);
      return;
    }
  };
  ws.onclose = () => { clearInterval(hb); if (sockets[company] === ws) delete sockets[company]; rt("disconnected"); const b = backoffs[company]; log("socket closed", company, "; reconnect in", b, "ms"); setTimeout(() => connect(company).catch(fail(company)), b); backoffs[company] = Math.min(b * 2, 60000); };
  ws.onerror = () => {};
}
const fail = (company) => (e) => { const b = backoffs[company] ?? 1000; log("error", company, e.message); setTimeout(() => connect(company).catch(fail(company)), b); backoffs[company] = Math.min(b * 2, 60000); };
// Manual one-shot replay of a missed/killed run: holding listen --run KAN-1 --event user_comment --stage todo
if (opt("--run")) { log("manual run", opt("--run")); wake({ company: opt("--company", company), issue: opt("--run"), event: opt("--event", "manual"), stage: opt("--stage", "?") }); }
else {
log("holding listen:", registry.projects.length, "project(s),", companyList.length, "company subscription(s)", lean ? "LEAN" : "legacy", dryJira ? "DRY-JIRA" : listenerJira ? "jira-by-listener" : "jira-by-agent", "mcp", mcpServers().join(","), "timeout", runTimeoutMs / 60000, "min");
for (const c of companyList) connect(c).catch(fail(c));
}
