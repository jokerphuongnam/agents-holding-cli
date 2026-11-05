#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// Unified staff policy, client side: cache, defaults on add/first launch, translation into each agent CLI's native config, OS sandbox,
// deny stubs/replacements, secret redaction. One config per staff (server: staff_policy_get/set); holding turns it into:
//   Claude Code  --settings <file>: permissions.allow/deny (Read/Edit/Bash) + PreToolUse hook (denied reads -> stub/replacement)
//   Codex CLI    $CODEX_HOME/rules/ah-staff.rules (execpolicy forbidden prefixes) + -c sandbox_mode=workspace-write
//   Grok CLI     --deny/--allow rules (Read/Edit/Bash) + $GROK_HOME/hooks/ah-policy.json PreToolUse hook (+ optional --sandbox profile)
//   OS sandbox   macOS sandbox-exec (deny file-read*/write* on denied paths, whole process tree); Linux bubblewrap (stub bind-mounted
//                over denied files); Windows: none (native rules + hook only, documented)
// CLI: node policy.mjs init <role> [--company C] | show <role> | sync [role] | native <role> | exec <role> -- <cmd...> | hook | scan <file>
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "./policy-core.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();
export * from "./policy-core.mjs";
const here = dirname(fileURLToPath(import.meta.url));
export const stateDir = (home, co) => join(home, ".config/agents-holding/state", co);
export const cachePath = (home, co) => join(stateDir(home, co), "policy.json");
const readJ = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };

