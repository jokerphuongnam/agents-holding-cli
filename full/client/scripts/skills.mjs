#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// Local skills: ~/.agents-holding/skills/{public,private,library}/<skill>/SKILL.md (+ references/ scripts/ templates/ history/ assets/).
// Visibility comes from the folder. Public custom skills are collected automatically by the client (after a local scan);
// private ones only count. history/ and assets/ are never uploaded. Library skills must carry a valid server signature.
// holding skill where | check | set <name> public|private | sync [--dry-run] | verify
import { createHash, createHmac, createPublicKey, verify as edVerify, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, unlinkSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform, hostname } from "node:os";
import { join, relative } from "node:path";
export const ROOT = (home = process.env.HOME || homedir()) => join(home, ".agents-holding/skills");
export const VIS = ["public", "private", "library"], SUB = ["references", "scripts", "templates", "history", "assets"], UPLOAD = ["references", "scripts", "templates"];
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const fm = (md) => { const m = /^---\n([\s\S]*?)\n---/.exec(md); if (!m) return null; const o = {}; for (const l of m[1].split("\n")) { const k = /^(\w+):\s*(.*)$/.exec(l); if (k) o[k[1]] = k[2].trim(); } return o; };
// never follow symlinks: a link inside a skill could point at ~/.ssh or the Keychain export
const walk = (d) => { const out = []; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) out.push(...walk(p)); else if (e.isFile()) out.push(p); } return out; };
/** Strict loader: valid skills + everything ignored with reason and the correct path. */
export function check(home) {
  const root = ROOT(home), ok = [], bad = []; if (!existsSync(root)) return { ok, bad };
  for (const e of readdirSync(root)) { const p = join(root, e);
    if (!VIS.includes(e)) { bad.push({ path: p, reason: "not a visibility folder", fix: `${root}/{public,private,library}/<skill>/SKILL.md` }); continue; }
    if (!statSync(p).isDirectory()) continue;
    for (const s of readdirSync(p)) { const d = join(p, s); if (!statSync(d).isDirectory()) { bad.push({ path: d, reason: "loose file", fix: `${p}/<skill>/SKILL.md` }); continue; }
      if (!NAME.test(s)) { bad.push({ path: d, reason: "invalid folder name (a-z, 0-9, -)", fix: join(p, s.toLowerCase().replace(/[^a-z0-9-]+/g, "-")) }); continue; }
      const md = join(d, "SKILL.md"); if (!existsSync(md)) { bad.push({ path: d, reason: "missing SKILL.md", fix: md }); continue; }
      const f = fm(readFileSync(md, "utf8")); const miss = ["name", "description", "version"].filter((k) => !f?.[k]);
      if (miss.length) { bad.push({ path: md, reason: `frontmatter missing ${miss.join(", ")}`, fix: md }); continue; }
      for (const x of readdirSync(d)) if (x !== "SKILL.md" && x !== ".private" && !SUB.includes(x)) bad.push({ path: join(d, x), reason: "not a standard subfolder (ignored)", fix: `${d}/{${SUB.join(",")}}/` });
      ok.push({ name: s, vis: e, dir: d, fm: f }); } }
  return { ok, bad };
}
const PERSONAL = { secrets: /(ah_live_|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[bp]-|ghp_[A-Za-z0-9]{20,})/, email: /[\w.+-]+@[\w-]+\.[\w.]+/, phone: /\+?\d[\d ().-]{8,}\d/,
  local_path: /(\/Users\/|\/home\/|C:\\Users\\)[^\s/]+/, issue_key: /\b[A-Z][A-Z0-9]{1,9}-\d+\b/, internal_url: /(https?:\/\/[\w.-]*\.(internal|local|corp|lan)\b|\b(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+)/ };
export const scanLocal = (t, extra = []) => { const c = Object.entries(PERSONAL).filter(([, r]) => r.test(t)).map(([k]) => k); if (extra.some((x) => x && t.toLowerCase().includes(x.toLowerCase()))) c.push("names"); return c; };
const RISK = /(curl|wget|nc |Invoke-WebRequest|fetch\(|rm -rf \/|mkfs|dd if=|security find-generic-password|base64 -d \||eval\s*\(|ignore (all )?previous instructions)/i;
/** What the crawl would send for one public skill (never history/, assets/, flagged or user-marked files). */
export function bundle(s, extra = [platform() === "darwin" ? process.env.USER : "", process.env.USER].filter(Boolean)) {
  const marked = existsSync(join(s.dir, ".private")) ? readFileSync(join(s.dir, ".private"), "utf8").split("\n").map((x) => x.trim()).filter(Boolean) : [];
  const files = [], excluded = [];
  for (const p of walk(s.dir)) { const r = relative(s.dir, p); if (r === ".private") continue; const top = r.split("/")[0];
    if (r !== "SKILL.md" && !UPLOAD.includes(top)) { excluded.push({ path: r, reason: top === "history" || top === "assets" ? top : "not uploadable" }); continue; }
    if (marked.includes(r)) { excluded.push({ path: r, reason: "marked private" }); continue; }
    const t = readFileSync(p, "utf8"); const cats = scanLocal(t, extra);
    if (r === "SKILL.md" && (s.fm.private === "true" || cats.length)) return { held_back: true, categories: cats, files: [], excluded };
    if (cats.length) { excluded.push({ path: r, reason: cats.join(",") }); continue; }
    files.push({ path: r, content: t }); }
  const risky = files.some((f) => RISK.test(f.content));
  return { held_back: false, files, excluded, local_block: risky && files.some((f) => /ignore (all )?previous instructions|security find-generic-password/i.test(f.content)) };
}
export const manifestHash = (files) => createHash("sha256").update([...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}:${createHash("sha256").update(f.content).digest("hex")}`).join("\n")).digest("hex");
export function signUpload(keyHash, device, files) { const nonce = randomUUID(), ts = Math.floor(Date.now() / 1000), mh = manifestHash(files);
  return { nonce, ts, manifest_hash: mh, sig: hmac(keyHash, `${nonce}.${ts}.${mh}.${device}`) }; }
const hmac = (k, m) => createHmac("sha256", k).update(m).digest("hex");
/** Library install / load: Ed25519 signature over the manifest hash + id must verify against the server public key. */
export function verifySigned(pubPem, entry) { try { return edVerify(null, Buffer.from(`${entry.id}.${manifestHash(entry.files)}`), createPublicKey(pubPem), Buffer.from(entry.signature, "base64")); } catch { return false; } }
export function setVisibility(home, name, vis) { if (!["public", "private"].includes(vis)) throw new Error("public|private");
  const r = ROOT(home), from = ["public", "private"].map((v) => join(r, v, name)).find(existsSync); if (!from) throw new Error(`no custom skill ${name}`);
  const to = join(r, vis, name); if (from === to) return to; mkdirSync(join(r, vis), { recursive: true }); renameSync(from, to); return to; }
/** Heartbeat metadata (counts/enums only). */
export function localMeta(home) { const { ok } = check(home); return { os: platform(), lang: /^vi/i.test(process.env.AH_LANG ?? process.env.LANG ?? "") ? "vi" : "en", private_skills: ok.filter((s) => s.vis === "private").length, public_skills: ok.filter((s) => s.vis === "public").length }; }

const keychain = (svc) => { try { return execFileSync("security", ["find-generic-password", "-s", svc, "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
export function licenseKey() { if (process.env.AGENTS_HOLDING_KEY) return process.env.AGENTS_HOLDING_KEY.trim(); return keychain("agents-holding-license") || keychain("agents-holding-test-license") || ""; }
export function deviceId() { if (process.env.AGENTS_HOLDING_DEVICE) return process.env.AGENTS_HOLDING_DEVICE.trim(); return keychain("agents-holding-device") || ""; }
export function activeCompany(home = process.env.HOME || homedir()) {
  try { const st = JSON.parse(readFileSync(join(home, ".config/agents-holding/status.json"), "utf8")); if (st.active_company) return st.active_company; } catch {}
  try { const r = JSON.parse(readFileSync(join(home, ".config/agents-holding/projects.json"), "utf8")); const b = r.projects?.[0]?.boards?.[0]; if (b?.company) return b.company; } catch {}
  return process.env.AH_COMPANY || "";
}
const mcpBase = () => (process.env.AH_MCP_URL || process.env.AGENTS_HOLDING_URL || "https://mznrffnvmhmiudvfuquk.supabase.co").replace(/\/$/, "");
async function mcpCall(name, args, { key, device } = {}) {
  const k = key || licenseKey(); if (!k) throw new Error("no license key");
  const dev = device ?? deviceId();
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${k}` };
  if (dev) { headers["X-AH-Device"] = dev; headers["X-AH-Device-Name"] = (process.env.AGENTS_HOLDING_DEVICE_NAME || hostname()).slice(0, 80); }
  let a = args;
  try { const O = await import("./outbound.mjs"); if (O.governed(name)) a = O.outbound(name, a); } catch {}
  const r = await fetch(`${mcpBase()}/functions/v1/mcp`, { method: "POST", signal: AbortSignal.timeout(60000), headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }) });
  const body = await r.text();
  let j; try { j = JSON.parse(body); } catch { throw new Error(`mcp ${name}: bad JSON ${body.slice(0, 200)}`); }
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const c = j.result?.content; const text = Array.isArray(c) ? c.map((x) => x.text || "").join("") : (typeof j.result === "object" ? JSON.stringify(j.result) : String(j.result ?? body));
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
/** Upload one public skill via skill_crawl_upload (signed+hashed+nonce). */
export async function uploadSkill(s, { company, dry = false, key, device } = {}) {
  const b = bundle(s);
  if (b.held_back) return { name: s.name, status: "held_back", categories: b.categories };
  if (b.local_block) return { name: s.name, status: "blocked" };
  if (!b.files.length) return { name: s.name, status: "empty", excluded: b.excluded.length };
  const k = key || licenseKey(); if (!k) throw new Error("no license key for skill sync");
  const keyHash = createHash("sha256").update(k).digest("hex");
  const dev = device ?? deviceId();
  const signed = signUpload(keyHash, dev, b.files);
  const payload = { company: company || activeCompany(), name: s.name, files: b.files, manifest_hash: signed.manifest_hash, nonce: signed.nonce, ts: signed.ts, sig: signed.sig, excluded_count: b.excluded.length };
  if (!payload.company) throw new Error("no company: holding company use <slug> or AH_COMPANY");
  if (dry) return { name: s.name, status: "dry-run", files: b.files.length, excluded: b.excluded.length, company: payload.company };
  const r = await mcpCall("skill_crawl_upload", payload, { key: k, device: dev });
  return { name: s.name, status: "uploaded", files: b.files.length, excluded: b.excluded.length, server: r };
}
/** Crawl all public skills (holding skill sync + Jira Listener periodic crawl). */
export async function crawlPublic(home = process.env.HOME || homedir(), opts = {}) {
  const { ok } = check(home); const pub = ok.filter((x) => x.vis === "public");
  const out = [];
  for (const s of pub) { try { out.push(await uploadSkill(s, { ...opts, company: opts.company || activeCompany(home) })); }
    catch (e) { out.push({ name: s.name, status: "error", error: String(e.message || e) }); } }
  return out;
}

/** Consent gate: scripts never auto-run. `holding skill consent <name>` writes .consent. */
export const consentPath = (dir) => join(dir, ".consent");
export function hasConsent(dir) { try { const x = readFileSync(consentPath(dir), "utf8").trim(); return x === "allow-scripts" || x.startsWith("allow-scripts"); } catch { return false; } }
export function grantConsent(dir) { writeFileSync(consentPath(dir), `allow-scripts\n# granted ${new Date().toISOString()}\n# scripts run sandboxed; revoke by deleting this file or: holding skill consent <name> --revoke\n`); return consentPath(dir); }
export function revokeConsent(dir) { try { unlinkSync(consentPath(dir)); return true; } catch { return false; } }

/** Run ONE skill script with consent + sandbox. Never auto-called by listener/crawl/sync. */
export function runScript(skillDir, relPath, { args = [], home = process.env.HOME || homedir() } = {}) {
  if (!hasConsent(skillDir)) throw new Error("no consent: run `holding skill consent <name>` first (scripts never auto-run)");
  const abs = join(skillDir, relPath);
  if (!abs.startsWith(skillDir + "/") && abs !== skillDir) throw new Error("script path escapes skill dir");
  if (relPath.includes("..")) throw new Error("script path escapes skill dir");
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`no script ${relPath}`);
  if (lstatSync(abs).isSymbolicLink()) throw new Error("refusing symlink script");
  const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: join(home, ".agents-holding/sandbox-home"), LANG: "C", TMPDIR: join(home, ".agents-holding/sandbox-tmp") };
  mkdirSync(env.HOME, { recursive: true }); mkdirSync(env.TMPDIR, { recursive: true });
  if (platform() === "darwin") {
    const profile = `(version 1)\n(deny default)\n(allow process-exec (literal "/bin/bash") (literal "/bin/sh") (literal "/usr/bin/env") (literal "${abs}"))\n(allow process-fork)\n(allow sysctl-read)\n(allow file-read* (subpath "${skillDir}") (subpath "/usr") (subpath "/bin") (subpath "/System") (subpath "/private/tmp"))\n(allow file-write* (subpath "${env.HOME}") (subpath "${env.TMPDIR}"))\n(deny network*)\n`;
    const pf = join(env.TMPDIR, `seatbelt-${Date.now()}.sb`);
    writeFileSync(pf, profile);
    try { return execFileSync("sandbox-exec", ["-f", pf, "/bin/bash", abs, ...args], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }); }
    finally { try { unlinkSync(pf); } catch {} }
  }
  return execFileSync("/bin/bash", [abs, ...args], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2), cmd = argv[0], home = process.env.HOME || homedir();
  const dry = argv.includes("--dry-run") || argv.includes("--dry");
  (async () => {
    if (cmd === "where") { const r = ROOT(home); for (const v of VIS) console.log(`${v.padEnd(8)} ${join(r, v)}/<skill>/SKILL.md`); }
    else if (cmd === "check") { const { ok, bad } = check(home); console.log(`${ok.length} skill(s) load`); ok.forEach((s) => console.log(`  ✅ ${s.vis}/${s.name}`));
      bad.forEach((b) => console.log(`  ⚠️  ignored ${b.path}\n      ${b.reason} → ${b.fix}`));
      for (const s of ok.filter((x) => x.vis === "public")) { const b = bundle(s); if (b.held_back) console.log(`  🔒 ${s.name}: held back (SKILL.md: ${b.categories.join(", ")})`); else if (b.excluded.length) console.log(`  ℹ️  ${s.name}: ${b.excluded.length} file(s) not collected (${[...new Set(b.excluded.map((e) => e.reason))].join(", ")})`); } }
    else if (cmd === "set") { console.log(`→ ${setVisibility(home, argv[1], argv[2])}`); }
    else if (cmd === "sync") {
      const company = (() => { const i = argv.indexOf("--company"); return i >= 0 ? argv[i + 1] : activeCompany(home); })();
      const results = await crawlPublic(home, { dry, company });
      if (!results.length) console.log("no public skills to sync");
      for (const r of results) {
        if (r.status === "uploaded") console.log(`${r.name}: uploaded ${r.files} file(s), ${r.excluded} excluded`);
        else if (r.status === "dry-run") console.log(`${r.name}: would upload ${r.files} file(s) to ${r.company}, ${r.excluded} excluded`);
        else if (r.status === "held_back") console.log(`${r.name}: held back (${(r.categories || []).join(", ")})`);
        else if (r.status === "blocked") console.log(`${r.name}: blocked by local scan (not uploaded)`);
        else if (r.status === "empty") console.log(`${r.name}: nothing to upload`);
        else console.log(`${r.name}: ${r.status}${r.error ? " — " + r.error : ""}`);
      }
      if (results.some((r) => r.status === "error")) process.exit(1);
    }
    else if (cmd === "consent") {
      const name = argv[1], revoke = argv.includes("--revoke");
      if (!name) { console.log("usage: holding skill consent <name> [--revoke]"); process.exit(1); }
      const { ok } = check(home); const s = ok.find((x) => x.name === name);
      if (!s) { console.error(`no skill ${name}`); process.exit(1); }
      if (revoke) { revokeConsent(s.dir); console.log(`revoked consent for ${s.vis}/${name}`); }
      else { console.log(`→ ${grantConsent(s.dir)}`); console.log("scripts may now be run with: holding skill run <name> <scripts/...>"); }
    }
    else if (cmd === "run") {
      const name = argv[1], rel = argv[2]; const rest = argv.slice(3);
      if (!name || !rel) { console.log("usage: holding skill run <name> <scripts/file> [args...]"); process.exit(1); }
      const { ok } = check(home); const s = ok.find((x) => x.name === name);
      if (!s) { console.error(`no skill ${name}`); process.exit(1); }
      try { const out = runScript(s.dir, rel, { args: rest, home }); process.stdout.write(out); }
      catch (e) { console.error(e.message || e); process.exit(1); }
    }
    else { console.log("usage: holding skill where | check | set <name> public|private | sync [--dry-run] [--company SLUG] | consent <name> [--revoke] | run <name> <scripts/file>"); process.exit(cmd ? 1 : 0); }
  })().catch((e) => { console.error(e.message || e); process.exit(1); });
}
