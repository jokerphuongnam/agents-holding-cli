// Failure handling for the Jira Listener (pure helpers, unit-tested in tests/resilience_test.mjs):
// agent CLI errors (auth / quota / rate limit / missing CLI / compaction), server errors (down / 5xx / quota / timeout),
// per-stage checkpoints (resume instead of restart), idempotent replay of missed Jira changes, stale read cache.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BLOCKED_LABEL = "agent-blocked";
const FIX = {
  claude: { auth: "claude login   (or: claude setup-token)", quota: "check your plan/credits: claude /billing usage", missing: "npm i -g @anthropic-ai/claude-code" },
  codex: { auth: "codex login", quota: "check your OpenAI plan/credits (codex login --with-api-key for a key)", missing: "npm i -g @openai/codex" },
  grok: { auth: "grok login", quota: "check your xAI plan/credits", missing: "install the grok CLI, then: grok login" },
  ollama: { auth: "-", quota: "-", missing: "brew install ollama && ollama serve" },
};
const RX = {
  missing: /ENOENT|command not found|No such file or directory.*(spawn|exec)|not recognized as an internal/i,
  auth: /not logged in|please (run )?.{0,20}login|log ?in (again|required)|unauthori[sz]ed|\b401\b|invalid (api[ _-]?key|x-api-key|token)|(token|session|credentials?) (has )?expired|authentication (failed|error|required)|refresh token/i,
  quota: /insufficient_quota|quota (exceeded|exhausted)|exceeded your (current )?quota|out of credits|credit balance is too low|billing|usage limit|payment required|\b402\b|plan limit/i,
  rate_limit: /rate.?limit|too many requests|\b429\b|overloaded|\b529\b|try again (later|in)/i,
  compaction: /context[_ ](window|length)[_ ]exceeded|prompt is too long|context_length_exceeded|maximum context length|compact(ed|ing) (the )?(conversation|context)|auto-?compact|conversation (was )?truncated|max(imum)? turns reached|reached max turns|error_max_turns/i,
};
/** Classify a failed agent CLI call from its exit code/signal + output. kind = claude|codex|grok|ollama|text|command. */
export function classifyAgentError(kind, out = "", code = 1) {
  const s = String(out ?? "").slice(-8000), k = FIX[kind] ? kind : "grok";
  let cause = "unknown";
  if (code === 127 || RX.missing.test(s)) cause = "missing";
  else if (RX.quota.test(s)) cause = "quota";
  else if (RX.auth.test(s)) cause = "auth";
  else if (RX.rate_limit.test(s)) cause = "rate_limit";
  else if (RX.compaction.test(s)) cause = "compaction";
  else if (code === "SIGTERM" || code === "SIGKILL") cause = "timeout";
  const fix = FIX[k][cause] ?? (cause === "rate_limit" ? "wait a few minutes; retried automatically with backoff" : cause === "compaction" ? "resumes from the checkpoint automatically; if it repeats: holding staff run <KEY> --proceed" : null);
  const line = (s.split("\n").reverse().find((l) => RX[cause]?.test(l)) ?? s.trim().split("\n").at(-1) ?? "").trim().slice(0, 200);
  return { cause, kind: k, fix, retry: cause === "rate_limit" || cause === "compaction", switchable: ["auth", "quota", "missing", "rate_limit"].includes(cause), detail: line };
}
export class AgentError extends Error { constructor(c, msg) { super(msg ?? `${c.kind} ${c.cause}${c.detail ? `: ${c.detail}` : ""}`); this.agent = c; } }
const CAUSE_TXT = {
  en: { auth: "login expired / not logged in", quota: "out of credits / quota exceeded", rate_limit: "rate limited (retries used up)", missing: "CLI not installed / not found", compaction: "context lost (compaction/truncation) twice", timeout: "timed out", unknown: "failed" },
  vi: { auth: "phiên đăng nhập hết hạn / chưa đăng nhập", quota: "hết credit / vượt quota", rate_limit: "bị giới hạn tốc độ (đã thử lại hết lượt)", missing: "chưa cài CLI / không tìm thấy", compaction: "mất ngữ cảnh (compaction/cắt bớt) hai lần", timeout: "quá thời gian", unknown: "lỗi" },
};
export function blockedComment(lang, c, { cmd, stage, tried = [] } = {}) {
  const vi = lang === "vi", T = CAUSE_TXT[vi ? "vi" : "en"];
  return [vi ? `⛔ AGENT BỊ CHẶN (${BLOCKED_LABEL})` : `⛔ AGENT BLOCKED (${BLOCKED_LABEL})`,
    `${vi ? "Nguyên nhân" : "Cause"}: ${c.kind} - ${T[c.cause] ?? c.cause}${stage ? ` (${vi ? "giai đoạn" : "stage"} ${stage})` : ""}`,
    c.detail && `${vi ? "Chi tiết" : "Detail"}: ${c.detail}`,
    cmd && `${vi ? "Lệnh" : "Command"}: ${cmd}`,
    tried.length > 1 && `${vi ? "Đã thử" : "Tried"}: ${tried.join(" → ")}`,
    c.fix && `${vi ? "Cách sửa" : "Fix"}: ${c.fix}`,
    vi ? "Sau khi sửa: holding staff run <KEY> (tiếp tục từ checkpoint) hoặc kéo lại thẻ." : "After fixing: holding staff run <KEY> (resumes from the checkpoint) or move the card again."].filter(Boolean).join("\n");
}
export const switchNote = (lang, from, to, c) => lang === "vi" ? `↪️ Chuyển sang lệnh dự phòng: ${to} (vì ${from}: ${CAUSE_TXT.vi[c.cause] ?? c.cause})` : `↪️ Switched to fallback: ${to} (${from}: ${CAUSE_TXT.en[c.cause] ?? c.cause})`;
export const backoffMs = (attempt, base = Number(process.env.AH_BACKOFF_MS ?? 30000)) => Math.min(base * 2 ** attempt, 10 * 60000);
const sleep0 = (ms) => new Promise((r) => setTimeout(r, ms));
/** Run with retry/backoff on rate limits, one fresh retry on compaction, then the fallback commands in order on auth/quota/missing.
 * attempt(cmd, {resume}) -> {ok:true, value} | {ok:false, out, code, kind}. Throws AgentError when everything failed. */