/** Cached effective policy for a staff. Missing -> role defaults are written (new staff, or existing staff on first launch). */
export function loadPolicy(home, co, role) {
  const c = readJ(cachePath(home, co), { staff: {} });
  if (c.staff?.[role]) return c.staff[role];
  const p = C.mergePolicy(role, c.company ? { ...c.company, __company: true } : null);
  savePolicy(home, co, role, p, { defaulted: true }); return p;
}
export function savePolicy(home, co, role, p, meta = {}) {
  mkdirSync(stateDir(home, co), { recursive: true, mode: 0o700 });
  const c = readJ(cachePath(home, co), { staff: {} }); c.staff ??= {}; c.staff[role] = { ...p, ...(meta.defaulted ? { _defaulted: true } : {}) };
  if (meta.company !== undefined) c.company = meta.company; c.updated_at = new Date().toISOString();
  writeFileSync(cachePath(home, co), JSON.stringify(c, null, 2), { mode: 0o600 });
}
/** Best effort: fetch the server policy (owner-edited) into the cache. Offline -> cache/defaults stay. */
export async function syncPolicy(home, co, role, mcp) {
  try { const d = await mcp("staff_policy_get", { company: co, staff: role }); savePolicy(home, co, role, d.effective, { company: d.company ?? null }); return d.effective; }
  catch { return loadPolicy(home, co, role); }
}
/** Free-text + git rules injected into the staff's instructions (context file). */
export function rulesText(p) {
  const g = p.rules?.git, L = ["## Company rules for this staff (holding policy)", ...(p.rules?.text ?? []).map((t) => `- ${t}`)];
  if (g) L.push("### Git conventions (checked; violations are rejected)", `- Branch name must match: ${g.branch_pattern}`, `- Commit message first line must match: ${g.commit_format}`,
    `- PR title must match: ${g.pr_title_pattern}`, `- PR body must contain sections: ${(g.pr_required_sections ?? []).join(", ")}`, ...(g.pr_template ? [`- PR body template:\n${g.pr_template}`] : []),
    `- Never push to: ${(g.protected_branches ?? []).join(", ")}${p.permissions?.push_protected ? " (allowed for you)" : ""}`, ...(g.reviewers?.length ? [`- Request reviewers: ${g.reviewers.join(", ")}`] : []), ...(g.labels?.length ? [`- Add labels: ${g.labels.join(", ")}`] : []));
  const no = C.PERMISSIONS.filter((k) => !p.permissions?.[k]); if (no.length) L.push(`- Not allowed for you: ${no.join(", ")}`);
  L.push("- Some files are blocked by policy; reading them returns a notice or a substitute file. Never guess their content.");
  return L.join("\n");
}
// ---- glob -> CLI rule / sandbox regex ----
const absGlob = (g, home, cwd) => g.startsWith("~/") ? home + g.slice(1) : g.startsWith("/") ? g : g.includes("/") && !g.startsWith("**/") ? join(cwd, g.replace(/\/$/, "")) : null;
function globRe(g, home, cwd) { // full-path regex for Seatbelt
  const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"), conv = (s) => esc(s).replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
  const a = absGlob(g, home, cwd);
  if (a) { const r = conv(a); return `^${r.startsWith("/private") ? r : `(/private)?${r}`}(/.*)?$`; }
  // relative/basename globs apply under the project and the home folder only (system files such as /etc/ssl/cert.pem stay readable)
  const roots = [...new Set([cwd, home].map((r) => esc(r).replace(/^\/private/, "")))].join("|");
  return `^(/private)?(${roots})/(.*/)?${conv(g.replace(/^\*\*\//, "").replace(/\/$/, ""))}(/.*)?$`;
}
const claudePath = (g) => g.startsWith("~/") || g.startsWith("/") ? (g.startsWith("/") ? "/" + g : g) : g.startsWith("**/") ? g : g.includes("/") ? `./${g.replace(/\/$/, "/**")}` : `**/${g}`;
export function nativeConfigs(p, { home, co, role, hookCmd }) {
  const deny = p.files.deny, sh = p.shell;
  const claude = { permissions: { allow: sh.allow.map((x) => `Bash(${x}:*)`), deny: [...deny.flatMap((g) => [`Read(${claudePath(g)})`, `Edit(${claudePath(g)})`]), ...sh.deny.map((x) => `Bash(${x}:*)`)] },
    hooks: { PreToolUse: [{ matcher: "Read|Edit|Write|MultiEdit|Grep|Glob|NotebookEdit|Bash", hooks: [{ type: "command", command: hookCmd }] }] } };
  const codexRules = sh.deny.map((x) => `prefix_rule(pattern=${JSON.stringify(x.split(/\s+/))}, decision="forbidden")`)
    .concat(deny.map((g) => `prefix_rule(pattern=["cat", ${JSON.stringify(g)}], decision="forbidden")`)).join("\n") + "\n";
  const grokArgs = [...deny.flatMap((g) => ["--deny", `Read(${claudePath(g)})`, "--deny", `Edit(${claudePath(g)})`]), ...sh.deny.flatMap((x) => ["--deny", `Bash(${x} *)`]), ...sh.allow.flatMap((x) => ["--allow", `Bash(${x} *)`])];
  const grokHook = { hooks: { PreToolUse: [{ hooks: [{ type: "command", command: hookCmd }] }] } };
  const grokSandbox = `[profiles.ah-staff]\nextends = "workspace"\ndeny = ${JSON.stringify(deny.map((g) => g.includes("/") || g.startsWith("~") ? g : `**/${g}`))}\n`;
  return { claude, codexRules, grokArgs, grokHook, grokSandbox };
}
export function seatbeltProfile(p, { home, cwd, allowRead = [] }) {
  const res = p.files.deny.map((g) => globRe(g, home, cwd));
  return ["(version 1)", "(allow default)", ...res.map((r) => `(deny file-read* file-write* (regex #"${r.replace(/"/g, '\\"')}"))`),
    ...allowRead.map((f) => `(allow file-read* (literal "${f}"))`)].join("\n") + "\n";
}
/** Files under dir (depth-limited) that a policy denies: for bubblewrap overlays and tests. */
export function deniedFiles(p, dir, home, depth = 4) {
  const out = []; const walk = (d, n) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const f = join(d, e.name); if (C.fileDenied(p, f, home) || C.fileDenied(p, relative(dir, f), home)) { out.push(f); continue; }
      if (e.isDirectory() && n > 0 && e.name !== "node_modules" && e.name !== ".git") walk(f, n - 1); } };
  walk(dir, depth); return out;
}
export function stubFor(p, path, { home, cwd }) {
  const rel = relative(cwd, resolve(cwd, path)), abs = resolve(cwd, path);
  if (!C.fileDenied(p, abs, home) && !C.fileDenied(p, rel, home)) return null;
  return C.denyStub({ ...p, files: { ...p.files, deny: p.files.deny } }, C.fileDenied(p, rel, home) ? rel : abs, home, (f) => { try { return readFileSync(resolve(cwd, f), "utf8"); } catch { return null; } });
}
const stubFile = (home, co, text) => { const d = join(stateDir(home, co), "stubs"); mkdirSync(d, { recursive: true }); const f = join(d, createHash("sha256").update(text).digest("hex").slice(0, 16) + ".txt"); if (!existsSync(f)) writeFileSync(f, text); return f; };
const logDenied = (home, co, role, what) => { try { appendFileSync(join(stateDir(home, co), "policy-denials.log"), `${new Date().toISOString()} ${role} ${what.slice(0, 200)}\n`); } catch {} };

