import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ah-terminal-runtime-"));
process.env.HOME = dir;
const { dispatchTerminal, selectAvailableTerminal } = await import("../full/client/scripts/terminal-runtime.mjs");
const socketPath = join(dir, "terminal.sock");
const selectionSocket = join(dir, "selection.sock");
const sessionsDir = join(dir, ".config/agents-holding/terminal-sessions");
mkdirSync(sessionsDir, { recursive: true });
writeFileSync(selectionSocket, "test socket placeholder");
const now = new Date().toISOString();
const marlin = { session_id: "term-marlin", status: "connected", company: "marlin-language", repo: realpathSync(dir), socket: selectionSocket, token: "marlin-token", heartbeat_at: now };
const nail = { session_id: "term-nail", status: "connected", company: "nailly", repo: realpathSync(dir), socket: selectionSocket, token: "nail-token", heartbeat_at: now };
writeFileSync(join(sessionsDir, "sessions.json"), JSON.stringify({ [marlin.session_id]: marlin, [nail.session_id]: nail }));
assert.equal(selectAvailableTerminal({ company: "marlin-language", repo: dir })?.session_id, marlin.session_id);
assert.equal(selectAvailableTerminal({ company: "nailly", repo: dir })?.session_id, nail.session_id);
assert.equal(selectAvailableTerminal({ company: "marlin-language", repo: join(dir, "missing") }), null);
assert.equal(selectAvailableTerminal({}), null);
const server = createServer((socket) => {
  let request = "";
  socket.on("data", (chunk) => {
    request += chunk.toString();
    if (!request.includes("\n")) return;
    const message = JSON.parse(request.split("\n", 1)[0]);
    assert.equal(message.op, "dispatch");
    socket.write("MPM: 70% configure\nMPM: 80% compile\n");
    socket.end(JSON.stringify({ event: "completion", command: message.command, exit_code: 1, job_id: "job-test" }) + "\n");
  });
});
await new Promise((resolve, reject) => server.listen(socketPath, (error) => error ? reject(error) : resolve()));
try {
  const result = await dispatchTerminal({ socket: socketPath, token: "test-token" }, "./run_tests.sh --all");
  assert.equal(result.exit_code, 1);
  assert.match(result.transcript, /MPM: 70% configure/);
  assert.match(result.transcript, /MPM: 80% compile/);
  assert.doesNotMatch(result.transcript, /"event":"completion"/);
  console.log("terminal_runtime_test: full terminal transcript preserved");
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
