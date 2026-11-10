// Runtime bridge for the user-registered PTY. The listener may dispatch only
// to a connected terminal bound to the exact company repo.
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

export function selectAvailableTerminal({ company, repo } = {}) {
  return Object.values(sessions()).filter((s) => s.status === "connected" && s.socket && s.token &&
    (!company || s.company === company) && (!repo || s.repo === repo) &&
    existsSync(s.socket))
    .sort((a, b) => timeMs(b.heartbeat_at) - timeMs(a.heartbeat_at))[0] ?? null;
}

// A terminal check may legitimately run for hours (large integration suites,
// device/UI tests). `timeoutMs=0` means no wall-clock timeout; disconnect and
// an explicit non-zero exit still fail immediately.
export function dispatchTerminal(session, command, timeoutMs = 0) {
  return new Promise((resolve) => {
    if (!session?.socket || !session?.token) return resolve({ status: "blocked", reason: "registered terminal is unavailable" });
    const socket = createConnection(session.socket), chunks = [];
    let completion = null, settled = false;
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.destroy(); } catch {} resolve(v); };
    const timer = timeoutMs > 0 ? setTimeout(() => finish({ status: "blocked", reason: "terminal command timed out" }), timeoutMs) : null;
    socket.on("data", (b) => {
      const raw = b.toString(); chunks.push(raw);
      for (const line of raw.split("\n")) { try { const x = JSON.parse(line); if (x.event === "completion") completion = x; } catch {} }
      if (completion) finish(completion);
    });
    socket.on("connect", () => socket.write(JSON.stringify({ op: "dispatch", token: session.token, command }) + "\n"));
    socket.on("error", (e) => finish({ status: "blocked", reason: `terminal IPC disconnected: ${e.message}` }));
    socket.on("close", () => finish(completion ?? { status: "blocked", reason: "terminal closed without completion" }));
  });
}
