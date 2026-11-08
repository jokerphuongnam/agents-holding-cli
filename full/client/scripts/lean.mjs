import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// Lean runner for holding-listen (token saving, default; AH_LEAN=0 = legacy agent-driven runs).
// Scripts do everything deterministic: read the Jira issue (REST), record artifacts, advance stages, Jira comments,
// transitions (via jiraOps), branch + commit. The model is called only for the text it must write:
//   * text stages (product_work / ba_question / plan revision): ONE tool-less call, cheap model, JSON {plan|question}
//   * Pre Coding (tech_plan): ONE tool-less call, cheap model: tech plan + the developer role picked from the server roster. NO code.
//   * Coding (code): the script moves the card to Coding FIRST, then ONE coding call (default model) implements the saved tech plan.
//   * QC (qc_test): the script moves the card to QC, then runs the repo's own checks (npm test/lint/typecheck/build, pytest, go, cargo)
//     before vs after; only newly failing checks fail QC (one cheap fix call, then QC again). No model call when checks pass.
//   Each stage is its own step; the Jira card is moved right after each advance, so the board shows what is actually happening.
//   Every comment: "[agent-holding] [<staff name>] ..." (staff from the server's stage owners / roster).
// Every model call is a FRESH session (no resume) with no MCP servers (lean GROK_HOME / CODEX_HOME, claude --strict-mcp-config);
// the CLI is grok (default), claude or codex, see agents.mjs (AH_AGENT or per-company agent.json),
// with a short saved plan (state dir) + the user's approval/feedback instead of the old conversation.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const AGENT_MARK = "[agent-holding]";
export const AGENT_MARKS = [AGENT_MARK, "[agents-holding]"]; // legacy prefix still recognized as an agent comment
export const isAgentText = (t) => { const x = String(t ?? "").trimStart().replace(/^[*_+{}\[\]]*?(?=\[agent)/, "").replace(/^[*_]+/, ""); return AGENT_MARKS.some((m) => x.startsWith(m)); }; // also wiki markup "*[agent-holding] [BA]*"
const STAFF_NAMES = { ceo: "CEO", cto: "CTO", "tech-lead": "Tech Lead", "ba-lead": "BA", "ba-user": "BA", "po-lead": "PO", "po-new": "PO", "po-modify": "PO",
  "pm-lead": "PM", "design-lead": "Design Lead", "ui-designer": "UI Designer", "ux-writer": "UX Writer", "qc-lead": "QC", "user-qc": "QC", git: "Git", "code-graph": "Code Graph" };
/** Role id -> display name (mirrors the server's staffName). */
export const staffName = (role) => !role ? "Agent" : STAFF_NAMES[role] ?? String(role).split(/[-_]/).filter(Boolean).map((w) => /^(fe|be|qa|qc|ui|ux|ios|api|ai|ml|db|sre)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(" ");
/** "[agent-holding] [<staff name>]" */
export const staffTag = (name) => `${AGENT_MARK} [${name || "Agent"}]`;
// Stage owners: the server's STAGE_OWNERS (workflow.ts) is the single source; next_action returns it as stage_owners and the
// listener caches it (~/.config/agents-holding/stage-owners.json) so a run without it (dry/replay) resolves the same way.
const ownersFile = (home) => join(home, ".config/agents-holding/stage-owners.json");
export function cacheStageOwners(home, table) { if (!table || typeof table !== "object") return false;
  try { mkdirSync(join(home, ".config/agents-holding"), { recursive: true }); writeFileSync(ownersFile(home), JSON.stringify(table), { mode: 0o600 }); return true; } catch { return false; } }
export function cachedStageOwners(home = process.env.HOME ?? "") { try { return JSON.parse(readFileSync(ownersFile(home), "utf8")); } catch { return null; } }
/** Same resolution as the server's resolveOwner: first candidate on the roster ("@engineer" = assigned role), last = fallback. */
export function resolveOwner(table, stage, engineer, roster = []) {
  const list = table?.[stage] ?? table?.["*"] ?? ["@engineer", "tech-lead"];
  const has = (r) => !roster.length || roster.includes(r);
  for (let i = 0; i < list.length; i++) { const c = list[i], last = i === list.length - 1;
    if (c === "@engineer") { if (engineer) return engineer; continue; } if (last || has(c)) return c; }
  return engineer ?? "tech-lead";
}
export function ownerFor(stage, engineer, roster = [], table = cachedStageOwners()) { return resolveOwner(table, stage, engineer, roster); }
/** Role id acting in a stage (server staff map first). */
export function stageRole(na, stage, { kind, developer } = {}) {
  const t = na?.stage_owners ?? cachedStageOwners();
  if (kind === "code") return developer || "tech-lead";
  if (kind === "qc" && stage !== "qc") return ownerFor("qc", null, na?.roster ?? [], t);
  if (kind === "techplan" && stage !== "pre_coding") return ownerFor("pre_coding", null, na?.roster ?? [], t);
  return na?.staff?.[stage]?.role ?? ownerFor(stage, na?.assigned_role ?? null, na?.roster ?? [], t);
}
/** Staff display name for a stage: server staff map, else mirror. kind "code" = the picked developer, "qc" = QC. */
export function stageStaff(na, stage, o = {}) {
  if (!o.kind || (o.kind !== "code" && !(o.kind === "qc" && stage !== "qc") && !(o.kind === "techplan" && stage !== "pre_coding"))) { const n = na?.staff?.[stage]?.name; if (n) return n; }
  return staffName(stageRole(na, stage, o));
}
/** Why this staff acts (shown in the Started comment). */
export function staffWhy(na, stage, { kind, developer, pickedBy } = {}) {
  if (kind === "code") return developer && developer === na?.assigned_role && na?.route?.why ? `routed: ${na.route.why}` : pickedBy ?? (developer && developer !== "tech-lead" ? "picked by the Tech Lead in the tech plan" : "no developer picked: the Tech Lead codes it");
  return na?.staff?.[stage]?.why ?? `owner of the ${stageTitle(stage)} stage`;
}
export const TEXT_STAGES = new Set(["product_work", "ba_question", "planned"]);
export const SCRIPT_ACTIONS = new Set(["open_pr", "merge", "create_branch", "comment"]); // flow stages done by script, no model
/** Baseline check names that already failed before any change (the coder is told to ignore them). */
export const preexistingFails = (baseline) => (baseline ?? []).filter((x) => !x.ok).map((x) => x.name);
/** Developer self-check only when the repo has NO script checks at all (a failing baseline is not a reason to loop on it). */
export const needsSelfCheck = (baseline) => !(baseline ?? []).length;
/** The developer who coded the task: saved state, else the server's assigned dev role, else the tech plan's "Developer:" line, else tech-lead. */
export function codingDeveloper(saved = {}, assigned = null, devRoles = []) {
  if (saved.developer) return saved.developer;
  const ids = devRoles.map((r) => r.role);
  if (assigned && (!ids.length || ids.includes(assigned))) return assigned;
  const m = String(saved.tech_plan ?? "").match(/Developer:.*\(([\w-]+)\)/); if (m) return m[1];
  return "tech-lead";
}
export const reviewBackComment = (dev) => `${staffTag(staffName(dev))} ${T("review")}`;
export const ENTER_ONLY = new Set(["planned", "in_review", "done"]);
// grok --tools names: "Bash" = run_terminal_command ("run_terminal_command" itself is NOT accepted and silently loads ALL ~22 tools, ~9k tokens/turn)
/** Coding call turn cap (model calls); AH_CODE_MAX_TURNS overrides. Stops runaway loops (KAN-6: 60 calls, 2.26M input tokens). */
export const codeMaxTurns = (env = process.env) => Math.max(5, Number(env.AH_CODE_MAX_TURNS) || 25);
export const CODE_TOOLS = "Bash,read_file,search_replace,write,grep,list_dir";
export const TECH_TOOLS = "read_file,grep,list_dir"; // Pre Coding: read-only, a few turns max, cheap model
export const TEXT_SCHEMA = { type: "object", properties: { plan: { type: "string" }, question: { type: "string" } } };
export const CODE_SCHEMA = { type: "object", properties: { tech_plan: { type: "string" }, summary: { type: "string" }, why: { type: "string" }, how: { type: "string" }, tests: { type: "string" }, commit_message: { type: "string" }, question: { type: "string" } }, required: ["summary", "why", "how"] };
export const TECH_SCHEMA = { type: "object", properties: { tech_plan: { type: "string" }, developer: { type: "string" }, question: { type: "string" } } };

// ---------- pure helpers (unit-tested in tests/lean_test.mjs) ----------
export function adfText(n) {
  if (!n) return ""; if (typeof n === "string") return n;
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(adfText).join(n.type === "doc" || n.type === "bulletList" || n.type === "orderedList" ? "\n" : "");
  return ["paragraph", "heading", "listItem"].includes(n.type) ? inner + "\n" : n.type === "hardBreak" ? "\n" : inner;
}
const clip = (s, n) => { s = String(s ?? "").replace(/\n{3,}/g, "\n\n").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
/** Compact issue: summary, description, user comments (agent comments dropped, newest kept). */
export function compactIssue(j, max = { desc: 1500, comments: 4, comment: 400 }) {
  const f = j?.fields ?? {};
  const comments = (f.comment?.comments ?? []).map((c) => ({ who: c.author?.displayName ?? "?", t: clip(adfText(c.body), max.comment) }))
    .filter((c) => c.t && !isAgentText(c.t)).slice(-max.comments);
  return { summary: f.summary ?? "", description: clip(adfText(f.description), max.desc), comments };
}
/** Up to n repo files whose path matches words of the task (cheap file hints; whole list if the repo is tiny). */
export function fileHints(files, text, n = 8) {
  files = files.filter((f) => !/(^|\/)(node_modules|dist|build|\.git)\//.test(f) && !/(lock\.json|\.lock|\.svg|\.png|\.ico)$/.test(f));
  if (files.length <= 15) return files;
  const words = [...new Set(String(text).toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [])];
  const score = (f) => { const p = f.toLowerCase(); return words.reduce((s, w) => s + (p.includes(w) ? 2 : 0), 0) + (/\.(tsx?|jsx?|py|go|rs)$/.test(p) ? 0.5 : 0); };
  return files.map((f) => [score(f), f]).filter(([s]) => s >= 2).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, f]) => f);
}
/** Artifact an agent advance from `from` to `to` needs (mirrors the server's agentMoves). */
export function neededArtifact(from, to, onEnter = false) {
  if (onEnter) return "note";
  if (from === "product_work" || from === "ba_question") return to === "ba_question" ? "question" : "plan";
  if (from === "pre_coding") return "tech_plan";
  if (from === "coding") return to === "in_review" ? "pr" : null;
  if (from === "qc") return to === "in_review" ? "pr" : "qc_pass";
  return null;
}
/** Feedback quoted by the server in next_action steps (planned / coding / in_review / ba_question). */
export function feedbackOf(na) {
  for (const s of na?.steps ?? []) { const m = s.match(/^(?:User feedback on the plan|Address|Review comment|User answered): (.*)$/s); if (m) { try { return JSON.parse(m[1]); } catch { return m[1]; } } }
  return null;
}
const issueBlock = (iss) => [`Task ${iss.key}: ${iss.summary}`, iss.description && `Description:\n${iss.description}`,
  iss.comments?.length && `Comments:\n${iss.comments.map((c) => `- ${c.who}: ${c.t}`).join("\n")}`].filter(Boolean).join("\n");
export function textPrompt(iss, o = {}) {
  return [issueBlock(iss), o.context && `Project: ${o.context}`, o.prevPlan && `Current plan:\n${o.prevPlan}`, o.feedback && `User feedback: ${o.feedback}`,
    o.allowQuestion ? "If something essential is unclear, return {\"question\": \"...\"}. Otherwise return {\"plan\": \"...\"}." : "Return {\"plan\": \"...\"}.",
    "Plan: goal, scope, acceptance criteria, files/steps; max 12 short lines. Reply with the JSON only."].filter(Boolean).join("\n\n");
}
export const TEXT_SYSTEM = "You are a senior BA/tech lead. You write short, concrete task plans. Reply with JSON only.";
export function codePrompt(iss, o = {}) {
  return [issueBlock(iss), o.plan && `Approved plan:\n${o.plan}`, o.techPlan && `Tech plan (follow it; read only the files it names unless something is missing):\n${o.techPlan}`,
    o.approval && `User: ${o.approval}`, o.review && `The user reviewed your change on branch ${o.branch ?? "feature/" + iss.key} (already checked out, your earlier commits are on it) and sent it back to Coding.`,
    o.feedback && `Address this ${o.review ? "review " : ""}feedback: ${o.feedback}`,
    o.preexisting?.length && `Already failing BEFORE your change (QC baseline): ${o.preexisting.join(", ")}. Ignore these: do not run, investigate or fix them; QC only blames new failures.`,
    !o.techPlan && o.hints?.length && `Likely files: ${o.hints.join(", ")}`,
    `${o.review ? "Change only what the feedback asks" : "Implement it in this repo with minimal changes"}${o.qc ? "; then run the cheapest relevant check (build/tests) and fix failures" : "; do not run tests/builds (QC runs them by script)"}.`,
    "Do not run git commit/branch/push and do not touch Jira (scripts do that).",
    "Before handoff, explain WHAT changed, WHY this approach, HOW it works, and FILES/areas touched. Do not claim work that was not done.",
    `Finish with JSON: {${o.techPlan ? "" : "\"tech_plan\": \"files+steps, 3-6 lines\", "}\"summary\": \"WHAT changed and files/areas\", \"why\": \"WHY this approach\", \"how\": \"HOW it works\", ${o.qc ? "\"tests\": \"checks run + result\", " : ""}\"commit_message\": \"one line\"}.`].filter(Boolean).join("\n\n");
}
export const TECH_SYSTEM = "You are the tech lead. You write short technical plans and pick the developer. You never write code. Reply with JSON only.";
/** Pre Coding prompt: tech plan only (no code), with inline file excerpts so one tool-less turn is enough, and the developer roles to pick from. */
export function techPlanPrompt(iss, o = {}) {
  const roles = (o.devRoles ?? []).map((r) => `- ${r.role}${r.skills?.length ? `: ${r.skills.join(", ")}` : ""}`).join("\n");
  return [issueBlock(iss), o.plan && `Approved plan:\n${o.plan}`, o.feedback && `User feedback: ${o.feedback}`, o.context && `Project: ${o.context}`,
    o.files?.length && `Repo files (subset): ${o.files.join(", ")}`,
    o.snippets?.length && `File excerpts:\n${o.snippets.map((x) => `--- ${x.path}\n${x.text}`).join("\n")}`,
    roles ? `Developers on the roster (pick the best fit by role/skills):\n${roles}` : "No developer roles on the roster: the tech lead codes it (developer = \"tech-lead\").",
    "Use the excerpts above; read at most 2 more files only if essential. Write the technical plan only (do NOT write code or edit files): files to change/create, steps, risks, test plan; max 8 short lines.",
    "Return {\"tech_plan\": \"...\", \"developer\": \"<role id>\"}, or {\"question\": \"...\"} if something essential is unclear. JSON only."].filter(Boolean).join("\n\n");
}
/** Developer role for Coding: the model's pick if it is on the roster, else the task's assigned dev role, else best skill/keyword match, else tech-lead. */
export function pickDeveloper(devRoles = [], choice, assigned, text = "") {
  const ids = devRoles.map((r) => r.role);
  if (choice && ids.includes(choice)) return choice;
  if (assigned && ids.includes(assigned)) return assigned;
  const t = String(text).toLowerCase();
  const scored = devRoles.map((r) => [[r.role, ...(r.skills ?? [])].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && t.includes(w)).length, r.role]).sort((a, b) => b[0] - a[0]);
  if (scored[0]?.[0] > 0) return scored[0][1];
  return ids.length === 1 ? ids[0] : "tech-lead";
}
/** Small excerpts of the hinted files (for the tool-less tech plan call). */
export function fileSnippets(repo, files, { max = 1200, total = 6000 } = {}) {
  const out = []; let used = 0;
  for (const f of files) { if (used >= total) break; let t = ""; try { t = readFileSync(join(repo, f), "utf8"); } catch { continue; }
    t = t.length > max ? t.slice(0, max) + "\n…" : t; used += t.length; out.push({ path: f, text: t }); }
  return out;
}