export async function runWithFallback(cmds, attempt, { onSwitch = () => {}, onRetry = () => {}, sleep = sleep0, retries = Number(process.env.AH_RATE_RETRIES ?? 3) } = {}) {
  const tried = []; let last = null;
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i]; tried.push(cmd.label);
    let rl = 0, comp = 0;
    for (;;) {
      const r = await attempt(cmd, { resume: comp > 0 });
      if (r.ok) return { value: r.value, used: cmd, tried };
      last = classifyAgentError(r.kind, r.out, r.code);
      if (last.cause === "rate_limit" && rl < retries) { const ms = backoffMs(rl++); await onRetry(cmd, last, ms); await sleep(ms); continue; }
      if (last.cause === "compaction" && comp < 1) { comp++; await onRetry(cmd, last, 0); continue; }
      break;
    }
    if (!last.switchable || i === cmds.length - 1) break;
    await onSwitch(cmd, cmds[i + 1], last);
  }
  const e = new AgentError(last); e.tried = tried; throw e;
}

// ---- server errors ----
/** {status, body, err} of an MCP/HTTP call -> {cause: down|quota|timeout|server|auth|ok, msg}. */
export function classifyServer({ status = 0, body = "", err = null } = {}) {
  const b = String(body ?? "").slice(0, 2000), m = String(err?.message ?? err ?? "");
  if (err && /abort|timeout|timed out|ETIMEDOUT/i.test(m + (err?.name ?? ""))) return { cause: "timeout", msg: "server timed out" };
  if (err) return { cause: "down", msg: `server unreachable (${m.slice(0, 80)})` };
  if (status === 402 || /quota|limit (reached|exceeded)|exceeded.*(limit|quota)|too many requests/i.test(b) && status >= 400 || status === 429) return { cause: "quota", msg: QUOTA_MSG };
  if (status === 401 || status === 403) return { cause: "auth", msg: `server refused the license (HTTP ${status}); run: holding doctor` };
  if (status >= 500) return { cause: status === 503 || status === 502 || status === 504 ? "down" : "server", msg: `server error HTTP ${status}` };
  return { cause: "ok", msg: "" };
}
export const QUOTA_MSG = "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost. Check: holding status · upgrade or wait for the reset.";
export const serverRetryable = (c) => ["down", "timeout", "server"].includes(c.cause);
export class ServerError extends Error { constructor(c) { super(c.msg); this.server = c; } }