/** Prepare one staff launch: write native configs, add CLI flags, wrap in the OS sandbox, set env for the hook. Returns {bin,args,env}. */
export function wrapLaunch({ home = homedir(), co, role, bin, args, env = process.env, cwd = process.cwd(), platform = process.platform }) {
  if (!co || !role || env.AH_POLICY === "off") return { bin, args, env };
  const p = loadPolicy(home, co, role), kind = basename(bin).replace(/\.exe$/, ""), nd = join(stateDir(home, co), "native", role); mkdirSync(nd, { recursive: true });
  const hookCmd = `${JSON.stringify(process.execPath)} ${JSON.stringify(join(here, "policy.mjs"))} hook`;
  const N = nativeConfigs(p, { home, co, role, hookCmd }); let a = [...args]; const e = { ...env, AH_COMPANY: co, AH_STAFF: role, AH_POLICY_CWD: cwd };
  if (kind === "claude") { const f = join(nd, "claude-settings.json"); writeFileSync(f, JSON.stringify(N.claude, null, 2)); a.push("--settings", f); }
  if (kind === "codex") { const ch = e.CODEX_HOME; if (ch) try { mkdirSync(join(ch, "rules"), { recursive: true }); writeFileSync(join(ch, "rules", "ah-staff.rules"), N.codexRules); } catch {}
    if (!a.some((x) => x === "-s" || x === "--sandbox" || /sandbox_mode/.test(x) || x === "--dangerously-bypass-approvals-and-sandbox")) a.splice(a[0] === "exec" ? 1 : 0, 0, "-c", 'sandbox_mode="workspace-write"'); }
  if (kind === "grok") { a.push(...N.grokArgs); const gh = e.GROK_HOME; if (gh) { try { mkdirSync(join(gh, "hooks"), { recursive: true }); writeFileSync(join(gh, "hooks", "ah-policy.json"), JSON.stringify(N.grokHook, null, 2));
      if (e.AH_GROK_SANDBOX === "1") { writeFileSync(join(gh, "sandbox.toml"), N.grokSandbox); a.push("--sandbox", "ah-staff"); } } catch {} } }
  writeFileSync(join(nd, "README.txt"), `Generated by holding on launch from the unified staff policy (${role}). Do not edit: holding staff policy ...\n`);
  // OS sandbox for the whole process tree
  if (platform === "darwin" && existsSync("/usr/bin/sandbox-exec") && env.AH_SANDBOX !== "off") { const sb = join(nd, "sandbox.sb"); writeFileSync(sb, seatbeltProfile(p, { home, cwd })); return { bin: "/usr/bin/sandbox-exec", args: ["-f", sb, bin, ...a], env: e, sandbox: "sandbox-exec" }; }
  if (platform === "linux" && env.AH_SANDBOX !== "off") { const bw = (() => { try { return execFileSync("sh", ["-c", "command -v bwrap"], { encoding: "utf8" }).trim(); } catch { return ""; } })();
    if (bw) { const ov = []; for (const f of [...deniedFiles(p, cwd, home), ...deniedFiles(p, home, home, 1)]) { const s = stubFile(home, co, stubFor(p, f, { home, cwd }) ?? C.DENY_WARNING);
        try { ov.push(...(statSync(f).isDirectory() ? ["--tmpfs", f] : ["--ro-bind", s, f])); } catch {} }
      return { bin: bw, args: ["--bind", "/", "/", "--dev", "/dev", "--proc", "/proc", ...ov, "--", bin, ...a], env: e, sandbox: "bwrap" }; } }
  return { bin, args: a, env: e, sandbox: "none" };
}
/** Redact key-like content of prompt/context before it is sent to a model. */
export const redactText = (s) => C.redact(s).text;