// ---------- QC by script: the repo's own checks, before vs after the change (no model tokens) ----------
/** Check commands a repo offers: package.json scripts test/lint/typecheck/build (npm), pytest, go test, cargo test, make test. */
export function detectChecks(repo, has = (f) => existsSync(join(repo, f)), read = (f) => readFileSync(join(repo, f), "utf8")) {
  const out = [];
  // Company-specific QC is declarative in .agents/company.json. If present,
  // it replaces autodetection; there is no repository-name or script special case.
  try {
    const cfg = JSON.parse(readFileSync(join(repo, ".agents/company.json"), "utf8"));
    const checks = cfg?.flow?.qc?.checks ?? cfg?.qc?.checks;
    if (Array.isArray(checks) && checks.length) return checks.map((x, i) => {
      const command = String(x.command ?? "").trim();
      const parts = command ? command.split(/\s+/) : [];
      return { name: x.id || `qc-check-${i + 1}`, cmd: parts[0], args: [...parts.slice(1), ...(Array.isArray(x.args) ? x.args.map(String) : [])], runner: x.runner ?? "script", company: cfg.company, repo: x.repo, cwd: x.cwd, timeout_ms: Number(x.timeout_sec ?? 300) * 1000, required: x.required !== false, evidence: x.evidence };
    }).filter((x) => x.cmd);
  } catch {}
  if (has("package.json")) {
    let sc = {}; try { sc = JSON.parse(read("package.json")).scripts ?? {}; } catch {}
    for (const n of ["test", "lint", "typecheck", "build"]) if (sc[n] && !/no test specified/.test(sc[n])) out.push({ name: `npm run ${n}`, cmd: "npm", args: ["run", "-s", n] });
  }
  if (has("pytest.ini") || has("pyproject.toml") && /pytest/.test((() => { try { return read("pyproject.toml"); } catch { return ""; } })()) || has("tests") && has("setup.py")) out.push({ name: "pytest", cmd: "python3", args: ["-m", "pytest", "-q"] });
  if (has("go.mod")) out.push({ name: "go test", cmd: "go", args: ["test", "./..."] });
  if (has("Cargo.toml")) out.push({ name: "cargo test", cmd: "cargo", args: ["test", "-q"] });
  if (!out.length && has("Makefile") && /^test:/m.test((() => { try { return read("Makefile"); } catch { return ""; } })())) out.push({ name: "make test", cmd: "make", args: ["test"] });
  return out;
}
export function runChecks(repo, checks, exec = (c, a, opts = {}) => execFileSync(c, a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: opts.timeout_ms ?? 5 * 60 * 1000, env: { ...process.env, CI: "1" } }), log = null) {
  return checks.map((c) => { try { let o;
    log?.(`QC dispatch ${c.name}${c.runner ? ` via ${c.runner}` : ""} in ${repo}`);
    if (["registered_terminal", "terminal_session"].includes(c.runner)) {
      const sessionsFile = join(homedir(), ".config/agents-holding/terminal-sessions/sessions.json");
      const sessions = JSON.parse(readFileSync(sessionsFile, "utf8"));
      const targetRepo = realpathSync(resolve(c.repo || repo));
      const s = Object.values(sessions).filter((x) => x?.status === "connected" && (!c.company || x.company === c.company) && x?.repo === targetRepo && x?.heartbeat_at && Date.now() - new Date(x.heartbeat_at).getTime() < 90000).sort((a, b) => new Date(b.heartbeat_at) - new Date(a.heartbeat_at))[0];
      if (!s) throw new Error(`no connected registered terminal for ${targetRepo}`);
      const script = join(homedir(), ".agents-holding/scripts/terminal.mjs");
      log?.(`QC terminal selected ${s.session_id} (${s.company ?? "unscoped"})`);
      o = execFileSync(process.execPath, [script, "dispatch", s.session_id, [c.cmd, ...(c.args ?? [])].join(" ")], { cwd: c.cwd ? resolve(repo, c.cwd) : repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: c.timeout_ms || 0, env: { ...process.env, CI: "1" } });
    } else o = exec(c.cmd, c.args, c);
    log?.(`QC result ${c.name}: PASS`);
    return { name: c.name, ok: true, out: clip(o, 300) }; }
    catch (e) { const out = clip(`${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`.split("\n").filter(Boolean).slice(-25).join("\n"), 1500); log?.(`QC result ${c.name}: FAIL\n${out}`); return { name: c.name, ok: false, out }; } });
}
/** QC verdict: every required check must pass after coding. A baseline failure is
 * still a QC failure: it is not evidence that the implementation is acceptable. */
