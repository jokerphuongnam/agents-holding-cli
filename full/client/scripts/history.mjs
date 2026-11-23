#!/usr/bin/env node
import "./kc-guard.mjs";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCompany } from "./company.mjs";

const HERE = join(fileURLToPath(new URL(".", import.meta.url)));
const HOME = process.env.HOME || homedir();
const SERVICE = "agents-holding-company-history";
const argv = process.argv.slice(2);
const popFlag = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const explicitCompany = popFlag("--company");
const actor = popFlag("--actor");
const taskArg = popFlag("--task");
const roomArg = popFlag("--room");
const messageArg = popFlag("--message");
const action = argv.shift() || "sync";
const keyArg = argv.shift();

function run(cmd, args, opts = {}) { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim(); }
function command(cmd, args, opts = {}) { try { return run(cmd, args, opts); } catch (e) { throw new Error(String(e.stderr || e.message || e).trim()); } }
function keychain(service, account) {
  try { return command("security", ["find-generic-password", "-s", service, "-a", account, "-w"]); } catch { return null; }
}
function setKeychain(service, account, value) {
  command("security", ["add-generic-password", "-U", "-s", service, "-a", account, "-w", value]);
}
function companyRoot(slug) {
  const registry = join(HOME, ".config/agents-holding/projects.json");
  try {
    const rows = JSON.parse(readFileSync(registry, "utf8")).projects ?? [];
    for (const p of rows) if ((p.boards ?? []).some((b) => b.company === slug)) {
      const agents = join(p.path, ".agents");
      for (const name of readdirSync(agents)) {
        const d = join(agents, name);
        if ((existsSync(join(d, "COMPANY.md")) || existsSync(join(d, "COMPANY_BOOT.md"))) && (name === slug || name === `${slug}-company` || name.startsWith(`${slug}-company-`))) return d;
      }
    }
  } catch {}
  let d = resolve(process.cwd());
  for (;;) {
    if (existsSync(join(d, "COMPANY.md")) || existsSync(join(d, "COMPANY_BOOT.md"))) {
      const leaf = basename(d);
      if (leaf === slug || leaf.startsWith(`${slug}-company`)) return d;
    }
    const agents = join(d, ".agents");
    try {
      const candidates = readdirSync(agents).map((n) => join(agents, n)).filter((x) => existsSync(join(x, "COMPANY.md")) || existsSync(join(x, "COMPANY_BOOT.md")));
      const match = candidates.find((x) => basename(x) === slug || basename(x) === `${slug}-company` || basename(x).startsWith(`${slug}-company-`));
      if (match) return match;
      if (candidates.length === 1) return candidates[0];
    } catch {}
    const parent = join(d, ".."); if (parent === d) break; d = parent;
  }
  throw new Error(`could not locate local company directory for ${slug}`);
}
function licenseKey() {
  const k = process.env.AGENTS_HOLDING_KEY || keychain("agents-holding-license", process.env.USER);
  if (!k) throw new Error("no Agents Holding license in Keychain");
  return k;
}
function dataKey(company) {
  const account = `${process.env.USER}:${company}`;
  let raw = keychain(SERVICE, account);
  if (!raw) { raw = randomBytes(32).toString("base64"); setKeychain(SERVICE, account, raw); }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`invalid company history key in Keychain (${company})`);
  return key;
}
function wrapKey(license, company) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(license), Buffer.from(`agents-holding-history:${company}`), Buffer.from("company-history-wrap-v1"), 32));
}
function encrypt(bytes, key) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([c.update(bytes), c.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64") };
}
function decrypt(ciphertext, iv, tag, key) {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ciphertext, "base64")), d.final()]);
}
function currentDataKey(remote, license, company) {
  const account = `${process.env.USER}:${company}`;
  const local = keychain(SERVICE, account);
  if (local) return dataKey(company);
  if (!remote?.present) return dataKey(company);
  const k = decrypt(remote.wrapped_key, remote.wrapped_key_iv, remote.wrapped_key_tag, wrapKey(license, company));
  if (k.length !== 32) throw new Error("server history key envelope is invalid");
  setKeychain(SERVICE, account, k.toString("base64"));
  return k;
}
async function mcp(name, args) {
  const license = licenseKey(), dev = process.env.AGENTS_HOLDING_DEVICE || keychain("agents-holding-device", process.env.USER) || "";
  const url = process.env.AH_MCP_URL || "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp";
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const signer = await import("./device-key.mjs").catch(() => ({ signFetch: () => ({}) }));
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${license}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Client": "ah-cli", ...(dev ? { "X-AH-Device": dev } : {}), ...signer.signFetch(url, body) }, body });
  const j = await res.json();
  const txt = j.result?.content?.[0]?.text ?? j.error?.message ?? `HTTP ${res.status}`;
  if (j.error || j.result?.isError) throw new Error(txt);
  try { return JSON.parse(txt); } catch { throw new Error(txt); }
}
function projectRoot(slug, company) {
  const companyDir = resolve(company);
  if (basename(dirname(companyDir)) === ".agents") return dirname(dirname(companyDir));
  const registry = join(HOME, ".config/agents-holding/projects.json");
  try {
    const rows = JSON.parse(readFileSync(registry, "utf8")).projects ?? [];
    const p = rows.find((x) => (x.boards ?? []).some((b) => b.company === slug));
    if (p?.path) return resolve(p.path);
  } catch {}
  return resolve(process.cwd());
}
function workHistoryScript(root) {
  const script = join(root, "system", "install", "work_history.py");
  if (!existsSync(script)) throw new Error(`company work-history runtime not found: ${script}`);
  return script;
}
async function codeHistory(company, root, verb, target) {
  const script = workHistoryScript(root);
  if (verb === "timeline") {
    command("python3", [script, "timeline", "--company", root], { cwd: root });
    return;
  }
  if (verb === "diff") {
    if (!target) throw new Error("usage: holding history code diff <commit>");
    command("python3", [script, "diff", "--company", root, "--commit", target], { cwd: root });
    return;
  }
  if (verb === "revert") {
    if (!target || !messageArg) throw new Error("usage: holding history code revert <commit> --message <reason> [--actor <staff>]");
    const project = projectRoot(company, root);
    command("python3", [script, "revert", "--company", root, "--project", project, "--commit", target, "--staff", actor || "user", "--message", messageArg], { cwd: root });
    await pushHistory(company, root);
    return;
  }
  throw new Error("usage: holding history code timeline|diff|revert");
}