// ---- hook (Claude Code / Grok PreToolUse): denied read -> read the stub/replacement instead; denied write/shell -> deny with notice ----
export function hookDecision(input, { home = homedir(), env = process.env } = {}) {
  const co = env.AH_COMPANY, role = env.AH_STAFF; if (!co || !role) return null;
  const p = loadPolicy(home, co, role), cwd = input.cwd ?? env.AH_POLICY_CWD ?? process.cwd(), ti = input.tool_input ?? {}, tool = String(input.tool_name ?? "");
  const pathKey = ["file_path", "path", "target_file", "notebook_path", "file"].find((k) => typeof ti[k] === "string");
  if (pathKey) { const stub = stubFor(p, ti[pathKey], { home, cwd }); if (stub === null) return null; logDenied(home, co, role, `${tool} ${ti[pathKey]}`);
    if (/read/i.test(tool)) { const f = stubFile(home, co, stub); return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "holding policy: substitute", updatedInput: { ...ti, [pathKey]: f } } }; }
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: stub || C.DENY_WARNING } }; }
  const cmd = typeof ti.command === "string" ? ti.command : typeof ti.cmd === "string" ? ti.cmd : null;
  if (cmd) { const hit = cmd.split(/[\s;|&<>()'"`]+/).filter(Boolean).find((w) => !w.startsWith("-") && (C.fileDenied(p, resolve(cwd, w), home) || C.fileDenied(p, w, home)));
    const bad = p.shell.deny.find((d) => cmd.trim() === d || cmd.trim().startsWith(d + " "));
    if (hit || bad) { logDenied(home, co, role, `${tool} ${cmd}`); const stub = hit ? stubFor(p, hit, { home, cwd }) : null;
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: hit ? (stub ?? C.DENY_WARNING) : `holding policy: command "${bad}" is not allowed for this staff.` } }; } }
  return null;
}
/** Replacement file check: warn (and refuse without --force) when it looks like it holds real secrets. */
export function scanReplacement(file) { const t = readFileSync(file, "utf8"), r = C.redact(t); return { ok: r.count === 0, findings: r.count }; }