export function qcVerdict(baseline, after) {
  const was = Object.fromEntries((baseline ?? []).map((r) => [r.name, r.ok]));
  const failed = after.filter((r) => !r.ok && was[r.name] !== false), preexisting = after.filter((r) => !r.ok && was[r.name] === false);
  const passed = after.filter((r) => r.ok);
  const missing = !after.length ? [{ name: "required QC checks", ok: false, out: "No QC checks ran" }] : [];
  return { pass: !failed.length && !preexisting.length && !missing.length, failed: [...failed, ...missing], preexisting, passed,
    text: [passed.length && `PASS: ${passed.map((r) => r.name).join(", ")}`, failed.length && `FAIL: ${failed.map((r) => `${r.name}\n${r.out}`).join("\n")}`,
      preexisting.length && `FAIL: checks still failing (baseline was already failing): ${preexisting.map((r) => r.name).join(", ")}`, !after.length && "No automated checks ran."].filter(Boolean).join("\n") };
}
/** Agent-stage segments of a run: one per stage [{kind, stages:[s], moves:[to]}] from the current stage + server chain (each stage is its own step). */
// Which stages need the model at all. Only real AI work (analysis/plan text, tech plan/code/QC) calls it;
// moves, gates, review, done, todo, merges, PRs, comments and custom stages without AI actions are script-only.
// Stage kinds: move | text (plan) | techplan (Pre Coding: tech plan + developer pick, no code) | code (Coding) | qc (QC by script) | script.
// Custom stages map by their on_enter actions (code > tech_plan > qc_test > analyze/plan); a stage with no AI action is script-only.
export const CODE_STAGES = new Set(["pre_coding", "coding", "qc"]);
const TEXT_ACTIONS = new Set(["analyze", "plan"]);
export function stageKind(s, acts) {
  if (s === "in_progress") return "move";
  if (TEXT_STAGES.has(s)) return "text";
  if (s === "pre_coding") return "techplan";
  if (s === "coding") return "code";
  if (s === "qc") return "qc";
  if (acts?.some((a) => a.action === "code")) return "code";
  if (acts?.some((a) => a.action === "tech_plan")) return "techplan";
  if (acts?.some((a) => a.action === "qc_test")) return "qc";
  if (acts?.some((a) => TEXT_ACTIONS.has(a.action))) return "text";
  return "script"; // todo, in_review, done, merge/PR/comment-only or action-less custom stages
}
export const doneComment = (issue, st, staff = "CEO") => [`${staffTag(staff)} DONE`, `${issue} is closed.`, st?.branch && `Branch ${st.branch}${st.commit ? ` @ ${st.commit}` : ""}`, st?.pr && `PR ${st.pr}`].filter(Boolean).join("\n");
export function clearState(dir, issue) { try { rmSync(join(dir, `${issue}.json`)); return true; } catch { return false; } }
export function segments(na) {
  const path = [na.stage, ...(na.chain ?? []).map((c) => c.stage)];
  // the chain ends at a gate / review / done: that last stage is only moved into, never worked in this run
  const end = path.length > 1 && ENTER_ONLY.has(path.at(-1)) ? path.length - 1 : path.length;
  const out = [];
  for (let i = 0; i < end; i++) {
    const s = path[i], to = path[i + 1] ?? null;
    const acts = na.on_enter?.[s];
    const kind = stageKind(s, acts);
    if (!to && kind === "move") break;
    out.push({ kind, stages: [s], moves: [to] });
  }
  return out;
}