// ---- stale cache for read-only commands ----
const cdir = (home) => join(home, ".config/agents-holding/cache");
export function cachePut(home, name, data) { try { mkdirSync(cdir(home), { recursive: true, mode: 0o700 }); writeFileSync(join(cdir(home), `${name}.json`), JSON.stringify({ at: new Date().toISOString(), data })); } catch {} }
export function cacheGet(home, name) { try { const j = JSON.parse(readFileSync(join(cdir(home), `${name}.json`), "utf8")); return { ...j, stale: true }; } catch { return null; } }
export const staleBanner = (at, why) => `⚠️  STALE (cached ${at}; server unavailable: ${why})`;

// ---- checkpoints (state/<company>/<KEY>.ckpt.json) ----
const cp = (dir, issue) => join(dir, `${issue}.ckpt.json`);
export function ckptLoad(dir, issue) { try { return JSON.parse(readFileSync(cp(dir, issue), "utf8")); } catch { return null; } }
export function ckptSave(dir, issue, patch) {
  const cur = ckptLoad(dir, issue) ?? {}, next = { ...cur, ...patch, at: new Date().toISOString() };
  mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(cp(dir, issue), JSON.stringify(next, null, 1), { mode: 0o600 }); return next;
}
export function ckptClear(dir, issue) { try { writeFileSync(cp(dir, issue), "{}"); } catch {} }
/** Resumable step of a stage: the checkpoint has it done for this exact stage (and no new feedback arrived since). */
export const ckptDone = (ck, stage, step) => !!ck && ck.stage === stage && (ck.done ?? []).includes(step);
/** Split a tech plan into at most `max` coding sub-steps (numbered / bulleted lines grouped evenly). */
export function splitSteps(plan, max = 3) {
  const items = String(plan ?? "").split("\n").map((l) => l.trim()).filter((l) => /^(\d+[.)]|[-*•])\s+\S/.test(l));
  if (items.length < 4 || max < 2) return [String(plan ?? "")]; // small plans stay one call (token budget)
  const n = Math.min(max, items.length), per = Math.ceil(items.length / n), out = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per).join("\n"));
  return out;
}
export function progressNote(lang, stage, steps, doneIdx) {
  const vi = lang === "vi";
  return [`📌 ${vi ? "Tiến độ" : "Progress"} (${stage}): ${doneIdx.length}/${steps.length}`,
    ...steps.map((s, i) => `${doneIdx.includes(i) ? "✅" : "⏳"} ${i + 1}. ${s.split("\n")[0].replace(/^(\d+[.)]|[-*•])\s+/, "").slice(0, 90)}`),
    vi ? "(checkpoint đã lưu: chạy lại sẽ tiếp tục từ đây)" : "(checkpoint saved: a rerun resumes from here)"].join("\n");
}

// ---- idempotent replay of missed Jira changes ----
export const replayKey = (issue, status, updated) => `${issue}|${status}|${updated}`;
const rp = (dir) => join(dir, "replayed.json");
export function replaySeen(dir) { try { return new Set(JSON.parse(readFileSync(rp(dir), "utf8"))); } catch { return new Set(); } }
export function replayMark(dir, keys) { const s = replaySeen(dir); keys.forEach((k) => s.add(k)); mkdirSync(dir, { recursive: true }); writeFileSync(rp(dir), JSON.stringify([...s].slice(-2000))); }
/** Jira issues (search results) -> the ones not replayed yet. */
export function replayTodo(issues, seen) { return issues.map((i) => ({ key: i.key, status: i.fields?.status?.name ?? "", updated: i.fields?.updated ?? "" })).filter((x) => !seen.has(replayKey(x.key, x.status, x.updated))); }
export const jqlSince = (project, iso) => { const d = new Date(new Date(iso).getTime() - 10 * 60000); const p = (n) => String(n).padStart(2, "0");
  return `project = "${project}" AND updated >= "${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}" ORDER BY updated ASC`; };
