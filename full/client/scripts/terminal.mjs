#!/usr/bin/env node
// Small local terminal bridge used by registered_terminal QC checks.
// The session is local-only; commands are dispatched through a Unix socket.
import { createServer, createConnection } from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, hostname } from "node:os";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2), verb = args.shift();
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const home = homedir(), dir = join(home, ".config/agents-holding/terminal-sessions"), file = join(dir, "sessions.json");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const load = () => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } };
const save = (x) => writeFileSync(file, JSON.stringify(x, null, 1), { mode: 0o600 });
const id = `term-${randomBytes(9).toString("hex")}`;

if (verb === "register") {
  const company = value("--company") || null, repo = resolve(value("--repo") || process.cwd());
  const socket = `/tmp/ah-pty-${randomBytes(12).toString("hex")}.sock`;
  const token = randomBytes(32).toString("base64url");
  const server = createServer((conn) => {
    let buf = "";
    conn.on("data", (d) => {
      buf += d.toString();
      let n;
      while ((n = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, n); buf = buf.slice(n + 1);
        let req; try { req = JSON.parse(line); } catch { continue; }
        if (req.token !== token) { conn.end(JSON.stringify({ ok: false, error: "unauthorized" }) + "\n"); continue; }
        const child = spawn(String(req.command || ""), { cwd: req.cwd ? resolve(repo, req.cwd) : repo, shell: true, env: { ...process.env, CI: "1" } });
        let stdout = "", stderr = "", timer = null, finished = false;
        const finish = (code, error = "") => { if (finished) return; finished = true; if (timer) clearTimeout(timer); conn.end(JSON.stringify({ ok: code === 0, code: code ?? 1, stdout, stderr, error }) + "\n"); };
        child.stdout.on("data", (d) => { const s = d.toString(); stdout += s; process.stdout.write(s); });
        child.stderr.on("data", (d) => { const s = d.toString(); stderr += s; process.stderr.write(s); });
        child.on("error", (e) => finish(1, e.message));
        child.on("close", (code, signal) => finish(code, signal ? `terminated by ${signal}` : ""));
        const timeout = Number(req.timeout_ms) || 0;
        if (timeout > 0) timer = setTimeout(() => { try { child.kill("SIGTERM"); } catch {} }, timeout);
      }
    });
  });
  server.listen(socket, () => {
    const sessions = load(); sessions[id] = { session_id: id, token, status: "connected", transport: "pty", company, repo, cwd: repo, user_id: process.env.USER || "user", device_id: `mac-${hostname()}`, pid: process.pid, socket, allowlist: [], started_at: Date.now(), heartbeat_at: Date.now() }; save(sessions);
    console.log(JSON.stringify({ session_id: id, status: "connected", repo, socket, message: "terminal registered; keep this terminal open" }));
  });
  const heartbeat = setInterval(() => { const s = load(); if (s[id]) { s[id].heartbeat_at = Date.now(); save(s); } }, 15000);
  const close = () => { clearInterval(heartbeat); const s = load(); delete s[id]; save(s); try { unlinkSync(socket); } catch {} server.close(() => process.exit(0)); };
  process.on("SIGINT", close); process.on("SIGTERM", close);
  await new Promise(() => {});
}

if (verb === "dispatch") {
  const session = load()[args.shift()]; if (!session) throw new Error("terminal session not found");
  const command = args.join(" "), conn = createConnection(session.socket), chunks = [];
  conn.on("connect", () => conn.write(JSON.stringify({ token: session.token, command }) + "\n"));
  conn.on("data", (d) => chunks.push(d));
  conn.on("end", () => { const r = JSON.parse(Buffer.concat(chunks).toString().trim()); process.stdout.write((r.stdout || "") + (r.stderr || "")); process.exit(r.ok ? 0 : 1); });
  conn.on("error", (e) => { console.error(e.message); process.exit(1); });
  await new Promise(() => {});
}

if (verb === "status") { console.log(JSON.stringify(load(), null, 2)); process.exit(0); }
console.error("usage: holding terminal register --company <id> --repo <dir> | dispatch <session> <command> | status"); process.exit(2);
