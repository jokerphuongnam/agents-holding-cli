// Lean runner for holding-listen (token saving, default; AH_LEAN=0 = legacy agent-driven runs).
// Scripts do everything deterministic: read the Jira issue (REST), record artifacts, advance stages, Jira comments,
// transitions (via jiraOps), branch + commit. The model is called only for the text it must write:
//   * text stages (product_work / ba_question / plan revision): ONE tool-less call, cheap model, JSON {plan|question}
//   * code stages (pre_coding .. in_review chain): ONE coding call, JSON {tech_plan, summary, tests, commit_message}
// Every model call is a FRESH session (no resume) with no MCP servers (lean GROK_HOME / CODEX_HOME, claude --strict-mcp-config);
// the CLI is grok (default), claude or codex, see agents.mjs (AH_AGENT or per-company agent.json),
// with a short saved plan (state dir) + the user's approval/feedback instead of the old conversation.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const AGENT_MARK = "[agents-holding]";
export const TEXT_STAGES = new Set(["product_work", "ba_question", "planned"]);
export const SCRIPT_ACTIONS = new Set(["open_pr", "merge", "create_branch", "comment"]); // flow stages done by script, no model
export const ENTER_ONLY = new Set(["planned", "in_review", "done"]);
export const CODE_TOOLS = "run_terminal_command,read_file,search_replace,write,grep,list_dir";
export const TEXT_SCHEMA = { type: "object", properties: { plan: { type: "string" }, question: { type: "string" } } };
export const CODE_SCHEMA = { type: "object", properties: { tech_plan: { type: "string" }, summary: { type: "string" }, tests: { type: "string" }, commit_message: { type: "string" }, question: { type: "string" } }, required: ["summary"] };

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
    .filter((c) => c.t && !c.t.startsWith(AGENT_MARK)).slice(-max.comments);
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
  return [issueBlock(iss), o.plan && `Approved plan:\n${o.plan}`, o.approval && `User: ${o.approval}`, o.feedback && `Address this feedback: ${o.feedback}`,
    o.hints?.length && `Likely files: ${o.hints.join(", ")}`,
    `Implement it in this repo with minimal changes${o.qc ? "; then run the cheapest relevant check (build/tests) and fix failures" : ""}.`,
    "Do not run git commit/branch/push and do not touch Jira (scripts do that).",
    "Finish with JSON: {\"tech_plan\": \"files+steps, 3-6 lines\", \"summary\": \"what changed\", \"tests\": \"checks run + result\", \"commit_message\": \"one line\"}."].filter(Boolean).join("\n\n");
}
/** Agent-stage segments of a run: [{kind:"text"|"code"|"move", from, to}] from the current stage + server chain. */
// Which stages need the model at all. Only real AI work (analysis/plan text, tech plan/code/QC) calls it;
// moves, gates, review, done, todo, merges, PRs, comments and custom stages without AI actions are script-only.
export const CODE_STAGES = new Set(["pre_coding", "coding", "qc"]);
const TEXT_ACTIONS = new Set(["analyze", "plan"]), CODE_MODEL_ACTIONS = new Set(["tech_plan", "code", "qc_test"]);
export function stageKind(s, acts) {
  if (s === "in_progress") return "move";
  if (TEXT_STAGES.has(s)) return "text";
  if (CODE_STAGES.has(s)) return "code";
  if (acts?.some((a) => CODE_MODEL_ACTIONS.has(a.action))) return "code";
  if (acts?.some((a) => TEXT_ACTIONS.has(a.action))) return "text";
  return "script"; // todo, in_review, done, merge/PR/comment-only or action-less custom stages
}
export const doneComment = (issue, st) => [`${AGENT_MARK} DONE`, `${issue} is closed.`, st?.branch && `Branch ${st.branch}${st.commit ? ` @ ${st.commit}` : ""}`, st?.pr && `PR ${st.pr}`].filter(Boolean).join("\n");
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
    const last = out.at(-1);
    if (kind === "code" && last?.kind === "code") { last.stages.push(s); last.moves.push(to); continue; }
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
export function leanGrokArgs({ sid, model, text, prompt, schema, system }) {
  return ["--trust", "--always-approve", "--session-id", sid, ...(model ? ["--model", model] : []),
    "--tools", text ? "read_file" : CODE_TOOLS, ...(text ? ["--max-turns", "1"] : []), "--disable-web-search", "--no-subagents", "--no-plan",
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