function storePath(root) { return join(root, "cache", "work-history"); }
function revisionPath(root) { return join(root, "cache", "work-history-server-revision"); }
function gitRefs(store, prefix) {
  if (!existsSync(join(store, "HEAD"))) return [];
  return command("git", ["--git-dir", store, "for-each-ref", "--format=%(refname)", prefix]).split("\n").filter(Boolean);
}
function ensureStore(store) {
  if (!existsSync(join(store, "HEAD"))) { mkdirSync(join(store, ".."), { recursive: true }); command("git", ["init", "--bare", store]); }
  command("git", ["--git-dir", store, "config", "core.bare", "false"]);
}
function localRevision(root) { try { return readFileSync(revisionPath(root), "utf8").trim() || null; } catch { return null; } }
function saveRevision(root, revision) { mkdirSync(join(root, "cache"), { recursive: true }); writeFileSync(revisionPath(root), `${revision}\n`, { mode: 0o600 }); }
function parseData(response) { return response?.data ?? response; }
async function remoteSnapshot(company) { return parseData(await mcp("history_fetch", { company })); }
function fastForwardPlans(store) {
  let conflicts = 0;
  for (const remote of gitRefs(store, "refs/remotes/server/")) {
    const suffix = remote.slice("refs/remotes/server/".length), local = `refs/heads/${suffix}`;
    const localExists = (() => { try { execFileSync("git", ["--git-dir", store, "show-ref", "--verify", "--quiet", local], { stdio: "ignore" }); return true; } catch { return false; } })();
    if (!localExists) { command("git", ["--git-dir", store, "update-ref", local, remote]); continue; }
    const localBeforeRemote = (() => { try { execFileSync("git", ["--git-dir", store, "merge-base", "--is-ancestor", local, remote], { stdio: "ignore" }); return true; } catch { return false; } })();
    const remoteBeforeLocal = (() => { try { execFileSync("git", ["--git-dir", store, "merge-base", "--is-ancestor", remote, local], { stdio: "ignore" }); return true; } catch { return false; } })();
    if (localBeforeRemote) command("git", ["--git-dir", store, "update-ref", local, remote]);
    else if (!remoteBeforeLocal) conflicts++;
  }
  return conflicts;
}

function materializePlans(root, store) {
  for (const ref of gitRefs(store, "refs/heads/plan/")) {
    const key = ref.slice("refs/heads/plan/".length);
    const relative = `plans/${key}.md`, file = join(root, relative);
    let content;
    try { content = execFileSync("git", ["--git-dir", store, "show", `${ref}:${relative}`]); } catch { continue; }
    if (existsSync(file)) {
      if (!readFileSync(file).equals(content)) continue;
    } else {
      mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, content, { mode: 0o600 });
    }
  }
}

