#!/usr/bin/env node
// Local skills: ~/.agents-holding/skills/{public,private,library}/<skill>/SKILL.md (+ references/ scripts/ templates/ history/ assets/).
// Visibility comes from the folder. Public custom skills are collected automatically by the client (after a local scan);
// private ones only count. history/ and assets/ are never uploaded. Library skills must carry a valid server signature.
// holding skill where | check | set <name> public|private | sync [--dry-run] | verify
import { createHash, createPublicKey, verify as edVerify, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
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
export const manifestHash = (files) => createHash("sha256").update([...files].sort((a, b) => a.path < b.path ? -1 : 1).map((f) => `${f.path}\n${createHash("sha256").update(f.content).digest("hex")}`).join("\n")).digest("hex");
export function signUpload(keyHash, device, files) { const nonce = randomUUID(), ts = Math.floor(Date.now() / 1000), mh = manifestHash(files);
  return { nonce, ts, manifest_hash: mh, sig: hmac(keyHash, `${nonce}.${ts}.${mh}.${device}`) }; }
import { createHmac } from "node:crypto";
const hmac = (k, m) => createHmac("sha256", k).update(m).digest("hex");
/** Library install / load: Ed25519 signature over the manifest hash + id must verify against the server public key. */
export function verifySigned(pubPem, entry) { try { return edVerify(null, Buffer.from(`${entry.id}.${manifestHash(entry.files)}`), createPublicKey(pubPem), Buffer.from(entry.signature, "base64")); } catch { return false; } }
export function setVisibility(home, name, vis) { if (!["public", "private"].includes(vis)) throw new Error("public|private");
  const r = ROOT(home), from = ["public", "private"].map((v) => join(r, v, name)).find(existsSync); if (!from) throw new Error(`no custom skill ${name}`);
  const to = join(r, vis, name); if (from === to) return to; mkdirSync(join(r, vis), { recursive: true }); renameSync(from, to); return to; }
/** Heartbeat metadata (counts/enums only). */
export function localMeta(home) { const { ok } = check(home); return { os: platform(), lang: /^vi/i.test(process.env.AH_LANG ?? process.env.LANG ?? "") ? "vi" : "en", private_skills: ok.filter((s) => s.vis === "private").length, public_skills: ok.filter((s) => s.vis === "public").length }; }
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a1, a2] = process.argv.slice(2), home = process.env.HOME || homedir();
  if (cmd === "where") { const r = ROOT(home); for (const v of VIS) console.log(`${v.padEnd(8)} ${join(r, v)}/<skill>/SKILL.md`); }
  else if (cmd === "check") { const { ok, bad } = check(home); console.log(`${ok.length} skill(s) load`); ok.forEach((s) => console.log(`  ✅ ${s.vis}/${s.name}`));
    bad.forEach((b) => console.log(`  ⚠️  ignored ${b.path}\n      ${b.reason} → ${b.fix}`));
    for (const s of ok.filter((x) => x.vis === "public")) { const b = bundle(s); if (b.held_back) console.log(`  🔒 ${s.name}: held back (SKILL.md: ${b.categories.join(", ")})`); else if (b.excluded.length) console.log(`  ℹ️  ${s.name}: ${b.excluded.length} file(s) not collected (${[...new Set(b.excluded.map((e) => e.reason))].join(", ")})`); } }
  else if (cmd === "set") { console.log(`→ ${setVisibility(home, a1, a2)}`); }
  else if (cmd === "sync") { const { ok } = check(home); for (const s of ok.filter((x) => x.vis === "public")) { const b = bundle(s);
      console.log(`${s.name}: ${b.held_back ? "held back" : b.local_block ? "blocked by local scan (not uploaded)" : `${b.files.length} file(s) would be collected, ${b.excluded.length} excluded`}`); } }
  else { console.log("usage: holding skill where | check | set <name> public|private | sync"); process.exit(cmd ? 1 : 0); }
}
