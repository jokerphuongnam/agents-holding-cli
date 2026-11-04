#!/usr/bin/env node
// holding listen: wake the LOCAL agent when the server broadcasts a next_action for this repo's company.
// Usage: holding listen [--repo DIR] [--once] [--dry-jira] | [--run ISSUE --event E --stage S [--dry-jira]]   (license: $AGENTS_HOLDING_KEY or ~/.config/agents-holding/license.txt|test-license.txt)
// One agent run at a time; events arriving during a run are coalesced into one follow-up run. Logs: ~/Library/Logs/agents-holding/.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import * as L from "./lean.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const repo = resolve(opt("--repo", process.cwd()));
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
  if (process.env.AGENTS_HOLDING_KEY) return process.env.AGENTS_HOLDING_KEY.trim();
  for (const f of ["license.txt", "test-license.txt"]) { const p = join(homedir(), ".config/agents-holding", f); if (existsSync(p)) return readFileSync(p, "utf8").trim(); }
  throw new Error("no license: set AGENTS_HOLDING_KEY or ~/.config/agents-holding/license.txt");
}
const key = license();
const company = JSON.parse(readFileSync(join(repo, ".agents/company.json"), "utf8")).company;

async function mcp(name, a) {
  const r = await fetch(`${base}/functions/v1/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }) });
  const j = await r.json(); const t = j.result?.content?.[0]?.text;
  if (!t || j.result.isError) throw new Error(`${name} failed: ${t ?? JSON.stringify(j.error)}`);
  return JSON.parse(t);
}

// ---- server-side last-seen heartbeat (for /listener and /doctor); best effort ----
const autostartPlist = join(homedir(), "Library/LaunchAgents/com.agentsholding.listener.plist");
const heartbeat = () => mcp("listener_heartbeat", { company, host: hostname(), pid: process.pid, autostart: existsSync(autostartPlist), version: "1" })
  .catch((e) => log("heartbeat failed:", e.message));
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
const sessFile = join(homedir(), ".config/agents-holding", `sessions-${company}.json`);
const sessions = (() => { try { return JSON.parse(readFileSync(sessFile, "utf8")); } catch { return {}; } })();
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

let running = false, runningIssue = null;
const pending = new Map(); // issue -> latest notice
function wake(p) {
  const k = p.issue ?? p.task_id ?? "?";
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

async function run(p, depth = 0) {
  const issue = p.issue ?? p.task_id ?? "";
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
    const env = o.home ? { ...process.env, GROK_HOME: o.home } : { ...process.env, AGENTS_HOLDING_KEY: key };
    if (o.home) delete env.AGENTS_HOLDING_KEY; // lean runs need no server access
    const ch = spawn("nice", ["-n", "10", grokBin, ...gargs], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
    ch.stdout.on("data", (d) => { appendFileSync(out, d); if (o.collect) o.collect.push(d); }); ch.stderr.on("data", (d) => appendFileSync(out, d));
    const t0 = Date.now(); let warned = "";
    const events = join(sessDir(sid, o.home), "events.jsonl");
    const watch = setInterval(() => {
      let lines = []; let mtime = t0;
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
  const text = kind === "text";
  const model = text ? (process.env.AH_TEXT_MODEL ?? "grok-4.7-build-fast") : (process.env.AH_MODEL || null);
  const gargs = L.leanGrokArgs({ sid, model, text, prompt, schema: text ? L.TEXT_SCHEMA : L.CODE_SCHEMA, system: text ? L.TEXT_SYSTEM : null });
  log(`lean ${kind} call for ${issue} ${stage} session ${sid} ${model ?? "default model"} prompt ${prompt.length} chars -> ${out}`);
  const t0 = Date.now(); const code = await spawnGrok(gargs, out, issue, sid, { home: leanHome, collect: buf }); const wall = Date.now() - t0;
  const u = usageOf(sid, leanHome);
  if (u) {
    log(`TOKENS ${issue} ${stage}: input ${u.inputTokens} output ${u.outputTokens} cached ${u.cachedReadTokens} reasoning ${u.reasoningTokens ?? 0} calls ${u.modelCalls} model ${u.primaryModelId} wall ${Math.round(wall / 1000)}s session ${sid} (lean ${kind})`);
    mcp("report_usage", { company, issue, stage, session_id: sid, model: u.primaryModelId, input_tokens: u.inputTokens, output_tokens: u.outputTokens, cached_tokens: u.cachedReadTokens,
      reasoning_tokens: u.reasoningTokens ?? 0, model_calls: u.modelCalls, wall_ms: wall, dry: dryJira }).catch((e) => log("report_usage failed:", e.message));
  }
  const r = L.parseResult(Buffer.concat(buf).toString("utf8"));
  if (code !== 0) log(`lean ${kind} call exited ${code} for ${issue}`);
  return r;
}
async function leanRun(p, na, depth = 0) {
  const issue = na.issue ?? p.issue ?? p.task_id; const st = L.stateDir(homedir(), company); const saved = L.loadPlan(st, issue);
  let iss = { key: issue, summary: na.title ?? "", description: String(na.request ?? "").slice(0, 1500), comments: [] };
  const readKey = opt("--jira-read-as") || process.env.AH_JIRA_READ_AS || issue; // dry replays may read the real issue (GET only)
  if (jira) { try { iss = { key: issue, ...L.compactIssue(await jira.issue(readKey)) }; } catch (e) { log(`lean: Jira read ${readKey} failed (${e.message}); using server title/request`); } }
  const fb = L.feedbackOf(na);
  const say = async (t) => {
    if (dryJira && !jira) return log(`JIRA (dry): comment ${issue} "${t.slice(0, 160).replace(/\n/g, " ")}"`);
    if (jira) await jira.comment(issue, t).catch((e) => log("Jira comment failed:", e.message));
  };
  if (na.waiting) return log(`lean: ${issue} waiting (${na.stage})`);
  const record = (kind, body) => mcp("record_artifact", { company, task: issue, kind, body: body || kind, role: "agent" }).catch((e) => log(`record ${kind} failed:`, e.message));
  const advance = async (from, to, art) => {
    for (let i = 0; i < 2; i++) {
      try { const r = await mcp("advance", { company, task: issue, to_stage: to, listener_jira: true }); log(`lean: ${issue} ${from} -> ${r.stage}`); return true; }
      catch (e) { const m = e.message.match(/kind=(\w+)/); if (i || !m) { log(`lean: advance ${from} -> ${to} failed: ${e.message}`); return false; } await record(m[1], art?.(m[1])); }
    }
  };
  log(`lean run ${issue} (${p.event}) segments ${L.segments(na).map((s) => `${s.kind}:${s.stages.join(">")}`).join(" | ") || "none"}`);
  let plan = saved.plan ?? null;
  for (const seg of L.segments(na)) {
    const s0 = seg.stages[0];
    if (seg.kind === "move") { if (!(await advance(s0, seg.moves[0]))) return; continue; }
    if (seg.kind === "text") {
      const r = await leanModel("text", issue, s0, L.textPrompt(iss, { prevPlan: s0 === "planned" ? plan : null, feedback: fb, allowQuestion: s0 !== "planned" && (na.flow_stages ?? []).includes("ba_question") }));
      if (r.question && s0 !== "planned") { await record("question", r.question); await say(`${L.AGENT_MARK} QUESTION\n${r.question}`); await advance(s0, "ba_question"); break; }
      plan = r.plan || r.summary || ""; if (!plan) { log(`lean: empty plan for ${issue}; stopping`); return; }
      await record("plan", plan); await say(`${L.AGENT_MARK} PLAN\n${plan}`); L.savePlan(st, issue, { plan });
      if (seg.moves[0] && !(await advance(s0, seg.moves[0]))) return;
      continue;
    }
    const branch = `feature/${issue}`;
    const host = (r) => { const steps = L.prSteps(na, seg);
      const h = L.gitHost(repo, { ...steps, autoPr: !!na.auto_pr && !dryJira, branch, title: `${issue}: ${iss.summary}`.slice(0, 120), body: `${r?.summary ?? ""}

Jira: ${issue}` });
      if (steps.open || steps.merge) log(`lean git host (${na.auto_pr ? "auto_pr ON" : "auto_pr OFF"}${dryJira ? ", dry: no push" : ""}): ${h.msg.join("; ")}`); return h; };
    if (seg.kind === "script") { // done / todo / review / merge / PR / comment-only stages: no model call
      const steps = L.prSteps(na, seg), saved2 = L.loadPlan(st, issue);
      if (s0 === "done") { // template comment + local state cleanup; merge only if the flow says so (per auto_pr rules)
        const h = steps.merge ? host(saved2) : { msg: [] };
        await say([L.doneComment(issue, saved2), ...h.msg].join("\n"));
        log(`lean: ${issue} done (script, no model); state ${L.clearState(st, issue) ? "cleared" : "none"}`);
        continue;
      }
      if (!steps.open && !steps.merge && !(na.on_enter?.[s0] ?? []).some((a) => a.action === "comment") && !seg.moves[0]) { log(`lean: ${issue} ${s0}: nothing to do (script)`); continue; }
      const h = (steps.open || steps.merge) ? host(saved2) : { msg: [] }; const note = h.msg.join("\n") || "moved on";
      await say(`${L.AGENT_MARK} ${seg.stages.join(">")}\n${note}`);
      if (h.msg.some((m) => /NOT done|failed/.test(m))) return; // never force: stop for the user
      for (let i = 0; i < seg.stages.length; i++) { const to = seg.moves[i]; if (!to) break; await record("note", note); if (!(await advance(seg.stages[i], to))) return; }
      continue;
    }
    // code segment: one coding call covers pre_coding .. in_review log(`lean: branch ${branch}: ${L.ensureBranch(repo, branch)}`);
    let files = []; try { files = L.git(repo, "ls-files").split("\n").filter(Boolean); } catch {}
    const approval = seg.stages.includes("pre_coding") || p.event === "user_approved" ? "Plan approved; go ahead." : null;
    const r = await leanModel("code", issue, seg.stages.join(">"), L.codePrompt(iss, { plan, approval, feedback: fb, hints: L.fileHints(files, `${iss.summary} ${iss.description} ${plan ?? ""}`), qc: seg.stages.includes("qc") }));
    if (r.question && !r.tech_plan) { await record("question", r.question); await say(`${L.AGENT_MARK} QUESTION\n${r.question}`); return; }
    const sha = L.commitAll(repo, `${issue}: ${r.commit_message || iss.summary || "agent change"}`);
    const h = host(r);
    const where = `Branch ${branch}${sha ? ` @ ${sha}` : " (no changes)"}${h.url ? ` PR ${h.url}${h.merged ? " (merged)" : ""}` : " (local, not pushed)"}${h.msg.length && !h.url ? ` - ${h.msg.join("; ")}` : ""}`;
    L.savePlan(st, issue, { tech_plan: r.tech_plan, summary: r.summary, tests: r.tests, commit: sha, branch });
    const art = (k) => ({ tech_plan: r.tech_plan, pr: `${r.summary}\n${where}`, qc_pass: r.tests || r.summary, note: `${r.summary}\n${r.tests ?? ""}\n${where}` }[k] ?? r.summary);
    await say([`${L.AGENT_MARK} DONE`, r.tech_plan && `Tech plan:\n${r.tech_plan}`, `Summary: ${r.summary ?? ""}`, r.tests && `Checks: ${r.tests}`, where].filter(Boolean).join("\n"));
    for (let i = 0; i < seg.stages.length; i++) {
      const from = seg.stages[i], to = seg.moves[i]; if (!to) break;
      const need = L.neededArtifact(from, to); if (need) await record(need, art(need));
      if (!(await advance(from, to, art))) return;
    }
  }
  await jiraOps(issue);
  let na2 = null; try { na2 = await mcp("next_action", { company, task: issue, listener_jira: true }); } catch {}
  if (na2 && !na2.waiting && na2.stage !== na.stage && depth < 2) { log(`lean post-run: ${issue} now ${na2.stage}, not waiting; continuing`); return leanRun({ ...p, event: "chain" }, na2, depth + 1); }
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
let ref = 0, backoff = 1000;
async function connect() {
  const sub = await mcp("realtime_subscription", { company });
  const ws = new WebSocket(`${sub.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${sub.publishable_key}&vsn=1.0.0`);
  const topic = `realtime:${sub.topic}`;
  const send = (t, event, payload) => ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) }));
  let hb;
  ws.onopen = () => {
    send(topic, "phx_join", { config: { broadcast: { self: false, ack: false }, presence: { key: "" }, postgres_changes: [], private: true }, access_token: sub.publishable_key });
    hb = setInterval(() => send("phoenix", "heartbeat", {}), 25000);
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.event === "phx_reply" && msg.topic === topic) { log("join", msg.payload.status, "company", company); if (msg.payload.status === "ok") { backoff = 1000; heartbeat(); } }
    if (msg.event === "broadcast" && msg.payload?.event === "next_action") {
      const p = msg.payload.payload ?? {};
      log("next_action", p.event, p.issue ?? p.task_id ?? "", "stage", p.stage, p.waiting ? "(waiting on user)" : "");
      if (p.waiting) return; // user gate
      // agent_move: the agent's own advance. If a run for that issue is still active it is queued and handled
      // after exit (the run may stop right after advancing, e.g. pre_coding -> coding, leaving the new stage undone).
      wake(p);
      return;
    }
  };
  ws.onclose = () => { clearInterval(hb); log("socket closed; reconnect in", backoff, "ms"); setTimeout(() => connect().catch(fail), backoff); backoff = Math.min(backoff * 2, 60000); };
  ws.onerror = () => {};
}
const fail = (e) => { log("error", e.message); setTimeout(() => connect().catch(fail), backoff); backoff = Math.min(backoff * 2, 60000); };
// Manual one-shot replay of a missed/killed run: holding listen --run PROJ-1 --event user_comment --stage todo
if (opt("--run")) { log("manual run", opt("--run")); wake({ issue: opt("--run"), event: opt("--event", "manual"), stage: opt("--stage", "?") }); }
else {
log("holding listen: repo", repo, lean ? "LEAN" : "legacy", dryJira ? "DRY-JIRA" : listenerJira ? "jira-by-listener" : "jira-by-agent", "mcp", mcpServers().join(","), "timeout", runTimeoutMs / 60000, "min");
connect().catch(fail);
}