// ---- interactive review when a staff is added (arrow-key menu; AH_NONINTERACTIVE=1 -> defaults) ----
async function initStaff(home, co, role, mcp) {
  const p = C.mergePolicy(role); let m = null; try { m = await import("./menu.mjs"); } catch {}
  const show = () => console.log(`\nPolicy for ${role} (role defaults):\n${rulesText(p)}\n  file deny: ${p.files.deny.length} entries (${p.files.deny.slice(0, 6).join(", ")}, ...)\n  shell deny: ${p.shell.deny.join(" | ")}`);
  show();
  const pick = m?.select ? await m.select("Review this staff's policy:", ["Accept defaults", "Add a rule", "Toggle a permission", "Add a denied path", "Edit git rules (branch/commit/PR)"]) : null;
  const ask = async (q) => { const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout }); const a = await rl.question(q); rl.close(); return a.trim(); };
  const patch = {};
  if (pick === 1) { const t = await ask("Rule text: "); if (t) (patch.rules ??= {}).text = [t]; }
  if (pick === 2) { const i = m ? await m.select("Permission:", C.PERMISSIONS.map((k) => `${k}: ${p.permissions[k] ? "allowed" : "denied"}`)) : null; if (i != null) (patch.permissions ??= {})[C.PERMISSIONS[i]] = !p.permissions[C.PERMISSIONS[i]]; }
  if (pick === 3) { const t = await ask("Path or glob to deny (project-relative): "); if (t) (patch.files ??= {}).deny = [t]; }
  if (pick === 4) { const b = await ask(`Branch regex [${p.rules.git?.branch_pattern ?? C.GIT_DEFAULTS.branch_pattern}]: `), c = await ask(`Commit regex [${p.rules.git?.commit_format ?? C.GIT_DEFAULTS.commit_format}]: `), s = await ask(`PR required sections, comma separated [${(p.rules.git?.pr_required_sections ?? C.GIT_DEFAULTS.pr_required_sections).join(", ")}]: `);
    patch.rules = { ...(patch.rules ?? {}), git: { ...(b ? { branch_pattern: b } : {}), ...(c ? { commit_format: c } : {}), ...(s ? { pr_required_sections: s.split(",").map((x) => x.trim()).filter(Boolean) } : {}) } }; }
  const eff = C.mergePolicy(role, null, patch); savePolicy(home, co, role, eff);
  if (Object.keys(patch).length && mcp) await mcp("staff_policy_set", { company: co, staff: role, op: "replace", value: patch }).catch((e) => console.error(`(saved locally; server sync failed: ${e.message})`));
  console.log(Object.keys(patch).length ? `Saved. More changes: holding staff policy show ${role}` : `Defaults applied. Change later: holding staff policy show|set ${role} ...`);
}
// Company processes setup (company create / migrate / later: holding company process setup). Arrow-key menu; AH_NONINTERACTIVE=1 skips.
export async function setupProcesses(co, mcp, { ask, menu } = {}) {
  if (!menu) { try { menu = await import("./menu.mjs"); } catch {} }
  ask ??= async (q) => { const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout }); const a = await rl.question(q); rl.close(); return a.trim(); };
  const tk = Object.keys(C.PROCESS_TEMPLATES), saved = [];
  for (;;) {
    const opts = ["Done (no more processes)", ...tk.map((k) => `Template: ${C.PROCESS_TEMPLATES[k].name}`), "Custom (JSON)"];
    const i = menu?.select ? await menu.select("Company processes run by the Jira Listener:", opts) : 0; if (!i) break;
    let pr;
    if (i <= tk.length) { const t = C.PROCESS_TEMPLATES[tk[i - 1]]; const src = (await ask("Source project key (e.g. MARLIN): ")).toUpperCase(); if (!src) continue;
      const to = (await ask("Linked target projects, comma separated (empty = any): ")).split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
      const stt = (await ask(`Trigger statuses [${t.when.statuses.join(",")}]: `)).split(",").map((x) => x.trim()).filter(Boolean);
      pr = { id: `${tk[i - 1]}-${src.toLowerCase()}`, name: t.name, when: { project: src, statuses: stt.length ? stt : t.when.statuses }, targets: { projects: to, link_types: [] }, actions: t.actions }; }
    else { try { pr = JSON.parse(await ask("Process JSON: ")); } catch { console.log("invalid JSON"); continue; } }
    const e = C.validateProcesses([pr]); if (e) { console.log(`invalid: ${e}`); continue; }
    try { await mcp("staff_policy_set", { company: co, staff: "*", op: "process_add", value: pr }); saved.push(pr.id); console.log(`saved ${pr.id}`); } catch (er) { console.log(`not saved: ${er.message}`); }
  }
  console.log(saved.length ? `Processes: ${saved.join(", ")}. Change later: holding company process list|add|remove` : "No processes. Add later: holding company process setup");
  return saved;
}
export async function mcpCall(name, args) {
  const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
  const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"); if (!key) throw new Error("no key");
  const u = process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", bd = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const staff = !!process.env.AH_STAFF; let sig = {}; if (!staff) { try { sig = (await import("./device-key.mjs")).signFetch(u, bd); } catch {} }
  const dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const r = await fetch(u, { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": AH_CLIENT_VERSION, "X-AH-Client": staff ? "ah-staff" : "ah-cli", ...(dev ? { "X-AH-Device": dev } : {}), ...sig },
    body: bd });
  const j = await r.json(), t = j.result?.content?.[0]?.text ?? j.error?.message ?? ""; if (j.error || j.result?.isError) throw new Error(t); return JSON.parse(t);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), cmd = argv.shift(), home = homedir();
  const ci = argv.indexOf("--company"); let co = ci >= 0 ? argv.splice(ci, 2)[1] : process.env.AH_COMPANY;
  if (!co && cmd !== "hook" && cmd !== "scan") { try { co = (await import("./company.mjs")).resolveCompany().company; } catch {} }
  const role = argv[0];
  if (cmd === "hook") { let s = ""; for await (const c of process.stdin) s += c; let d = null; try { d = hookDecision(JSON.parse(s || "{}")); } catch {} if (d) process.stdout.write(JSON.stringify(d)); process.exit(0); }
  if (cmd === "scan") { const r = scanReplacement(argv[0]); console.log(r.ok ? "OK: no key-like content" : `WARNING: ${r.findings} key-like value(s) found in ${argv[0]}: use fake placeholders`); process.exit(r.ok ? 0 : 1); }
  if (!co) { console.error("no company: run inside a company repo or pass --company"); process.exit(2); }
  if (cmd === "processes") { if (process.env.AH_NONINTERACTIVE === "1" || !process.stdin.isTTY) { console.log("processes: skipped (non-interactive). Add later: holding company process add ..."); process.exit(0); }
    await setupProcesses(argv[0] ?? process.env.AH_COMPANY ?? co, mcpCall); process.exit(0); }
  if (cmd === "init") { if (process.env.AH_NONINTERACTIVE === "1" || !process.stdin.isTTY) { savePolicy(home, co, role, C.mergePolicy(role)); console.log(`policy: ${role} gets the role defaults (holding staff policy show ${role})`); }
    else await initStaff(home, co, role, mcpCall); process.exit(0); }
  if (cmd === "sync") { const p = await syncPolicy(home, co, role, mcpCall); console.log(`policy cached for ${role}: ${p.files.deny.length} denied paths`); process.exit(0); }
  if (cmd === "show") { console.log(rulesText(loadPolicy(home, co, role))); process.exit(0); }
  if (cmd === "native") { const p = loadPolicy(home, co, role); console.log(JSON.stringify(nativeConfigs(p, { home, co, role, hookCmd: "node policy.mjs hook" }), null, 2)); process.exit(0); }
  if (cmd === "exec") { const k = argv.indexOf("--"), c = argv.slice(k + 1); const w = wrapLaunch({ home, co, role, bin: c[0], args: c.slice(1) });
    const r = spawnSync(w.bin, w.args, { stdio: "inherit", env: w.env }); process.exit(r.status ?? 1); }
  console.error("usage: policy.mjs init|show|sync|native|exec <role> [-- cmd] | hook | scan <file>"); process.exit(2);
}
