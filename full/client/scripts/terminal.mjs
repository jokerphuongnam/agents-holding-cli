#!/usr/bin/env node
// Explicit user-bound terminal registry. No window/process guessing.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { deviceId } from "./skills.mjs";
import * as Registry from "./registry.mjs";
import * as Company from "./company.mjs";
const dir = join(homedir(), ".config/agents-holding/terminal-sessions"), file = join(dir, "sessions.json");
const load = () => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } }, save = (x) => {
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(file, JSON.stringify(x, null, 1), { mode: 0o600 }); return true; }
  catch (e) { console.error(`terminal session store unavailable: ${e.message}`); return false; }
};
const args = process.argv.slice(2), cmd = args.shift(), val = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; }, expired = (s) => s.expires_at ? new Date(s.expires_at).getTime() < Date.now() : false, db = load();
try { for (const f of readdirSync(dir).filter((x) => x.startsWith("pty-") && x.endsWith(".json"))) { const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.session_id) db[s.session_id] = s; } } catch {}
const shell = process.env.SHELL || "unknown", toolchain = (() => { try { return execFileSync("/usr/bin/env", ["bash", "-lc", "node --version; git --version"], { encoding: "utf8" }).trim(); } catch { return process.version; } })();
const usage = () => { console.error("usage: holding terminal register [--company C] [--repo PATH] | dispatch [--company C] [--repo PATH] <session-id> \"<command>\" | status [--company C] [--repo PATH] [<session-id>] | unregister|heartbeat|approve|cancel [--company C] [--repo PATH] <session-id>"); process.exit(2); };
const valueFlags = new Set(["--company", "--repo"]);
function parseScopedArgs(argv) {
  let company = null, repo = null;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (valueFlags.has(argv[i])) {
      const value = argv[++i];
      if (!value) usage();
      if (argv[i - 1] === "--company") company = value;
      else repo = value;
    } else positional.push(argv[i]);
  }
  return { company, repo, positional };
}
function companiesForRepo(repo) {
  let reg;
  try { reg = Registry.load(homedir()); } catch { return []; }
  const matches = (reg?.projects ?? []).flatMap((p) => {
    try {
      const path = realpathSync(resolve(p.path));
      return repo === path || repo.startsWith(path + "/")
        ? [{ path, companies: (p.boards ?? []).map((b) => b.company).filter(Boolean) }]
        : [];
    } catch { return []; }
  }).sort((a, b) => b.path.length - a.path.length);
  if (!matches.length) return [];
  const longest = matches[0].path.length;
  return [...new Set(matches.filter((p) => p.path.length === longest).flatMap((p) => p.companies))];
}
function resolveScope(argv = args, { required = true } = {}) {
  const parsed = parseScopedArgs(argv);
  let repo = null;
  if (parsed.repo) {
    try { repo = realpathSync(resolve(parsed.repo)); }
    catch {
      const hit = Registry.load(homedir())?.projects?.find((p) => p.name === parsed.repo || p.path === parsed.repo);
      try { repo = hit ? realpathSync(resolve(hit.path)) : null; } catch {}
      if (!repo) { console.error(`repo does not resolve: ${parsed.repo}`); process.exit(2); }
    }
  } else if (cmd === "register" || cmd === "link") {
    try { repo = realpathSync(resolve(val("--repo") || process.cwd())); } catch {}
  }
  const cwd = repo ?? process.cwd();
  let company = parsed.company ?? process.env.AH_COMPANY ?? null;
  if (!company) {
    const registered = companiesForRepo(cwd);
    if (registered.length === 1) company = registered[0];
    else if (registered.length > 1) {
      const local = Company.resolveCompany({ argv, cwd, home: homedir() }).company;
      if (local && registered.includes(local)) company = local;
      else {
        const active = Company.getActive(homedir());
        if (active && registered.includes(active)) company = active;
      }
      if (!company) {
        console.error(`company is ambiguous for ${cwd}; pass --company from this repo's local company config`);
        process.exit(2);
      }
    }
  }
  if (!company) company = Company.resolveCompany({ argv, cwd, home: homedir() }).company;
  if (!company && required) {
    console.error("no company context; pass --company or run holding company use inside this company");
    process.exit(2);
  }
  return { company, repo, positional: parsed.positional };
}
function requireSession(id, scope) {
  const s = db[id];
  if (!scope.company || !s || s.company !== scope.company) {
    console.error(`terminal session is not registered in company ${scope.company ?? "<unresolved>"}`);
    process.exit(1);
  }
  if (scope.repo && s.repo !== scope.repo) {
    console.error(`terminal session belongs to a different repo in company ${scope.company}`);
    process.exit(1);
  }
  return s;
}
export function selectAvailableTerminal(sessions, { company, repo } = {}) {
  if (!company || !repo) return null;
  return Object.values(sessions).filter((s) => s.status === "connected" && s.socket && existsSync(s.socket) && s.heartbeat_at && Date.now() - new Date(s.heartbeat_at).getTime() < 90000 && s.company === company && s.repo === repo).sort((a, b) => new Date(b.heartbeat_at) - new Date(a.heartbeat_at))[0] ?? null;
}
export function terminalScopeMatches(session, { company, repo } = {}) {
  if (!session || session.status !== "connected" || !company || session.company !== company) return false;
  if (!repo) return true;
  try { return realpathSync(resolve(repo)) === session.repo; } catch { return false; }
}
if (cmd === "register") {
  const rp = val("--repo") || process.cwd(); let repoPath = rp;
  if (!existsSync(repoPath)) { try { const hit = Registry.load(homedir()).projects.find((p) => p.name === rp || p.path === rp); repoPath = hit?.path ?? rp; } catch {} }
  const repo = realpathSync(resolve(repoPath)); if (!existsSync(repo)) { console.error("repo/name does not resolve to a registered repo"); process.exit(1); }
  if (realpathSync(process.cwd()) !== repo) { console.error(`wrong repo/cwd: cd to ${repo} before registering this terminal`); process.exit(1); }
  const company = resolveScope([...args, "--repo", repo]).company;
  if (process.platform === "darwin" && process.env.AH_TERMINAL_TEST_METADATA !== "1") { const repoHash = createHash("sha256").update(repo).digest("hex").slice(0, 32); const state = join(dir, `pty-${repoHash}.json`); mkdirSync(dir, { recursive: true, mode: 0o700 }); const py = fileURLToPath(new URL("./terminal_pty.py", import.meta.url)); const r = spawnSync("python3", [py, "--repo", repo, "--company", company, "--state", state], { stdio: "inherit" }); process.exit(r.status ?? 1); }
  const id = `term-${randomUUID()}`, now = new Date().toISOString();
  const s = { session_id: id, status: "connected", company, user_id: process.env.USER ?? "unknown", device_id: deviceId() || `device-${hostname()}`, device_host: hostname(), repo, cwd: process.cwd(), shell, toolchain, registered_at: now, heartbeat_at: now, consent: "user_registered" };
  db[id] = s; save(db); console.log(JSON.stringify({ ...s, message: "Terminal registered. Listener may select it only for this company/repo/policy." }, null, 2));
} else if (cmd === "dispatch") {
  const scope = resolveScope(args), [id, ...commandParts] = scope.positional;
  const s = requireSession(id, scope), command = commandParts.join(" "); if (!id || !command) usage();
  if (s.status !== "connected" || !s.socket) { console.error("terminal disconnected; run holding terminal register again"); process.exit(1); }
  const c = createConnection(s.socket); let out=""; let completion = null;
  c.on("data", (b) => { const text = b.toString(); out += text; process.stdout.write(b); for (const line of text.split("\n")) { try { const x = JSON.parse(line); if (x.event === "completion") completion = x; } catch {} } });
  c.on("connect", () => c.write(JSON.stringify({ op: "dispatch", token: s.token, command }) + "\n"));
  c.on("error", () => { console.error("terminal IPC disconnected"); process.exitCode=1; });
  c.on("close", () => { if (!completion || completion.command !== command || completion.repo !== s.repo || completion.cwd !== s.cwd || completion.exit_code !== 0) process.exitCode=1; });
} else if (cmd === "unregister") {
  const scope = resolveScope(args), [id] = scope.positional, s = requireSession(id, scope);
  if (s.socket && s.token) { const c=createConnection(s.socket); c.on("connect",()=>c.write(JSON.stringify({op:"unregister",token:s.token})+"\n")); c.on("data",()=>c.destroy()); c.on("error",()=>{}); }
  s.status = "unregistered"; s.unregistered_at = new Date().toISOString(); save(db); console.log(`${id} unregistered`);
} else if (cmd === "heartbeat") {
  const scope = resolveScope(args), [id] = scope.positional, s = requireSession(id, scope); if (s.status !== "connected") { console.error("terminal is not connected; run holding terminal register again"); process.exit(1); }
  if (s.socket && s.token) { const c=createConnection(s.socket); c.on("connect",()=>c.write(JSON.stringify({op:"heartbeat",token:s.token})+"\n")); c.on("data",()=>c.destroy()); c.on("error",()=>{}); }
  s.heartbeat_at = new Date().toISOString(); save(db); console.log(`${s.session_id} heartbeat ok`);
} else if (cmd === "link") {
  const [token] = parseScopedArgs(args).positional, rp = val("--repo"); if (!token || !rp) usage();
  if (!/^ahterm_[A-Za-z0-9_-]{8,160}$/.test(token)) { console.error("invalid terminal token: request a fresh one from CEO/chat"); process.exit(1); }
  const repo = realpathSync(resolve(rp)); if (!existsSync(repo)) { console.error("repo does not exist"); process.exit(1); }
  if (realpathSync(process.cwd()) !== repo) { console.error(`wrong repo/cwd: cd to ${repo} before linking this terminal`); process.exit(1); }
  const scope = resolveScope(args);
  if (Object.values(db).some((s) => s.token === token && !expired(s) && s.status !== "cancelled")) { console.error("terminal token already linked"); process.exit(1); }
  const id = `term-${randomUUID()}`, s = { session_id: id, token, status: "connected", company: scope.company, user_id: process.env.USER ?? "unknown", device_id: deviceId() || `device-${hostname()}`, device_host: hostname(), repo, cwd: process.cwd(), linked_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(), consent: "pending" }; db[id] = s; save(db);
  console.log(JSON.stringify({ ...s, next: `holding terminal approve ${id}` }, null, 2));
} else if (cmd === "status") {
  const scope = resolveScope(args), [id] = scope.positional;
  const xs = id ? [requireSession(id, scope)] : Object.values(db).filter((s) => s.company === scope.company && (!scope.repo || s.repo === scope.repo));
  if (!xs.length) { console.log("no terminal sessions"); process.exit(0); }
  for (const s of xs) {
    if (s.status === "connected" && s.socket && !existsSync(s.socket)) s.status = "disconnected";
    if (expired(s) && s.status === "connected") s.status = "expired";
    console.log(`${s.session_id} ${s.status} repo=${s.repo} cwd=${s.cwd} user=${s.user_id} device=${s.device_id} expires=${s.expires_at}`);
  }
  save(db);
} else if (cmd === "cancel") {
  const scope = resolveScope(args), [id] = scope.positional, s = requireSession(id, scope); if (s.status !== "connected" || !s.socket || !s.token) { console.error("terminal is not connected; no command was cancelled"); process.exit(1); }
  const c = createConnection(s.socket); let acknowledged = false, response = "";
  c.on("connect", () => c.write(JSON.stringify({ op: "cancel", token: s.token }) + "\n"));
  c.on("data", (b) => { response += b.toString(); for (const line of response.split("\n")) { try { const x = JSON.parse(line); if (x.ok) { acknowledged = true; console.log(JSON.stringify(x)); } } catch {} } });
  c.on("error", (e) => { console.error(`terminal IPC disconnected: ${e.message}`); process.exitCode = 1; });
  c.on("close", () => { if (!acknowledged) process.exitCode = 1; });
} else if (cmd === "approve") {
  const scope = resolveScope(args), [id] = scope.positional, s = requireSession(id, scope);
  if (expired(s)) { s.status = "expired"; save(db); console.error("session expired; request a fresh token from CEO/chat"); process.exit(1); }
  const cwd = scope.repo ?? realpathSync(process.cwd());
  if (s.cwd !== cwd) { console.error(`wrong cwd: session is bound to ${s.cwd}`); process.exit(1); } s.consent = "approved"; s.approved_at = new Date().toISOString();
  save(db); console.log(JSON.stringify(s, null, 2));
} else usage();
