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
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const AGENT_MARK = "[agent-holding]";
export const AGENT_MARKS = [AGENT_MARK, "[agents-holding]"]; // legacy prefix still recognized as an agent comment
export const isAgentText = (t) => AGENT_MARKS.some((m) => String(t ?? "").trimStart().startsWith(m));
const STAFF_NAMES = { ceo: "CEO", cto: "CTO", "tech-lead": "Tech Lead", "ba-lead": "BA", "ba-user": "BA", "po-lead": "PO", "po-new": "PO", "po-modify": "PO",
  "pm-lead": "PM", "design-lead": "Design Lead", "ui-designer": "UI Designer", "ux-writer": "UX Writer", "qc-lead": "QC", "user-qc": "QC", git: "Git", "code-graph": "Code Graph" };
/** Role id -> display name (mirrors the server's staffName). */
export const staffName = (role) => !role ? "Agent" : STAFF_NAMES[role] ?? String(role).split(/[-_]/).filter(Boolean).map((w) => /^(fe|be|qa|qc|ui|ux|ios|api|ai|ml|db|sre)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(" ");
/** "[agent-holding] [<staff name>]" */
export const staffTag = (name) => `${AGENT_MARK} [${name || "Agent"}]`;
/** Client mirror of the server's ownerFor (fallback when next_action has no staff map). */
export function ownerFor(stage, engineer, roster = []) {
  const has = (r) => !roster.length || roster.includes(r);
  if (["todo", "in_progress", "product_work", "ba_question"].includes(stage)) return has("ba-lead") ? "ba-lead" : "po-lead";
  if (stage === "planned") return has("tech-lead") ? "tech-lead" : "po-lead";
  if (stage === "qc") return has("qc-lead") ? "qc-lead" : "user-qc";
  if (stage === "pre_coding") return has("tech-lead") ? "tech-lead" : engineer ?? "tech-lead";
  if (stage === "done") return "ceo";
  return engineer ?? "tech-lead";
}
/** Staff display name for a stage: server staff map, else mirror. kind "code" = the picked developer, "qc" = QC. */
export function stageStaff(na, stage, { kind, developer } = {}) {
  if (kind === "code") return staffName(developer || "tech-lead");
  if (kind === "qc" && stage !== "qc") return staffName(ownerFor("qc", null, na?.roster ?? [])); // custom QC stage
  if (kind === "techplan" && stage !== "pre_coding") return staffName(ownerFor("pre_coding", null, na?.roster ?? []));
  return na?.staff?.[stage]?.name ?? staffName(ownerFor(stage, na?.assigned_role ?? null, na?.roster ?? []));
}
export const TEXT_STAGES = new Set(["product_work", "ba_question", "planned"]);
export const SCRIPT_ACTIONS = new Set(["open_pr", "merge", "create_branch", "comment"]); // flow stages done by script, no model
export const ENTER_ONLY = new Set(["planned", "in_review", "done"]);
// grok --tools names: "Bash" = run_terminal_command ("run_terminal_command" itself is NOT accepted and silently loads ALL ~22 tools, ~9k tokens/turn)
export const CODE_TOOLS = "Bash,read_file,search_replace,write,grep,list_dir";
export const TECH_TOOLS = "read_file,grep,list_dir"; // Pre Coding: read-only, a few turns max, cheap model
export const TEXT_SCHEMA = { type: "object", properties: { plan: { type: "string" }, question: { type: "string" } } };
export const CODE_SCHEMA = { type: "object", properties: { tech_plan: { type: "string" }, summary: { type: "string" }, tests: { type: "string" }, commit_message: { type: "string" }, question: { type: "string" } }, required: ["summary"] };
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
    o.approval && `User: ${o.approval}`, o.feedback && `Address this feedback: ${o.feedback}`,
    !o.techPlan && o.hints?.length && `Likely files: ${o.hints.join(", ")}`,
    `Implement it in this repo with minimal changes${o.qc ? "; then run the cheapest relevant check (build/tests) and fix failures" : "; do not run tests/builds (QC runs them by script)"}.`,
    "Do not run git commit/branch/push and do not touch Jira (scripts do that).",
    `Finish with JSON: {${o.techPlan ? "" : "\"tech_plan\": \"files+steps, 3-6 lines\", "}\"summary\": \"what changed\", ${o.qc ? "\"tests\": \"checks run + result\", " : ""}\"commit_message\": \"one line\"}.`].filter(Boolean).join("\n\n");
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
export function runChecks(repo, checks, exec = (c, a) => execFileSync(c, a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5 * 60 * 1000, env: { ...process.env, CI: "1" } })) {
  return checks.map((c) => { try { const o = exec(c.cmd, c.args); return { name: c.name, ok: true, out: clip(o, 300) }; }
    catch (e) { return { name: c.name, ok: false, out: clip(`${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`.split("\n").filter(Boolean).slice(-25).join("\n"), 1500) }; } });
}
/** QC verdict: a check fails QC only if it passed on the baseline (pre-existing failures are reported, not blamed on the change). */
export function qcVerdict(baseline, after) {
  const was = Object.fromEntries((baseline ?? []).map((r) => [r.name, r.ok]));
  const failed = after.filter((r) => !r.ok && was[r.name] !== false), preexisting = after.filter((r) => !r.ok && was[r.name] === false);
  const passed = after.filter((r) => r.ok);
  return { pass: !failed.length, failed, preexisting, passed,
    text: [passed.length && `PASS: ${passed.map((r) => r.name).join(", ")}`, failed.length && `FAIL: ${failed.map((r) => `${r.name}\n${r.out}`).join("\n")}`,
      preexisting.length && `Pre-existing failures (also fail before the change): ${preexisting.map((r) => r.name).join(", ")}`, !after.length && "No automated checks in this repo."].filter(Boolean).join("\n") };
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
  const site = cfg?.site?.replace(/\/$/, "");
  const auth = () => { const t = jiraToken(cfg); return t ? "Basic " + Buffer.from(`${cfg.email}:${t}`).toString("base64") : null; }; // token only in memory, per call
  const req = async (m, path, body) => { const a = auth(); if (!a) throw new Error("no Jira token in Keychain");
    const r = await fetch(`${site}/rest/api/3${path}`, { method: m, headers: { Authorization: a, "Content-Type": "application/json", Accept: "application/json" }, body: body && JSON.stringify(body) });
    if (!r.ok) throw new Error(`Jira ${m} ${path.split("?")[0]} -> ${r.status}`); return r.status === 204 ? null : r.json(); };
  return {
    async issue(key) { return req("GET", `/issue/${encodeURIComponent(key)}?fields=summary,description,comment`); },
    async meta(key) { const j = await req("GET", `/issue/${encodeURIComponent(key)}?fields=labels,components`); return { labels: j.fields?.labels ?? [], components: (j.fields?.components ?? []).map((c) => c.name) }; },
    async comment(key, text) {
      if (dry) return log(`JIRA (dry): comment ${key} "${text.slice(0, 160).replace(/\n/g, " ")}${text.length > 160 ? "…" : ""}"`);
      const content = text.split("\n").map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] }));
      await req("POST", `/issue/${encodeURIComponent(key)}/comment`, { body: { type: "doc", version: 1, content } }); log(`JIRA: commented ${key}`);
    },
  };
}
export function git(repo, ...a) { return execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
export function ensureBranch(repo, branch) {
  try { if (git(repo, "rev-parse", "--abbrev-ref", "HEAD") === branch) return "kept";
    try { git(repo, "rev-parse", "--verify", branch); git(repo, "checkout", branch); return "switched"; } catch { git(repo, "checkout", "-b", branch); return "created"; } }
  catch (e) { return "failed: " + e.message.split("\n")[0]; }
}
export function commitAll(repo, msg) {
  try { git(repo, "add", "-A", "--", ".", ":!.agents/company.json"); if (!git(repo, "diff", "--cached", "--name-only")) return null;
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
export function leanGrokArgs({ sid, model, text, prompt, schema, system, tools, maxTurns }) {
  return ["--trust", "--always-approve", "--session-id", sid, ...(model ? ["--model", model] : []),
    "--tools", tools ?? (text ? "read_file" : CODE_TOOLS), ...(maxTurns || text ? ["--max-turns", String(maxTurns ?? 1)] : []), "--disable-web-search", "--no-subagents", "--no-plan",
    ...(system ? ["--system-prompt-override", system] : []), "--json-schema", JSON.stringify(schema), "--output-format", "json", "--single", prompt];
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
  if (!o.autoPr) { r.msg.push(`auto PR is OFF for this company (/auto-pr on to enable): branch ${o.branch} stays local`); return r; }
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

export * from "./agents.mjs";
