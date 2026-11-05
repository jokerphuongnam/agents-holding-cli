// Built-in token savings for every staff (sub-agent) call. Default ON; AH_SUBAGENT_OPT=0 turns all of it off.
// 1 slim brief: file paths instead of file contents, chat history never attached.
// 3 reuse: a follow-up for the same staff/company/repo resumes the existing session instead of starting a new one.
// 4 short result: every staff answers in one fixed summary template (no logs).
// 5 stable prefix: system + staff context first and byte-identical across runs, the task last (provider prompt caching).
// 7 batch: small same-type tasks go to one call and are split back per task.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute, relative } from "node:path";
import { randomUUID } from "node:crypto";

export const optOn = (env = process.env) => env.AH_SUBAGENT_OPT !== "0";

// ---- 1. slim brief ----
const HISTORY_RE = /^(?:#+\s*)?(?:chat history|conversation history|previous messages|lịch sử (?:chat|hội thoại))\b[\s\S]*?(?=^#+\s|\n{2,}(?=[A-Z#])|$(?![\s\S]))/gim;
const ROLE_LINE = /^(?:user|assistant|human|ai|system)\s*:\s.*$/gim;
const FILE_BLOCK = /(?:^|\n)(?:(?:file|tệp)\s*[:=]\s*|#+\s*|```[\w-]*\s+)?([\w./-]+\.[A-Za-z0-9]{1,8})\s*\n```[\w-]*\n([\s\S]*?)\n```/g;
/** Drop chat history, and replace pasted file contents with their path (the staff opens files itself). */
export function slimBrief(text, { cwd = process.cwd(), history = null } = {}) {
  if (!text) return { text: text ?? "", files: [], droppedHistory: !!history };
  const files = [];
  let t = String(text).replace(FILE_BLOCK, (m, path, body) => { if (body.length < 200) return m; const p = isAbsolute(path) ? relative(cwd, path) || path : path; files.push(p); return `\n(file: ${p}: open it yourself, contents not inlined)`; });
  const before = t.length; t = t.replace(HISTORY_RE, "").replace(ROLE_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: t, files: [...new Set(files)], droppedHistory: !!history || t.length < before };
}
/** File list for a brief: paths only, relative to the repo. */
export const fileRefs = (paths = [], cwd = process.cwd()) => paths.length ? "Files (paths only, read what you need):\n" + [...new Set(paths.map((p) => isAbsolute(p) ? relative(cwd, p) : p))].map((p) => `- ${p}`).join("\n") : "";

// ---- 4. fixed short result template ----
export const SUMMARY_MAX = 1200;
export const SUMMARY_SCHEMA = { type: "object", properties: { status: { type: "string", enum: ["done", "partial", "blocked"] }, summary: { type: "string" }, changes: { type: "array", items: { type: "string" } }, next: { type: "string" } }, required: ["status", "summary"] };
export const SUMMARY_RULE = "Reply ONLY in this template, no logs, no command output, no diffs: status (done|partial|blocked), summary (<= 3 sentences), changes (<= 8 short items: file or deliverable), next (one line or empty).";
const clip = (s, n) => { s = String(s ?? "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
/** Normalise any staff result to the template and cut long logs. */
export function shortResult(r) {
  const o = r && typeof r === "object" ? r : { summary: String(r ?? "") };
  const status = ["done", "partial", "blocked"].includes(o.status) ? o.status : (o.error ? "blocked" : "done");
  const changes = (Array.isArray(o.changes) ? o.changes : Array.isArray(o.steps) ? o.steps : []).slice(0, 8).map((x) => clip(typeof x === "string" ? x : JSON.stringify(x), 160));
  return { status, summary: clip((o.summary ?? o.text ?? "").split("\n").filter((l) => !/^\s*(\$ |>|at |npm (ERR|WARN)|\[\d+\/\d+\])/.test(l)).join("\n"), SUMMARY_MAX), changes, next: clip(o.next ?? "", 200) };
}
export const renderShort = (s) => [`[${s.status}] ${s.summary}`, ...s.changes.map((c) => `- ${c}`), s.next && `next: ${s.next}`].filter(Boolean).join("\n");

// ---- 5. stable prefix ----
/** Same inputs -> byte-identical prefix: no dates, ids or random order; the task goes last and outside the prefix. */
export function stablePrefix(system = "", context = "") {
  const scrub = (s) => String(s ?? "").replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?\b/g, "").replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "").replace(/[ \t]+$/gm, "");
  const sys = [scrub(system).trim(), SUMMARY_RULE].filter(Boolean).join("\n\n");
  return { system: sys, context: context ? sortSkills(scrub(context)).trim() : context };
}
/** Skill blocks ("Skill <id>:" ...) in a fixed order so the same staff gets the same prefix whatever the server order. */
export function sortSkills(ctx) {
  const parts = ctx.split(/\n(?=Skill [\w.-]+:\n)/); if (parts.length < 3) return ctx;
  const [head, ...sk] = parts; return [head, ...sk.sort()].join("\n");
}

// ---- 3. reuse the existing sub-agent session for follow-ups ----
export const REUSE_TTL_MS = 30 * 60000;
const FOLLOW = /^(?:and |also |then |now |continue|tiếp|tiếp tục|làm tiếp|sửa tiếp|thêm |còn |rồi |fix (?:it|that|this)|same |again|redo|ok,? )/i;
export const isFollowUp = (task, o = {}) => o.continue === true || (o.continue !== false && FOLLOW.test(String(task ?? "").trim()));
const sessFile = (home) => join(home, ".config/agents-holding/state/subagents.json");
const keyOf = ({ company, role, cwd, kind }) => [company, role, cwd, kind === "code" ? "code" : "text"].join("|");
function loadS(home) { try { return JSON.parse(readFileSync(sessFile(home), "utf8")); } catch { return {}; } }
/** -> { sid, resume }: resume=true only for a follow-up within the TTL on the same staff/company/repo/kind. */
export function sessionFor(home, k, task, o = {}, now = Date.now()) {
  const s = loadS(home), prev = s[keyOf(k)];
  if (prev && now - prev.at < REUSE_TTL_MS && isFollowUp(task, o)) return { sid: prev.sid, resume: true };
  return { sid: randomUUID(), resume: false };
}
export function rememberSession(home, k, sid, now = Date.now()) {
  const s = loadS(home); for (const [kk, v] of Object.entries(s)) if (now - v.at > REUSE_TTL_MS) delete s[kk];
  s[keyOf(k)] = { sid, at: now }; mkdirSync(join(home, ".config/agents-holding/state"), { recursive: true }); writeFileSync(sessFile(home), JSON.stringify(s), { mode: 0o600 });
}

// ---- 7. batch small same-type tasks ----
export const BATCH_SMALL = 400, BATCH_MAX = 6;
/** Group tasks [{role, kind, task}] -> batches of small tasks with the same role+kind; big tasks stay alone. */
export function batchTasks(tasks, { small = BATCH_SMALL, max = BATCH_MAX } = {}) {
  const out = [], open = new Map();
  for (const [i, t] of tasks.entries()) {
    if (String(t.task).length > small) { out.push([{ ...t, i }]); continue; }
    const k = `${t.role}|${t.kind ?? "text"}`; let b = open.get(k);
    if (!b || b.length >= max) { b = []; open.set(k, b); out.push(b); } b.push({ ...t, i });
  }
  return out;
}
export const batchPrompt = (b) => b.length === 1 ? b[0].task : `Do these ${b.length} small tasks in one go. Reply with "items": one template entry per task, same order (id = the number).\n` + b.map((t, n) => `${n + 1}. ${t.task}`).join("\n");
export const BATCH_SCHEMA = { type: "object", properties: { items: { type: "array", items: { ...SUMMARY_SCHEMA, properties: { id: { type: "number" }, ...SUMMARY_SCHEMA.properties } } } }, required: ["items"] };
/** Split one batch result back per task (missing entries -> blocked). */
export function splitBatch(b, result) {
  if (b.length === 1) return [shortResult(result)];
  const items = Array.isArray(result?.items) ? result.items : [];
  return b.map((_, n) => shortResult(items.find((x) => Number(x?.id) === n + 1) ?? items[n] ?? { status: "blocked", summary: "no answer for this task in the batch" }));
}