async function pullRemote(company, root, remote = null) {
  remote ??= await remoteSnapshot(company);
  if (!remote?.present) return { present: false, conflicts: 0 };
  const license = licenseKey(), key = currentDataKey(remote, license, company);
  const bundle = decrypt(remote.encrypted_bundle, remote.bundle_iv, remote.bundle_tag, key);
  const store = storePath(root); ensureStore(store);
  const tmp = join(HOME, ".cache", `ah-history-${randomUUID()}.bundle`);
  mkdirSync(join(HOME, ".cache"), { recursive: true, mode: 0o700 }); writeFileSync(tmp, bundle, { mode: 0o600 });
  try { command("git", ["--git-dir", store, "fetch", tmp, "+refs/heads/*:refs/remotes/server/*"]); }
  finally { rmSync(tmp, { force: true }); }
  const conflicts = fastForwardPlans(store);
  materializePlans(root, store);
  if (!conflicts) saveRevision(root, remote.revision);
  return { present: true, conflicts, revision: remote.revision };
}

async function pushHistory(company, root) {
  const store = storePath(root);
  if (!existsSync(join(store, "HEAD")) || !gitRefs(store, "refs/heads/").length) throw new Error("company history has no Git commits yet");
  let remote = await remoteSnapshot(company);
  if (remote?.present) {
    const localRev = localRevision(root);
    if (localRev !== remote.revision) {
      if (!localRev) throw new Error("encrypted server history already exists; run holding history pull first");
      const pulled = await pullRemote(company, root, remote);
      if (pulled.conflicts) throw new Error("local and server history diverged; both copies were preserved. Resolve the conflicting plan branches, then push again.");
      remote = await remoteSnapshot(company);
    }
  }
  const license = licenseKey(), key = currentDataKey(remote?.present ? remote : null, license, company);
  const wrap = encrypt(key, wrapKey(license, company));
  const tmp = join(HOME, ".cache", `ah-history-${randomUUID()}.bundle`);
  mkdirSync(join(HOME, ".cache"), { recursive: true, mode: 0o700 });
  try {
    command("git", ["--git-dir", store, "bundle", "create", tmp, "--branches"]);
    const encrypted = encrypt(readFileSync(tmp), key), revision = randomUUID();
    const response = parseData(await mcp("history_push", { company, revision, ...(remote?.present ? { base_revision: remote.revision } : {}),
      encrypted_bundle: encrypted.ciphertext, bundle_iv: encrypted.iv, bundle_tag: encrypted.tag,
      wrapped_key: wrap.ciphertext, wrapped_key_iv: wrap.iv, wrapped_key_tag: wrap.tag }));
    saveRevision(root, response.revision ?? revision);
    console.log(`Encrypted company history pushed: ${response.revision ?? revision}`);
  } finally { rmSync(tmp, { force: true }); }
}

function planRecord(company, root, task, who) {
  if (!/^[A-Z][A-Z0-9]{1,9}-[0-9]+$/i.test(task)) throw new Error("task must be a Jira key such as MARLIN-1");
  const path = join(root, "plans", `${task.toLowerCase()}.md`);
  const script = join(root, "system", "install", "plan_history.py");
  command("python3", [script, "sync", "--company", root, ...(who ? ["--actor", who] : [])], { cwd: root });
  const output = pushHistory(company, root);
  return output;
}

async function main() {
  let company = explicitCompany || resolveCompany().company;
  if (!company || company === ".") throw new Error("no company found; run inside a local company/project directory or pass --company <slug>");
  const root = companyRoot(company);
  if (action === "init") {
    command("python3", [workHistoryScript(root), "init", "--company", root], { cwd: root });
    console.log(`Initialized company work-history: ${storePath(root)}`);
    return;
  }
  if (action === "code") { await codeHistory(company, root, keyArg || "timeline", argv.shift()); return; }
  if (action === "plan") {
    const verb = keyArg || "record", task = taskArg || argv.shift();
    if (verb === "record") {
      if (!task) throw new Error("usage: holding history plan record <JIRA-KEY> [--actor <role>]");
      await planRecord(company, root, task, actor);
      const revision = localRevision(root);
      console.log(`Plan recorded: ${join(root, "plans", task.toLowerCase() + ".md")} (history revision ${revision})`);
      return;
    }
    if (verb === "log") {
      if (!task) throw new Error("usage: holding history plan log <JIRA-KEY>");
      command("python3", [join(root, "system", "install", "plan_history.py"), "git-history", "--company", root, "--plan", `${task.toLowerCase()}.md`], { cwd: root });
      return;
    }
    throw new Error("usage: holding history plan record|log <JIRA-KEY>");
  }
  if (["push", "sync"].includes(action)) { await pushHistory(company, root); return; }
  if (action === "pull") {
    const r = await pullRemote(company, root);
    if (!r.present) { console.log("No encrypted server history yet."); return; }
    if (r.conflicts) throw new Error(`server history fetched; ${r.conflicts} branch conflict(s) preserved. Resolve before pushing.`);
    console.log(`Encrypted company history pulled: ${r.revision}`); return;
  }
  throw new Error("usage: holding history init|push|pull|code timeline|diff|revert|plan record|log <KEY>");
}

main().catch((e) => { console.error(e.message || String(e)); process.exitCode = 1; });
