#!/usr/bin/env node
// Explicit user-bound terminal registry. No window/process guessing.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { deviceId } from "./skills.mjs";
import * as Registry from "./registry.mjs";
const dir = join(homedir(), ".config/agents-holding/terminal-sessions"), file = join(dir, "sessions.json");
const load = () => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } }, save = (x) => { mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(file, JSON.stringify(x, null, 1), { mode: 0o600 }); };
const args = process.argv.slice(2), cmd = args.shift(), val = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; }, expired = (s) => s.expires_at ? new Date(s.expires_at).getTime() < Date.now() : false, db = load();
try { for (const f of readdirSync(dir).filter((x) => x.startsWith("pty-") && x.endsWith(".json"))) { const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.session_id) db[s.session_id] = s; } } catch {}
const shell = process.env.SHELL || "unknown", toolchain = (() => { try { return execFileSync("/usr/bin/env", ["bash", "-lc", "node --version; git --version"], { encoding: "utf8" }).trim(); } catch { return process.version; } })();
const usage = () => { console.error("usage: holding terminal register [--company C] [--repo PATH] | dispatch <session-id> <command> | status [<session-id>] | unregister <session-id> | heartbeat <session-id> | approve <session-id> | cancel <session-id>"); process.exit(2); };
export function selectAvailableTerminal(sessions, { company, repo } = {}) { return Object.values(sessions).filter((s) => s.status === "connected" && s.socket && existsSync(s.socket) && s.heartbeat_at && Date.now() - new Date(s.heartbeat_at).getTime() < 90000 && (!company || s.company === company) && (!repo || s.repo === repo)).sort((a, b) => new Date(b.heartbeat_at) - new Date(a.heartbeat_at))[0] ?? null; }
export function terminalScopeMatches(session, { company, repo, parentCompany = null } = {}) { if (!session || session.status !== "connected") return false; if (repo && realpathSync(resolve(repo)) !== session.repo) return false; return !!(session.company === company || (parentCompany && session.company === parentCompany)); }
if (cmd === "register") {
  const rp = val("--repo") || process.cwd(); let repoPath = rp;
  if (!existsSync(repoPath)) { try { const hit = Registry.load(homedir()).projects.find((p) => p.name === rp || p.path === rp); repoPath = hit?.path ?? rp; } catch {} }
  const repo = realpathSync(resolve(repoPath)); if (!existsSync(repo)) { console.error("repo/name does not resolve to a registered repo"); process.exit(1); }
  if (realpathSync(process.cwd()) !== repo) { console.error(`wrong repo/cwd: cd to ${repo} before registering this terminal`); process.exit(1); }
  let company = val("--company") || process.env.AH_COMPANY || null; if (!company) { try { company = Registry.load(homedir()).projects.find((p) => realpathSync(resolve(p.path)) === repo)?.company ?? null; } catch {} }
  if (process.platform === "darwin" && process.env.AH_TERMINAL_TEST_METADATA !== "1") { const state = join(dir, `pty-${Buffer.from(repo).toString("hex").slice(0, 24)}.json`); mkdirSync(dir, { recursive: true, mode: 0o700 }); const py = fileURLToPath(new URL("./terminal_pty.py", import.meta.url)); const r = spawnSync("python3", [py, "--repo", repo, "--company", company ?? "", "--state", state], { stdio: "inherit" }); process.exit(r.status ?? 1); }
  const id = `term-${randomUUID()}`, now = new Date().toISOString();
  const s = { session_id: id, status: "connected", company, user_id: process.env.USER ?? "unknown", device_id: deviceId() || `device-${hostname()}`, device_host: hostname(), repo, cwd: process.cwd(), shell, toolchain, registered_at: now, heartbeat_at: now, consent: "user_registered" };
  db[id] = s; save(db); console.log(JSON.stringify({ ...s, message: "Terminal registered. Listener may select it only for this company/repo/policy." }, null, 2));
} else if (cmd === "dispatch") {
  const s = db[args[0]]; const command = args.slice(1).join(" "); if (!s || !command) usage();
  if (s.status !== "connected" || !s.socket) { console.error("terminal disconnected; run holding terminal register again"); process.exit(1); }
  const c = createConnection(s.socket); let out=""; let completion = null;
  c.on("data", (b) => { const text = b.toString(); out += text; process.stdout.write(b); for (const line of text.split("\n")) { try { const x = JSON.parse(line); if (x.event === "completion") completion = x; } catch {} } });
  c.on("connect", () => c.write(JSON.stringify({ op: "dispatch", token: s.token, command }) + "\n"));
  c.on("error", () => { console.error("terminal IPC disconnected"); process.exitCode=1; });
  c.on("close", () => { if (!completion || completion.command !== command || completion.repo !== s.repo || completion.cwd !== s.cwd || completion.exit_code !== 0) process.exitCode=1; });
} else if (cmd === "unregister") {
  const id = args[0], s = db[id]; if (!s) { console.error("unknown terminal session"); process.exit(1); }
  if (s.socket && s.token) { const c=createConnection(s.socket); c.on("connect",()=>c.write(JSON.stringify({op:"unregister",token:s.token})+"\n")); c.on("data",()=>c.destroy()); c.on("error",()=>{}); }
  s.status = "unregistered"; s.unregistered_at = new Date().toISOString(); save(db); console.log(`${id} unregistered`);
} else if (cmd === "heartbeat") {
  const s = db[args[0]]; if (!s || s.status !== "connected") { console.error("terminal is not connected; run holding terminal register again"); process.exit(1); }
  if (s.socket && s.token) { const c=createConnection(s.socket); c.on("connect",()=>c.write(JSON.stringify({op:"heartbeat",token:s.token})+"\n")); c.on("data",()=>c.destroy()); c.on("error",()=>{}); }
  s.heartbeat_at = new Date().toISOString(); save(db); console.log(`${s.session_id} heartbeat ok`);
} else if (cmd === "link") {
  const token = args[0], rp = val("--repo"); if (!token || !rp) usage();
  if (!/^ahterm_[A-Za-z0-9_-]{8,160}$/.test(token)) { console.error("invalid terminal token: request a fresh one from CEO/chat"); process.exit(1); }
  const repo = realpathSync(resolve(rp)); if (!existsSync(repo)) { console.error("repo does not exist"); process.exit(1); }
  if (realpathSync(process.cwd()) !== repo) { console.error(`wrong repo/cwd: cd to ${repo} before linking this terminal`); process.exit(1); }
  if (Object.values(db).some((s) => s.token === token && !expired(s) && s.status !== "cancelled")) { console.error("terminal token already linked"); process.exit(1); }
  const id = `term-${randomUUID()}`, s = { session_id: id, token, status: "connected", user_id: process.env.USER ?? "unknown", device_id: deviceId() || `device-${hostname()}`, device_host: hostname(), repo, cwd: process.cwd(), linked_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(), consent: "pending" }; db[id] = s; save(db);
  console.log(JSON.stringify({ ...s, next: `holding terminal approve ${id}` }, null, 2));
} else if (cmd === "status") {
  const id = args.find((x) => !x.startsWith("-")) ?? null;
  const company = val("--company"), repoArg = val("--repo");
  let repoFilter = null; try { repoFilter = repoArg ? realpathSync(resolve(repoArg)) : null; } catch {}
  const xs = Object.values(db).filter((s) => (!id || s.session_id === id) && (!company || s.company === company) && (!repoFilter || s.repo === repoFilter));
  if (!xs.length) { console.log("no terminal sessions"); process.exit(0); }
  for (const s of xs) {
    if (s.status === "connected" && s.socket && !existsSync(s.socket)) s.status = "disconnected";
    if (expired(s) && s.status === "connected") s.status = "expired";
    console.log(`${s.session_id} ${s.status} repo=${s.repo} cwd=${s.cwd} user=${s.user_id} device=${s.device_id} expires=${s.expires_at}`);
  }
  save(db);
} else if (cmd === "approve" || cmd === "cancel") {
  const s = db[args[0]]; if (!s) { console.error("unknown session; ask CEO/chat for a fresh request"); process.exit(1); }
  if (expired(s)) { s.status = "expired"; save(db); console.error("session expired; request a fresh token from CEO/chat"); process.exit(1); }
  if (cmd === "approve") { if (s.cwd !== process.cwd()) { console.error(`wrong cwd: session is bound to ${s.cwd}`); process.exit(1); } s.consent = "approved"; s.approved_at = new Date().toISOString(); } else { s.status = "cancelled"; s.cancelled_at = new Date().toISOString(); }
  save(db); console.log(JSON.stringify(s, null, 2));
} else usage();