// ---------- side effects ----------
export function jiraToken(cfg) {
  if (!cfg?.keychain_service) return null;
  try { return execFileSync("security", ["find-generic-password", "-s", cfg.keychain_service, "-a", cfg.email, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; }
  catch { return null; }
}
export function jiraClient(cfg, { dry, log }) {
  const site = (cfg?.jira ?? cfg?.site)?.replace(/\/$/, "");
  const auth = () => { if (typeof cfg?.auth === "function") return cfg.auth(); const t = jiraToken(cfg); return t ? "Basic " + Buffer.from(`${cfg.email}:${t}`).toString("base64") : null; }; // token only in memory, per call
  const req = async (m, path, body) => { const a = auth(); if (!a) throw new Error("no Jira credentials available (holding jira connect)");
    const r = await fetch(`${site}${cfg?.jira ? path : `/rest/api/3${path}`}`, { method: m, headers: { Authorization: a, "Content-Type": "application/json", Accept: "application/json" }, body: body && JSON.stringify(body) });
    if (!r.ok) throw new Error(`Jira ${m} ${path.split("?")[0]} -> ${r.status}`); return r.status === 204 ? null : r.json(); };
  return {
    async issue(key) { return req("GET", `/issue/${encodeURIComponent(key)}?fields=summary,description,comment`); },
    async search(jql, fields = ["status", "updated"]) { const j = await req("POST", "/search/jql", { jql, fields, maxResults: 50 }); return j?.issues ?? []; },
    async meta(key) { const j = await req("GET", `/issue/${encodeURIComponent(key)}?fields=labels,components`); return { labels: j.fields?.labels ?? [], components: (j.fields?.components ?? []).map((c) => c.name) }; },
    async staffLabel(key, role, jiraUser = null) { // replace the previous staff:<role> label (null = remove)
      if (dry) return log(`JIRA (dry): label ${key} staff:${role ?? "(remove)"}`);
      const ops = staffLabelOps((await this.meta(key)).labels, role);
      if (ops.length) await req("PUT", `/issue/${encodeURIComponent(key)}`, { update: { labels: ops } });
      if (role) return await this.assignSelf(key, jiraUser).catch((e) => { log(`Jira assignee ${key} failed: ${e.message}`); return null; }); // same moment as staff:<role>
      return null;
    },
    // Assignee = the connected Jira account the Jira Listener uses (staff are not Jira users; staff:<role> shows which staff).
    // Set when a staff picks the card up; kept on needs-hire / needs-decision / blocked (that account's owner must act), kept at Done.
    async myself() { if (this._me === undefined) this._me = (await req("GET", "/myself"))?.accountId ?? null; return this._me; },
    async userId(u) { // staff jira_user: accountId as is, or an email looked up once
      if (!u) return null; if (!String(u).includes("@")) return String(u); this._users ??= {};
      if (!(u in this._users)) this._users[u] = (await req("GET", `/user/search?query=${encodeURIComponent(u)}`))?.[0]?.accountId ?? null; return this._users[u];
    },
    async assignSelf(key, jiraUser = null) {
      if (dry) { log(`JIRA (dry): assignee ${key} = ${jiraUser ?? "Jira Listener account"}`); return null; }
      const me = (await this.userId(jiraUser).catch(() => null)) ?? await this.myself(); if (!me) return null;
      const j = await req("GET", `/issue/${encodeURIComponent(key)}?fields=assignee`);
      if (j?.fields?.assignee?.accountId !== me) {
        await req("PUT", `/issue/${encodeURIComponent(key)}/assignee`, { accountId: me }); log(`JIRA: assignee ${key} = Jira Listener account`);
      }
      return me; // Jira account id to persist on tasks.assignee_account
    },
    async labels(key, add = [], remove = []) { // generic label add/remove (needs-hire / needs-decision)
      const ops = [...add.map((l) => ({ add: l })), ...remove.map((l) => ({ remove: l }))]; if (!ops.length) return;
      if (dry) return log(`JIRA (dry): labels ${key} ${JSON.stringify(ops)}`);
      await req("PUT", `/issue/${encodeURIComponent(key)}`, { update: { labels: ops } });
    },
    async flag(key) {
      if (dry) return log(`JIRA (dry): flag ${key}`);
      this._flagField ??= (await req("GET", "/field")).find((f) => String(f.name ?? "").toLowerCase() === "flagged");
      const id = this._flagField?.id; if (!id) throw new Error("Jira Flagged field is unavailable");
      const em = await req("GET", `/issue/${encodeURIComponent(key)}/editmeta`);
      const opts = em?.fields?.[id]?.allowedValues ?? [];
      const option = opts.find((x) => /impediment|flag/i.test(String(x.value ?? x.name ?? ""))) ?? opts[0];
      await req("PUT", `/issue/${encodeURIComponent(key)}`, { update: { [id]: [{ set: option?.id ? [{ id: option.id }] : [{ value: "Impediment" }] }] } });
      log(`JIRA: flagged ${key}`);
    },
    async unflag(key) {
      if (dry) return log(`JIRA (dry): unflag ${key}`);
      this._flagField ??= (await req("GET", "/field")).find((f) => String(f.name ?? "").toLowerCase() === "flagged");
      const id = this._flagField?.id; if (id) await req("PUT", `/issue/${encodeURIComponent(key)}`, { update: { [id]: [{ set: [] }] } });
      log(`JIRA: unflagged ${key}`);
    },
    async label(key, op) {
      if (dry) return log(`JIRA (dry): label ${key} ${op} ${WORK_LABEL}`);
      await req("PUT", `/issue/${encodeURIComponent(key)}`, labelBody(op));
    },
    async comment(key, text) {
      if (dry) return log(`JIRA (dry): comment ${key} "${text.slice(0, 160).replace(/\n/g, " ")}${text.length > 160 ? "…" : ""}"`);
      await req("POST", `/issue/${encodeURIComponent(key)}/comment`, { body: toAdf(text) }); log(`JIRA: commented ${key}`);
    },
  };
}
export function git(repo, ...a) { return execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
export function ensureBranch(repo, branch) {
  try { if (git(repo, "rev-parse", "--abbrev-ref", "HEAD") === branch) return "kept";
    try { git(repo, "rev-parse", "--verify", branch); git(repo, "checkout", branch); return "switched"; } catch { git(repo, "checkout", "-b", branch); return "created"; } }
  catch (e) { return "failed: " + e.message.split("\n")[0]; }
}
export function changedPaths(repo) {
  try {
    const raw = execFileSync("git", ["status", "--porcelain=v1", "-z"], { cwd: repo, encoding: "utf8" });
    return raw.split("\0").filter(Boolean).map((x) => x.slice(3)).filter((p) => p && p !== ".agents/company.json");
  } catch { return []; }
}
export function changedSnapshot(repo) {
  const out = {};
  for (const p of changedPaths(repo)) {
    try {
      const diff = execFileSync("git", ["diff", "--binary", "--", p], { cwd: repo, encoding: "buffer" });
      out[p] = createHash("sha256").update(diff).digest("hex");
    } catch { out[p] = "unreadable"; }
  }
  return out;
}
export function commitAll(repo, msg, baseline = []) {
  try {
    const now = changedSnapshot(repo), before = baseline && !Array.isArray(baseline) ? baseline : Object.fromEntries((baseline ?? []).map((p) => [p, null]));
    const paths = Object.keys(now).filter((p) => p !== ".agents/company.json" && (!Object.prototype.hasOwnProperty.call(before, p) || before[p] !== now[p]));
    if (!paths.length) return null;
    git(repo, "add", "--", ...paths);
    if (!git(repo, "diff", "--cached", "--name-only")) return null;
    git(repo, "commit", "-q", "-m", msg); return git(repo, "rev-parse", "--short", "HEAD"); } catch (e) { return "failed: " + e.message.split("\n")[0]; }
}
export const stateDir = (home, company) => { const d = join(home, ".config/agents-holding/state", company); mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };
export const loadPlan = (dir, issue) => { try { return JSON.parse(readFileSync(join(dir, `${issue}.json`), "utf8")); } catch { return {}; } };
export const savePlan = (dir, issue, o) => writeFileSync(join(dir, `${issue}.json`), JSON.stringify({ ...loadPlan(dir, issue), ...o, at: new Date().toISOString() }, null, 1), { mode: 0o600 });

/** Lean GROK_HOME: auth only (symlink), no plugins / MCP servers / vendor skills -> ~5k tokens per call floor instead of ~21k. */
export function leanGrokHome(home) {
  const d = join(home, ".config/agents-holding/grok-home"); mkdirSync(d, { recursive: true, mode: 0o700 });
  const auth = join(d, "auth.json"), real = join(home, ".grok/auth.json");
  try { if (!existsSync(auth) && existsSync(real)) execFileSync("ln", ["-sf", real, auth]); } catch {}
  const cfg = join(d, "config.toml");
  if (!existsSync(cfg)) writeFileSync(cfg, "# agents-holding lean grok home (listener runs)\n[models]\ndefault_reasoning_effort = \"low\"\n[plugins]\nenabled = []\n[compat.cursor]\nskills = false\nrules = false\nmcps = false\n[compat.claude]\nskills = false\nrules = false\nmcps = false\n");
  const tf = join(d, "trusted_folders.toml"), rtf = join(home, ".grok/trusted_folders.toml");
  try { if (!existsSync(tf) && existsSync(rtf)) writeFileSync(tf, readFileSync(rtf)); } catch {}
  return d;
}
export function leanGrokArgs({ sid, model, text, prompt, schema, system, tools, maxTurns, effort, context, resume = false }) {
  if (!text && !maxTurns) maxTurns = codeMaxTurns();
  return ["--trust", "--always-approve", resume ? "--resume" : "--session-id", sid, ...(model ? ["--model", model] : []), ...(effort ? ["--reasoning-effort", effort] : []),
    "--tools", tools ?? (text ? "read_file" : CODE_TOOLS), ...(maxTurns || text ? ["--max-turns", String(maxTurns ?? 1)] : []), "--disable-web-search", "--no-subagents", "--no-plan",
    ...(system ? ["--system-prompt-override", system] : []), ...(context ? ["--rules", context] : []), "--json-schema", JSON.stringify(schema), "--output-format", "json", "--single", prompt];
}
/** Parse grok --output-format json stdout: structuredOutput, else the last {...} in text. */
export function parseResult(stdout) {
  let j = null; try { j = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { const m = stdout.match(/\{[\s\S]*\}\s*$/); try { j = m && JSON.parse(m[0]); } catch {} }
  if (!j) return {};
  if (j.structuredOutput) return j.structuredOutput;
  if (typeof j.text === "string") { const m = j.text.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : { summary: j.text }; } catch { return { summary: j.text }; } }
  return j;
}

/** Git-host steps a segment implies: open a PR (moving into In Review or an open_pr action) and/or merge (merge action). */
export function prSteps(na, seg) {
  const touched = [...seg.stages, ...seg.moves.filter(Boolean)];
  const acts = touched.flatMap((k) => na.on_enter?.[k] ?? []);
  const op = acts.find((a) => a.action === "open_pr"), mg = acts.find((a) => a.action === "merge");
  const open = op || seg.moves.includes("in_review") || (seg.stages[0] === "in_review" && seg.kind === "script") || !!mg;
  return { open, openBase: op?.base ?? null, merge: !!mg, mergeBase: mg?.base ?? null };
}
/** Push + PR + merge with the user's own git/gh login, only when the company opted in (auto_pr). Never forces. exec(cmd,args)->stdout|throws. */
export function gitHost(repo, o, exec = (c, a) => execFileSync(c, a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()) {
  const r = { pushed: false, url: null, merged: false, msg: [] };
  if (!o.open && !o.merge) return r;
  if (!o.autoPr) { r.msg.push(`auto PR is OFF for this company (/company set auto-pr on to enable): branch ${o.branch} stays local`); return r; }
  try { exec("git", ["remote", "get-url", "origin"]); } catch { r.msg.push("auto PR ON but the repo has no git remote 'origin': add one, then retry"); return r; }
  try { exec("git", ["push", "-u", "origin", o.branch]); r.pushed = true; } catch (e) { r.msg.push(`git push failed: ${String(e.message).split("\n")[0]}`); return r; }
  try { exec("gh", ["auth", "status"]); } catch { r.msg.push(`pushed ${o.branch}; gh CLI missing or not logged in: run \`brew install gh && gh auth login\`, then the PR opens on the next run`); return r; }
  try { r.url = exec("gh", ["pr", "view", o.branch, "--json", "url", "-q", ".url"]) || null; } catch {}
  if (!r.url) {
    try { r.url = exec("gh", ["pr", "create", "--head", o.branch, ...(o.openBase ? ["--base", o.openBase] : []), "--title", o.title, "--body", o.body]).split("\n").filter(Boolean).at(-1); }
    catch (e) { r.msg.push(`gh pr create failed: ${String(e.message).split("\n")[0]}`); return r; }
  }
  r.msg.push(`PR ${r.url}`);
  if (o.merge) {
    try { exec("gh", ["pr", "merge", o.branch, "--merge"]); r.merged = true; r.msg.push(`merged into ${o.mergeBase ?? "base"}`); }
    catch (e) { r.msg.push(`merge NOT done (conflicts/checks?): ${String(e.message).split("\n")[0]}; not forced`); }
  }
  return r;
}

/** Read-only: recently merged PRs whose head branch looks like feature/<ISSUE-KEY> (or contains the key). Uses gh CLI; never posts fake Jira events. */
export function pollMergedPrs(repo, { sinceHours = 48, exec = (c, a) => execFileSync(c, a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() } = {}) {
  try { exec("gh", ["auth", "status"]); } catch { return []; }
  let raw = "[]";
  try {
    raw = exec("gh", ["pr", "list", "--state", "merged", "--limit", "30", "--json", "number,url,title,headRefName,baseRefName,mergedAt,headRepository"]);
  } catch { return []; }
  let list = []; try { list = JSON.parse(raw); } catch { return []; }
  const since = Date.now() - sinceHours * 3600e3;
  const out = [];
  for (const pr of list) {
    const mergedAt = pr.mergedAt ? Date.parse(pr.mergedAt) : 0;
    if (mergedAt && mergedAt < since) continue;
    const branch = String(pr.headRefName ?? "");
    const m = branch.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
    if (!m) continue;
    const base = String(pr.baseRefName ?? "").toLowerCase();
    if (!["main", "master", "develop", "development"].includes(base)) continue;
    out.push({ key: m[1], branch, base, url: pr.url ?? null, title: pr.title ?? "", mergedAt: pr.mergedAt ?? null, number: pr.number });
  }
  return out;
}

// ---------- user habits: local, per company, learned on Done from the user's own comments ----------
// ~/.config/agents-holding/state/<company>/habits.md (chmod 600): "- <habit>" bullets, capped (HABITS_MAX bullets / HABITS_BYTES),
// newest kept. One cheap text call per Done task WITH user comments; zero calls otherwise. Injected into plan/tech plan/code prompts.
export const HABITS_MAX = 40, HABITS_BYTES = 2048;
export const HABITS_SCHEMA = { type: "object", properties: { habits: { type: "array", items: { type: "string" } } } };
export const HABITS_SYSTEM = "You distill a user's review comments into short, general, reusable preferences. Reply with JSON only.";
export const habitsPath = (home, company) => join(stateDir(home, company), "habits.md");
export const parseHabits = (t) => String(t ?? "").split("\n").map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).filter((l) => l && !l.startsWith("#"));
export function loadHabits(home, company) { try { return parseHabits(readFileSync(habitsPath(home, company), "utf8")); } catch { return []; } }
const normH = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an|user|prefers?|wants?|should|always)\b/g, "").replace(/\s+/g, " ").trim();
/** Merge new habits into old: dedupe (normalized), one line each (<=160 chars), cap count/bytes keeping the newest. Returns {all, added}. */
export function mergeHabits(old = [], add = [], { max = HABITS_MAX, bytes = HABITS_BYTES } = {}) {
  const seen = new Set(old.map(normH)), added = [];
  for (let h of add) { h = String(h ?? "").replace(/\s+/g, " ").trim().slice(0, 160); const k = normH(h); if (!k || seen.has(k)) continue; seen.add(k); added.push(h); }
  let all = [...old, ...added].slice(-max);
  while (all.length && all.map((h) => `- ${h}\n`).join("").length > bytes) all = all.slice(1);
  return { all, added: added.filter((h) => all.includes(h)) };
}
export function saveHabits(home, company, list) { writeFileSync(habitsPath(home, company), `# agents-holding: learned user habits (edit freely; one "- " bullet each)\n${list.map((h) => `- ${h}`).join("\n")}\n`, { mode: 0o600 }); }
export const habitsBlock = (h) => h?.length ? `User habits (learned from earlier reviews; follow unless this task says otherwise):\n${h.map((x) => `- ${x}`).join("\n")}` : null;
/** The user's own comments on a Done task (agent comments dropped). */
export const userComments = (j) => compactIssue(j, { desc: 600, comments: 15, comment: 500 }).comments;
export function habitsPrompt(iss, comments, existing = []) {
  return [`Task ${iss.key}: ${iss.summary}`, iss.description && `Description: ${clip(iss.description, 600)}`,
    `The user's comments on this task (plan/review feedback, answers):\n${comments.map((c) => `- ${c.t}`).join("\n")}`,
    existing.length && `Already known habits (do not repeat):\n${existing.map((h) => `- ${h}`).join("\n")}`,
    "Extract 0-3 GENERAL preferences that would apply to future tasks (e.g. comment \"should use animation\" on a numbers task -> \"User prefers animations when displaying numbers/data\"). Skip task-specific fixes, typos, approvals, thanks.",
    "Return {\"habits\": [\"...\"]} (empty list if nothing general). JSON only."].filter(Boolean).join("\n\n");
}
export const learnedComment = (staff, added) => `${staffTag(staff)} ${T("learned")}\n${added.map((h) => `- ${h}`).join("\n")}`;


// ---------- output language = input language (card title+description / latest user comment / /ceo prompt) ----------
// Override per company: `holding company set lang <code|auto>` (agent.json "lang"). Code, identifiers, commit messages follow repo conventions.
export const LANG_NAMES = { en: "English", vi: "Vietnamese", zh: "Chinese", ja: "Japanese", ko: "Korean", th: "Thai", ru: "Russian", fr: "French", es: "Spanish", de: "German" };
export function detectLang(text) {
  const t = String(text ?? ""), n = (re) => (t.match(re) ?? []).length;
  if (n(/[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi) >= 2) return "vi";
  if (n(/[àáâãèéêìíòóôõùúýăđơư]/gi) >= 2 && /\b(khong|cua|va|cho|minh|giup|lam|duoc|nay|nhung|cac|nhe|ban|them|sua)\b/.test(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d"))) return "vi";
  if (n(/[\u3040-\u30ff]/g) >= 2) return "ja";
  if (n(/[\uac00-\ud7af]/g) >= 2) return "ko";
  if (n(/[\u4e00-\u9fff]/g) >= 2) return "zh";
  if (n(/[\u0e00-\u0e7f]/g) >= 2) return "th";
  if (n(/[\u0400-\u04ff]/g) >= 3) return "ru";
  return "en";
}
/** Company override (code) wins unless "auto"/unset; else the first text with a non-English signal, else English. */
export function pickLang(override, ...texts) {
  if (override && override !== "auto") return String(override).toLowerCase();
  for (const t of texts) { const l = detectLang(t); if (l !== "en") return l; }
  return "en";
}
let LANG = "en";
export const setLang = (l) => { LANG = l || "en"; return LANG; };
export const getLang = () => LANG;
const STR = {
  en: { started: "▶️ Started {stage}…", why: "Why {staff}: {why}", failed: "❌ Failed {stage}: {reason}", review: "🔁 Review feedback received, back to Coding", learned: "🧠 Learned your habits:",
    gate_planned: "🚦 Plan ready for your approval.\n- Approve: drag the card to Pre Coding, or comment `/approve`\n- Revise: comment what to change (the plan is rewritten, the card stays in Planned)",
    gate_in_review: "🚦 Ready for review.\n- Request changes: comment what to fix (back to Coding, same developer, then QC)\n- Accept: drag the card to Done",
    PLAN: "📋 Plan", "TECH PLAN": "🛠️ Tech plan", QUESTION: "❓ Question", CODE: "💻 Code", "CODE (review feedback)": "💻 Code (review feedback)", FIX: "🔧 Fix", "QC PASS": "✅ QC pass", "QC FAIL": "❌ QC fail", DONE: "✅ Done" },
  vi: { started: "▶️ Bắt đầu {stage}…", why: "Vì sao chọn {staff}: {why}", failed: "❌ Lỗi ở {stage}: {reason}", review: "🔁 Đã nhận góp ý review, quay lại Coding", learned: "🧠 Đã ghi nhớ thói quen của bạn:",
    gate_planned: "🚦 Kế hoạch đã sẵn sàng để bạn duyệt.\n- Duyệt: kéo thẻ sang Pre Coding, hoặc comment `/approve`\n- Sửa: comment điều cần thay đổi (kế hoạch được viết lại, thẻ vẫn ở Planned)",
    gate_in_review: "🚦 Sẵn sàng để review.\n- Yêu cầu sửa: comment điều cần sửa (quay lại Coding, cùng developer, rồi QC)\n- Chấp nhận: kéo thẻ sang Done",
    PLAN: "📋 Kế hoạch", "TECH PLAN": "🛠️ Kế hoạch kỹ thuật", QUESTION: "❓ Câu hỏi", CODE: "💻 Code", "CODE (review feedback)": "💻 Code (theo góp ý review)", FIX: "🔧 Sửa lỗi", "QC PASS": "✅ QC đạt", "QC FAIL": "❌ QC không đạt", DONE: "✅ Hoàn tất" },
  zh: { started: "▶️ 开始 {stage}…", why: "为什么是 {staff}：{why}", failed: "❌ {stage} 失败：{reason}", review: "🔁 已收到评审意见，返回 Coding", learned: "🧠 已记住你的习惯：",
    gate_planned: "🚦 计划已就绪，等待你批准。\n- 批准：把卡片拖到 Pre Coding，或评论 `/approve`\n- 修改：评论需要修改的内容（计划会重写，卡片留在 Planned）",
    gate_in_review: "🚦 可以评审了。\n- 要求修改：评论需要修复的内容（返回 Coding，同一开发者，然后 QC）\n- 接受：把卡片拖到 Done",
    PLAN: "📋 计划", "TECH PLAN": "🛠️ 技术方案", QUESTION: "❓ 问题", CODE: "💻 代码", "CODE (review feedback)": "💻 代码（评审意见）", FIX: "🔧 修复", "QC PASS": "✅ QC 通过", "QC FAIL": "❌ QC 未通过", DONE: "✅ 完成" },
  ja: { started: "▶️ {stage} を開始…", why: "{staff} を選んだ理由: {why}", failed: "❌ {stage} 失敗: {reason}", review: "🔁 レビュー指摘を受け取りました。Coding に戻ります", learned: "🧠 あなたの習慣を学びました:",
    gate_planned: "🚦 計画の承認待ちです。\n- 承認: カードを Pre Coding へ移動、または `/approve` とコメント\n- 修正: 変更点をコメント（計画を書き直し、カードは Planned のまま）",
    gate_in_review: "🚦 レビュー準備完了。\n- 修正依頼: 直す点をコメント（Coding に戻り、同じ開発者、その後 QC）\n- 承認: カードを Done へ移動",
    PLAN: "📋 計画", "TECH PLAN": "🛠️ 技術計画", QUESTION: "❓ 質問", CODE: "💻 コード", "CODE (review feedback)": "💻 コード（レビュー対応）", FIX: "🔧 修正", "QC PASS": "✅ QC 合格", "QC FAIL": "❌ QC 不合格", DONE: "✅ 完了" },
  ko: { started: "▶️ {stage} 시작…", why: "{staff} 선택 이유: {why}", failed: "❌ {stage} 실패: {reason}", review: "🔁 리뷰 피드백을 받아 Coding으로 돌아갑니다", learned: "🧠 습관을 학습했습니다:",
    gate_planned: "🚦 계획이 승인을 기다립니다.\n- 승인: 카드를 Pre Coding으로 옮기거나 `/approve` 댓글\n- 수정: 바꿀 내용을 댓글로 (계획을 다시 쓰고 카드는 Planned에 유지)",
    gate_in_review: "🚦 리뷰 준비 완료.\n- 수정 요청: 고칠 내용을 댓글로 (Coding으로, 같은 개발자, 이후 QC)\n- 승인: 카드를 Done으로 이동",
    PLAN: "📋 계획", "TECH PLAN": "🛠️ 기술 계획", QUESTION: "❓ 질문", CODE: "💻 코드", "CODE (review feedback)": "💻 코드(리뷰 반영)", FIX: "🔧 수정", "QC PASS": "✅ QC 통과", "QC FAIL": "❌ QC 실패", DONE: "✅ 완료" },
};
/** Fixed script string in the current language; languages without a table fall back to English (generic). */
export const T = (key, vars = {}, lang = LANG) => String((STR[lang] ?? STR.en)[key] ?? STR.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
export const langInstruction = (lang = LANG) => `Language: write every human-readable field (plan, questions, summaries, notes) in ${LANG_NAMES[lang] ?? lang}, the language of the task. Keep code, identifiers, file paths and commit messages in the repo's own conventions.`;
// ---------- visibility: Jira "working" label + start/fail comments, macOS notifications, local listener status ----------
export const WORK_LABEL = "agent-working";
const STAGE_TITLES = { todo: "To Do", in_progress: "In Progress", product_work: "Product Work", ba_question: "BA Question", planned: "Planned", pre_coding: "Pre Code", coding: "Coding", qc: "QC", in_review: "In Review", done: "Done" };
export const stageTitle = (k) => STAGE_TITLES[k] ?? String(k ?? "?").replace(/_/g, " ");
export const startedComment = (staff, stage, why) => `${staffTag(staff)} ${T("started", { stage: stageTitle(stage) })}${why ? `\n${T("why", { staff, why })}` : ""}`;
export const failedComment = (staff, stage, reason) => `${staffTag(staff)} ${T("failed", { stage: stageTitle(stage), reason: clip(String(reason ?? "error").split("\n")[0], 200) })}`;
// ---------- explicit user gates (posted once when the card enters the gate) ----------
export const GATE_HINTS = {
  planned: "🚦 Plan ready for your approval.\n- Approve: drag the card to Pre Code, or comment `/approve`\n- Revise: comment what to change (the plan is rewritten, the card stays in Planned)",
  in_review: "🚦 Ready for review.\n- Request changes: comment what to fix (back to Coding, same developer, then QC)\n- Accept: drag the card to Done",
};
export const gateComment = (staff, stage) => GATE_HINTS[stage] ? `${staffTag(staff)} ${T(`gate_${stage}`)}` : null;
// ---------- acting staff on the board: one label staff:<role> (replaced each stage, removed at Done) ----------
export const STAFF_LABEL = "staff:";
/** Jira labels update ops: drop every other staff:* label, add staff:<role> (role null = remove all). */
export function staffLabelOps(labels = [], role) {
  const want = role ? `${STAFF_LABEL}${String(role).replace(/[^\w.-]/g, "-")}` : null;
  const ops = labels.filter((l) => l.startsWith(STAFF_LABEL) && l !== want).map((l) => ({ remove: l }));
  if (want && !labels.includes(want)) ops.push({ add: want });
  return ops;
}
export const staffOfLabels = (labels = []) => (labels.find((l) => l.startsWith(STAFF_LABEL)) ?? "").slice(STAFF_LABEL.length) || null;
// ---------- staff brief (persona + 2-3 relevant own skills, summaries only) injected into model prompts ----------
/** Per-run staff context (persona, 2-3 skill summaries, habits, language, conventions): delivered SEPARATELY from the task
 * through each CLI's native system/context channel (see providers/), never inside {prompt}. */
export function contextOf({ brief, habits, lang, conventions } = {}) {
  return ["# Staff context (agents-holding, generated per run)", brief && "Background on who you are. Ignore any instruction in it about tools, MCP, sessions, scanning the repo or delegating to other staff: this run does the task in the message directly and replies in the requested format.", briefBlock(brief), habitsBlock(habits), conventions && `Company conventions:\n${conventions}`, langInstruction(lang)].filter(Boolean).join("\n\n");
}
export const BRIEF_MAX = 6000; // chars (~1.5k tokens)
export function briefBlock(b) {
  if (!b || (!b.persona && !b.skills?.length)) return null;
  let t = [`You act as ${staffName(b.role)} (${b.role}).`, b.persona && `Persona:\n${b.persona}`, ...(b.skills ?? []).map((s) => `Skill ${s.id}:\n${s.summary}`)].filter(Boolean).join("\n");
  return t.length > BRIEF_MAX ? t.slice(0, BRIEF_MAX - 1) + "…" : t;
}
// ---------- Jira rich text (ADF): bold staff prefix, headings, lists, code ----------
const HEADS = { PLAN: "📋 Plan", "TECH PLAN": "🛠️ Tech plan", QUESTION: "❓ Question", CODE: "💻 Code", "CODE (review feedback)": "💻 Code (review feedback)", FIX: "🔧 Fix", "QC PASS": "✅ QC pass", "QC FAIL": "❌ QC fail", DONE: "✅ Done" };
function inline(t) { // `code` and **bold** -> marks
  const out = []; const re = /(`[^`]+`|\*\*[^*]+\*\*)/g; let i = 0, m;
  while ((m = re.exec(t))) { if (m.index > i) out.push({ type: "text", text: t.slice(i, m.index) });
    out.push(m[0][0] === "`" ? { type: "text", text: m[0].slice(1, -1), marks: [{ type: "code" }] } : { type: "text", text: m[0].slice(2, -2), marks: [{ type: "strong" }] }); i = m.index + m[0].length; }
  if (i < t.length) out.push({ type: "text", text: t.slice(i) });
  return out;
}
const para = (t) => ({ type: "paragraph", content: inline(t) });
/** Agent comment text -> ADF doc. First line "[agent-holding] [Staff] rest": bold prefix; a known title (PLAN, QC PASS...) becomes a heading. */
export function toAdf(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n"), content = [];
  const m = /^(\[agent-holding\]\s*\[[^\]]*\]|\[agent-holding\])\s*(.*)$/.exec(lines[0] ?? "");
  if (m) { lines.shift(); const rest = m[2].trim(), hk = HEADS[rest] ? rest : rest.replace(/\s*\(.*\)$/, ""), head = HEADS[hk] && T(hk);
    if (head) { content.push({ type: "paragraph", content: [{ type: "text", text: m[1], marks: [{ type: "strong" }] }] }, { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: HEADS[rest] ?? `${head} ${rest.match(/\(.*\)$/)?.[0] ?? ""}`.trim() }] }); }
    else content.push({ type: "paragraph", content: [{ type: "text", text: m[1], marks: [{ type: "strong" }] }, ...(rest ? [{ type: "text", text: " " }, ...inline(rest)] : [])] }); }
  let list = null, code = null;
  const flush = () => { if (list) { content.push(list); list = null; } };
  for (const raw of lines) {
    if (code) { if (/^```/.test(raw.trim())) { content.push({ type: "codeBlock", attrs: code.lang ? { language: code.lang } : {}, content: code.t.length ? [{ type: "text", text: code.t.join("\n") }] : [] }); code = null; } else code.t.push(raw); continue; }
    const l = raw.trimEnd();
    if (/^```/.test(l.trim())) { flush(); code = { lang: l.trim().slice(3).trim(), t: [] }; continue; }
    const b = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(l);
    if (b) { const kind = b[1] ? "orderedList" : "bulletList"; if (list && list.type !== kind) flush(); list ??= { type: kind, content: [] }; list.content.push({ type: "listItem", content: [para(b[2])] }); continue; }
    flush();
    if (!l.trim()) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(l); if (h) { content.push({ type: "heading", attrs: { level: Math.min(6, h[1].length + 2) }, content: [{ type: "text", text: h[2] }] }); continue; }
    const kv = /^([A-Z][\w ()/-]{0,30}):\s+(.*)$/.exec(l); // "Summary: ..." -> bold label
    if (kv) { content.push({ type: "paragraph", content: [{ type: "text", text: `${kv[1]}: `, marks: [{ type: "strong" }] }, ...inline(kv[2])] }); continue; }
    content.push(para(l));
  }
  flush(); if (code) content.push({ type: "codeBlock", attrs: {}, content: code.t.length ? [{ type: "text", text: code.t.join("\n") }] : [] });
  return { type: "doc", version: 1, content: content.length ? content : [{ type: "paragraph", content: [] }] };
}
/** Jira labels update body (add/remove the working label). */
export const labelBody = (op, label = WORK_LABEL) => ({ update: { labels: [{ [op === "remove" ? "remove" : "add"]: label }] } });
const notifyFile = (home) => join(home, ".config/agents-holding/notify.json");
export function issueUrl(home, issue) {
  try { const j = JSON.parse(readFileSync(join(home, ".config/agents-holding/jira.json"), "utf8")); if (j.site && issue) return `${String(j.site).replace(/\/$/, "")}/browse/${encodeURIComponent(issue)}`; } catch {}
  return null;
}
export function notifyOn(home, env = process.env) { if (env.AH_NOTIFY === "0") return false; try { return JSON.parse(readFileSync(notifyFile(home), "utf8")).on !== false; } catch { return true; } }
export function setNotify(home, on) { mkdirSync(join(home, ".config/agents-holding"), { recursive: true }); writeFileSync(notifyFile(home), JSON.stringify({ on: !!on }), { mode: 0o600 }); }
const asq = (t) => String(t ?? "").replace(/[\\"]/g, "").replace(/\s+/g, " ").slice(0, 180);
/** osascript args for a macOS notification (quotes/backslashes stripped: no AppleScript injection from Jira text). */
export const notifyArgs = (title, msg) => ["-e", `display notification "${asq(msg)}" with title "${asq(title)}"`];
export function desktopNotify(home, title, msg, exec = (c, a) => execFileSync(c, a, { stdio: "ignore", timeout: 5000 }), platform = process.platform, url = null) {
  if (!notifyOn(home) || platform !== "darwin") return false;
  try {
    if (url) { try { exec("terminal-notifier", ["-title", title, "-message", msg, "-open", url]); return true; } catch {} }
    exec("osascript", notifyArgs(title, msg)); return true;
  } catch { return false; }
}
/** What the user must do, per CEO inbox kind (one line, shown in the 'Agents Holding' notification and `holding inbox`). */
export const INBOX_NEED = { question: "a staff has a question for you", decision: "pick an option (1/2/3)", hire: "needs a hire (or pick an existing staff)", blocked: "an agent is blocked (e.g. needs a login)", failed: "a run failed: needs a look", gate: "approve or ask for changes", qc: "QC failed after fixes: needs a look", repo: "which repo should this task use?", staff: "staff decision needed" };
export const HOLDING_BIN = join(dirname(fileURLToPath(import.meta.url)), "holding");
/** Action notification: open the Jira ticket directly when a ticket URL is known;
 * fall back to the focused CEO item only for non-Jira inbox items. */
export function actionNotifyArgs({ issue, need, how, id, company, ticket_url, site }, bin = HOLDING_BIN) {
  const msg = `${issue ?? ""} ${need}. Answer: ${how}`.trim(), safe = (x) => String(x ?? "").replace(/[^A-Za-z0-9_.-]/g, "");
  const run = `'${bin.replace(/'/g, "")}' ceo --item ${safe(id)} --company ${safe(company)} --new-window >/dev/null 2>&1 &`;
  const url = String(ticket_url ?? (site && issue ? `${String(site).replace(/\/$/, "")}/browse/${encodeURIComponent(issue)}` : ""));
  const open = url ? `open location "${asq(url).replace(/"/g, "\\\"")}"` : `do shell script "${run.replace(/"/g, "")}"`;
  const button = url ? "Open ticket" : "Open CEO";
  return ["-e", `display notification "${asq(msg)}" with title "Agents Holding" subtitle "${asq(`${issue ?? ""} needs you`)}" sound name "Glass"`,
    "-e", `set r to display dialog "${asq(msg)}" with title "Agents Holding" buttons {"Later", "${button}"} default button "${button}" giving up after 900`,
    "-e", `if button returned of r is "${button}" then ${open}`];
}
export function dialogsOn(home) { try { return JSON.parse(readFileSync(notifyFile(home), "utf8")).dialog !== false; } catch { return true; } }
export function actionNotify(home, item, spawnIt = (a) => { const c = spawn("osascript", a, { detached: true, stdio: "ignore" }); c.on("error", () => {}); c.unref(); }, platform = process.platform) {
  if (!notifyOn(home) || platform !== "darwin") return false;
  const a = actionNotifyArgs(item); spawnIt(dialogsOn(home) ? a : a.slice(0, 2)); return true;
}
export const statusPath = (home) => join(home, ".config/agents-holding/listener-status.json");
export function readStatus(home) { try { return JSON.parse(readFileSync(statusPath(home), "utf8")); } catch { return null; } }
export function writeStatus(home, patch) {
  const cur = readStatus(home) ?? {}; const next = { ...cur, ...patch, companies: { ...(cur.companies ?? {}) }, updated_at: new Date().toISOString() };
  for (const [c, v] of Object.entries(patch.companies ?? {})) next.companies[c] = { ...(cur.companies?.[c] ?? {}), ...v };
  mkdirSync(join(home, ".config/agents-holding"), { recursive: true }); writeFileSync(statusPath(home), JSON.stringify(next, null, 1), { mode: 0o600 }); return next;
}
const ago = (t, now) => !t ? "never" : `${Math.max(0, Math.round((now - new Date(t).getTime()) / 1000))}s ago (${t})`;
/** `holding status` text from the status file (+ whether the pid is alive). */
/** Prominent red warning when the Jira listener is not running (null when it is). tty = ANSI red; chat = 🔴 + bold markdown. */
export function listenerAlive(home = homedirSafe()) { const st = readStatus(home); try { if (st?.pid) { process.kill(st.pid, 0); return true; } } catch {} return false; }
function homedirSafe() { return process.env.AH_HOME ?? process.env.HOME; }
export function listenerWarning(home = homedirSafe(), { tty = !!process.stdout.isTTY && !process.env.AH_HOOK_RUN } = {}) {
  if (listenerAlive(home)) return null;
  const body = ["Jira Listener is off — all Jira automation is stopped until you start it:",
    "  holding listener start && holding listener autostart on", "  Jira Listener keeps all Jira automation running.   check: holding listener status   (or /listener)"];
  return tty ? `\x1b[1;31m🔴 ${body[0]}\x1b[0m\n\x1b[31m${body.slice(1).join("\n")}\x1b[0m` : `🔴 **${body[0]}**\n${body.slice(1).map((l) => `**${l.trim()}**`).join("\n")}`;
}
export function formatStatus(st, alive, now = Date.now()) {
  if (!st) return "listener: no status file yet (never started? run: holding listener start && holding listener autostart on)";
  const l = [`listener: ${alive ? `RUNNING pid ${st.pid}` : `NOT RUNNING (last pid ${st.pid ?? "?"})`}, started ${ago(st.started_at, now)}, notifications ${st.notify === false ? "off" : "on"}`];
  for (const [c, v] of Object.entries(st.companies ?? {}))
    l.push(`  ${c}: realtime ${v.realtime ?? "?"}${v.realtime_at ? ` since ${ago(v.realtime_at, now)}` : ""}; last Jira event ${v.last_event ? `${v.last_event} ` : ""}${ago(v.last_event_at, now)}; last server heartbeat ${v.heartbeat_ok === false ? "FAILED " : ""}${ago(v.heartbeat_at, now)}`);
  l.push(st.running ? `  working: ${st.running.issue} ${stageTitle(st.running.stage)} since ${ago(st.running.at, now)}` : "  working: idle");
  if (st.last_run) l.push(`  last run: ${st.last_run.issue} ${st.last_run.result} ${ago(st.last_run.at, now)}`);
  return l.join("\n");
}
/** Watchdog: a socket with nothing received (incl. heartbeat replies) for longer than limitMs is stale -> reconnect. */
export const socketStale = (lastRx, now = Date.now(), limitMs = 120000) => !lastRx || now - lastRx > limitMs;

export * from "./agents.mjs";

// ---- compaction / resume (see resilience.mjs for checkpoints) ----
const COMPACT_RX = /auto-?compact(ed|ing)?|compacted (the )?conversation|conversation (was )?(compacted|truncated)|context (was )?truncated|context_length_exceeded|prompt is too long|max(imum)? turns reached|error_max_turns/i;
export const compactionSignal = (txt) => String(txt ?? "").match(COMPACT_RX)?.[0] ?? null;
export function resumeHint(plan = {}, ck = {}) {
  return ["RESUME: a previous attempt lost its context mid-run. Do NOT redo finished work.",
    plan.plan && "The plan is already approved (above).", plan.tech_plan && "The tech plan is done.",
    ck?.code_done?.length && `Coding sub-steps already committed (WIP): ${ck.code_done.map((i) => i + 1).join(", ")}. Check \`git log\` on the branch.`,
    "Continue from where it stopped."].filter(Boolean).join("\n");
}
