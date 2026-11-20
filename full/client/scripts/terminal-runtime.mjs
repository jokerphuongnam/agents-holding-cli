// Runtime bridge for the user-registered PTY. The listener may dispatch only
// to a connected terminal bound to the exact company repo.
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";

const dir = join(homedir(), ".config/agents-holding/terminal-sessions");
const timeMs = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const n = Number(v);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const d = Date.parse(String(v ?? ""));
  return Number.isFinite(d) ? d : 0;
};
function sessions() {
  const out = {};
  try { Object.assign(out, JSON.parse(readFileSync(join(dir, "sessions.json"), "utf8"))); } catch {}
  try {
    for (const f of readdirSync(dir).filter((x) => x.startsWith("pty-") && x.endsWith(".json"))) {
      try { const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.session_id) out[s.session_id] = s; } catch {}
    }
  } catch {}
  return out;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normalizeCommand(command, repo) {
  let value = String(command ?? "").trim();
  // A QC command and a manual dispatch may spell the same working directory
  // differently. Treat `cd <registered repo> && <command>` as the command in
  // that repo so the active QA run is joined rather than repeated.
  const prefix = /^cd\s+(?:'([^']*)'|"([^"]*)"|([^&]+?))\s*&&\s*/;
  const match = value.match(prefix);
  if (match) {
    const target = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (target === repo) value = value.slice(match[0].length).trim();
  }
  return value.replace(/\s+/g, " ");
}
/** Join an already-running PTY job by waiting for its durable transcript. This
 * works across listener processes; a module-local promise map cannot coalesce
 * Jira events handled by separate processes. */
async function waitForJob(session, jobId, command, timeoutMs = 0) {
  if (!/^job-[a-f0-9]+$/i.test(String(jobId ?? "")) || !/^term-[a-f0-9]+$/i.test(String(session?.session_id ?? "")))
    return { status: "blocked", reason: "terminal returned an invalid active-job identifier" };
  const transcriptPath = join(dir, "logs", `${session.session_id}-${jobId}.log`);
  const started = Date.now();
  for (;;) {
    if (existsSync(transcriptPath)) {
      let transcript = "";
      try { transcript = readFileSync(transcriptPath, "utf8"); } catch {}
      const matches = [...transcript.matchAll(/__AH_DONE_[A-Za-z0-9_-]+__:(-?\d+)/g)];
      if (matches.length) {
        const latest = sessions()[session.session_id] ?? session;
        return { status: "completed", session_id: session.session_id, job_id: jobId, command,
          cwd: latest.repo ?? session.repo, repo: latest.repo ?? session.repo,
          exit_code: Number(matches.at(-1)[1]), transcript };
      }
    }
    if (timeoutMs > 0 && Date.now() - started >= timeoutMs)
      return { status: "blocked", reason: `timed out waiting for already-running terminal job ${jobId}` };
    const latest = sessions()[session.session_id];
    if ((!latest || latest.active_job?.job_id !== jobId) && Date.now() - started > 5000)
      return { status: "blocked", reason: `terminal job ${jobId} ended without a durable transcript` };
    await delay(1000);
  }
}

export function selectAvailableTerminal({ company, repo } = {}) {
  if (!company || !repo) return null;
  let scopedRepo;
  try { scopedRepo = realpathSync(repo); } catch { return null; }
  return Object.values(sessions()).filter((s) => s.status === "connected" && s.socket && s.token &&
    s.company === company && s.repo === scopedRepo &&
    s.heartbeat_at && Date.now() - timeMs(s.heartbeat_at) < 90000 &&
    existsSync(s.socket))
    .sort((a, b) => timeMs(b.heartbeat_at) - timeMs(a.heartbeat_at))[0] ?? null;
}

// A terminal check may legitimately run for hours (large integration suites,
// device/UI tests). `timeoutMs=0` means no wall-clock timeout; disconnect and
// an explicit non-zero exit still fail immediately.
const terminalQueues = new Map();
const terminalInflight = new Map();
function dispatchTerminalNow(session, command, timeoutMs = 0) {
  return new Promise((resolve) => {
    if (!session?.socket || !session?.token) return resolve({ status: "blocked", reason: "registered terminal is unavailable" });
    const socket = createConnection(session.socket), chunks = [];
    let completion = null, settled = false;
    const capturedOutput = () => {
      let output = chunks.join("");
      if (!completion) return output;
      const frame = JSON.stringify(completion), at = output.lastIndexOf(frame);
      if (at < 0) return output;
      let end = at + frame.length;
      if (output[end] === "\r") end++;
      if (output[end] === "\n") end++;
      return output.slice(0, at) + output.slice(end);
    };
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.destroy(); } catch {} resolve(v); };
    const timer = timeoutMs > 0 ? setTimeout(() => finish({ status: "blocked", reason: "terminal command timed out" }), timeoutMs) : null;
    socket.on("data", (b) => {
      const raw = b.toString(); chunks.push(raw);
      for (const line of raw.split("\n")) { try { const x = JSON.parse(line); if (x.event === "completion") completion = x; if (x.ok === false && /terminal (?:already running|is busy)/i.test(String(x.error ?? ""))) finish({ status: "busy", reason: x.error, active_job: x.active_job, active_command: x.active_command }); } catch {} }
      if (completion) finish({ ...completion, transcript: capturedOutput() });
    });
    socket.on("connect", () => socket.write(JSON.stringify({ op: "dispatch", token: session.token, command }) + "\n"));
    socket.on("error", (e) => finish({ status: "blocked", reason: `terminal IPC disconnected: ${e.message}` }));
    socket.on("close", () => finish(completion ?? { status: "blocked", reason: "terminal closed without completion" }));
  });
}

// Serialize work per PTY and coalesce identical requests. When another
// listener process owns the PTY, join its durable result instead of repeatedly
// dispatching the same long-running command and filling the user's terminal.
export function dispatchTerminal(session, command, timeoutMs = 0) {
  const key = `${session?.socket ?? "missing"}\n${command}`;
  if (terminalInflight.has(key)) return terminalInflight.get(key);
  const socketKey = session?.socket ?? "missing";
  const prior = terminalQueues.get(socketKey) ?? Promise.resolve();
  const run = prior.catch(() => {}).then(async () => {
    // The PTY is the authority for cross-process work. On busy, wait for the
    // active job's transcript. Re-dispatch only after a *different* command
    // has finished; for the same command, reuse that one execution's result.
    for (;;) {
      const result = await dispatchTerminalNow(session, command, timeoutMs);
      if (result.status !== "busy") return result;
      if (!result.active_job) return { ...result, status: "blocked", reason: result.reason ?? "terminal is busy; active job id unavailable" };
      const activeCommand = result.active_command ?? "";
      const active = await waitForJob(session, result.active_job, activeCommand, timeoutMs);
      if (active.status !== "completed") return active;
      if (normalizeCommand(activeCommand, session.repo) === normalizeCommand(command, session.repo)) return active;
    }
  });
  terminalInflight.set(key, run);
  terminalQueues.set(socketKey, run);
  run.finally(() => {
    if (terminalInflight.get(key) === run) terminalInflight.delete(key);
    if (terminalQueues.get(socketKey) === run) terminalQueues.delete(socketKey);
  }).catch(() => {});
  return run;
}
