#!/usr/bin/env node
/**
 * holding dependency add|list|update|remove <link>
 *
 * A dependency is a whole git repo of skills/scripts (skill pack), cloned as its
 * own checkout OUTSIDE the project repo (~/.agents-holding/packs/<name>). The
 * company stores only a reference line so project git stays clean; several
 * companies can share one pack. Update = pull upstream; local learning commits
 * stay in the pack checkout (two-way). Pack skills/commands are adapted for
 * Grok, Claude, Codex and local AI. Pack scripts never run without consent.
 */
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync,
  lstatSync, statSync, rmSync, cpSync, symlinkSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { pathToFileURL } from "node:url";
import { join, dirname, basename, resolve, relative } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { resolveCompany as _resolveCompany } from "./company.mjs";
import { detachPackAttachments } from "./pack-skills.mjs";

const HOME = process.env.HOME || homedir();
const PACKS = (...p) => join(HOME, ".agents-holding", "packs", ...p);
const STATE = (...p) => join(HOME, ".config", "agents-holding", "state", ...p);
const MARK = "<!-- synced by agents-holding dependency pack; edits are overwritten -->";

const resolveCompany = (o) => {
  try { return _resolveCompany(o); }
  catch { return { company: process.env.AH_COMPANY || null, source: "env" }; }
};

function companyOf() {
  const r = resolveCompany({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), home: HOME });
  return r?.company || process.env.AH_COMPANY || null;
}

function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}

function writeJson(p, obj, mode = 0o600) {
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", { mode });
}

function refsPath(company) {
  if (!company) return null;
  return STATE(company, "dependencies.json");
}

function loadRefs(company) {
  const p = refsPath(company);
  if (!p) return [];
  const j = readJson(p, { dependencies: [] });
  return Array.isArray(j?.dependencies) ? j.dependencies : [];
}

function saveRefs(company, deps) {
  const p = refsPath(company);
  if (!p) throw new Error("no company resolved — pass --company <slug> or run inside a company workspace");
  writeJson(p, { dependencies: deps, updated_at: new Date().toISOString() });
  return p;
}

function indexPath() {
  return PACKS("index.json");
}

function loadIndex() {
  return readJson(indexPath(), { packs: {} }) || { packs: {} };
}

function saveIndex(idx) {
  writeJson(indexPath(), idx, 0o600);
}

/** Derive a stable pack folder name from a git URL / path. */
export function packNameFromLink(link) {
  let s = String(link || "").trim().replace(/\/+$/, "");
  if (!s) throw new Error("missing <link>");
  s = s.replace(/\.git$/i, "");
  // git@host:owner/repo or ssh://git@host/owner/repo or https://host/owner/repo
  let m = s.match(/[:/]([^/:]+)\/([^/]+)$/);
  if (m) return sanitizeName(m[2]);
  return sanitizeName(basename(s));
}

function sanitizeName(n) {
  const x = String(n).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  if (!x || !/^[a-z0-9]/.test(x)) throw new Error(`cannot derive pack name from link (${n})`);
  return x;
}

/** Prefer SSH; fall back to HTTPS. Never prints credentials. */
function cloneUrls(link) {
  const raw = String(link).trim();
  const out = [];
  const push = (u) => { if (u && !out.includes(u)) out.push(u); };
  // Local path or file:// — clone as-is only (no SSH/HTTPS rewrite)
  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("file:")) {
    const local = raw.startsWith("file:") ? raw.replace(/^file:\/\//, "/") : raw;
    push(local);
    return out;
  }
  push(raw);
  // Prefer SSH, then HTTPS fallback
  let m = raw.match(/^git@([^:]+):(.+)$/);
  if (m) push(`https://${m[1]}/${m[2].replace(/\.git$/, "")}.git`);
  m = raw.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (m) {
    push(`git@${m[1]}:${m[2]}`);
    push(`https://${m[1]}/${m[2].replace(/\.git$/, "")}.git`);
  }
  m = raw.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (m) {
    push(`git@${m[1]}:${m[2].replace(/\.git$/, "")}.git`);
    push(`https://${m[1]}/${m[2].replace(/\.git$/, "")}.git`);
  }
  return out;
}

function runGit(args, opts = {}) {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: opts.timeout || 120_000,
  });
  return r;
}

function clonePack(link, dest) {
  if (existsSync(dest)) {
    // already cloned — verify it's a git repo
    if (!existsSync(join(dest, ".git"))) throw new Error(`pack path exists but is not a git checkout: ${dest}`);
    return { reused: true, url: link };
  }
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
  const urls = cloneUrls(link);
  let lastErr = "";
  for (const url of urls) {
    const r = runGit(["clone", "--", url, dest]);
    if (r.status === 0) return { reused: false, url };
    lastErr = (r.stderr || r.stdout || "clone failed").trim().split("\n").slice(-3).join(" | ");
    // scrub anything that looks like a token
    lastErr = lastErr.replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted]").replace(/x-access-token:[^@]+@/gi, "[redacted]@");
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  }
  throw new Error(`clone failed for all URL forms (SSH then HTTPS). Last error: ${lastErr || "unknown"}`);
}

function packMetaPath(name) {
  return PACKS(name, ".ah-meta.json");
}

function loadMeta(name) {
  return readJson(packMetaPath(name), { name, exposed: [], adapted: [] });
}

function saveMeta(name, meta) {
  writeJson(packMetaPath(name), { ...meta, name, updated_at: new Date().toISOString() });
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".ah-adapted" || e.name === "node_modules" || e.name === ".ah-meta.json") continue;
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walkFiles(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

function parseFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) return { fm: {}, body: md };
  const fm = {};
  for (const line of m[1].split("\n")) {
    const k = /^([\w-]+):\s*(.*)$/.exec(line);
    if (k) fm[k[1]] = k[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fm, body: m[2] };
}

/** Discover skills/commands inside a pack checkout. */
export function discoverPackEntries(packDir) {
  const entries = [];
  const files = walkFiles(packDir);
  for (const f of files) {
    const rel = relative(packDir, f).replace(/\\/g, "/");
    const base = basename(f);
    if (base === "SKILL.md") {
      const raw = readFileSync(f, "utf8");
      const { fm, body } = parseFrontmatter(raw);
      const name = sanitizeName(fm.name || basename(dirname(f)));
      entries.push({
        kind: "skill",
        id: name,
        path: f,
        rel,
        description: fm.description || name,
        body,
        fm,
        claudeOnly: !!(fm["allowed-tools"] || fm.allowed_tools || fm["disable-model-invocation"]),
      });
      continue;
    }
    // Claude / generic command markdown
    if ((rel.startsWith(".claude/commands/") || rel.startsWith("commands/") || rel.startsWith(".claude/skills/")) && base.endsWith(".md")) {
      const raw = readFileSync(f, "utf8");
      const { fm, body } = parseFrontmatter(raw);
      const name = sanitizeName((fm.name || base.replace(/\.md$/, "")).toLowerCase());
      entries.push({
        kind: "command",
        id: name,
        path: f,
        rel,
        description: fm.description || name,
        body,
        fm,
        claudeOnly: true,
      });
    }
  }
  return entries;
}

function agentDirs() {
  return {
    grok: join(HOME, ".grok", "commands"),
    claude: join(HOME, ".claude", "commands"),
    codex: join(HOME, ".codex", "prompts"),
    claudeSkills: join(HOME, ".claude", "skills"),
  };
}

function wrapCommandMd({ pack, id, description, body }) {
  const desc = String(description || id).replace(/\n/g, " ").slice(0, 200);
  return `---\ndescription: ${JSON.stringify(`[pack:${pack}] ${desc}`)}\n---\n${body.trim()}\n\nUser arguments: $ARGUMENTS\n\n${MARK}\n`;
}

function adaptSkillBody(entry) {
  // Drop Claude-only frontmatter keys; keep a portable instruction body.
  let body = entry.body || "";
  const notes = [];
  if (entry.claudeOnly) {
    notes.push(
      "This skill was adapted from a Claude-oriented pack. Run tools with your agent's native commands (Bash/Read/Edit or equivalent). Do not assume Claude-only frontmatter.",
    );
  }
  notes.push(
    `Pack scripts never auto-run. If a script is needed: holding dependency consent ${entry._pack} then holding dependency run ${entry._pack} <scripts/...>`,
  );
  return `${notes.map((n) => `> ${n}`).join("\n")}\n\n${body.trim()}\n`;
}

/** Expose pack entries to Grok / Claude / Codex command dirs (and Claude skills). */
export function exposePack(name, packDir) {
  if (existsSync(packMetaPath(name))) unexposePack(name);
  const entries = discoverPackEntries(packDir).map((e) => ({ ...e, _pack: name }));
  const dirs = agentDirs();
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true, mode: 0o700 });
  const exposed = [];
  const adaptedRoot = join(packDir, ".ah-adapted");
  mkdirSync(adaptedRoot, { recursive: true });

  for (const e of entries) {
    const slug = `ah-pack-${name}-${e.id}`;
    const body = adaptSkillBody(e);
    const md = wrapCommandMd({ pack: name, id: e.id, description: e.description, body });

    // Grok + Codex + Claude command files
    for (const [agent, dir] of [["grok", dirs.grok], ["codex", dirs.codex], ["claude", dirs.claude]]) {
      if (!existsSync(dirname(dir)) && agent !== "grok") {
        // only write if the agent home already exists (user uses that agent)
        if (agent === "codex" && !existsSync(join(HOME, ".codex"))) continue;
        if (agent === "claude" && !existsSync(join(HOME, ".claude"))) continue;
      }
      const dest = join(dir, `${slug}.md`);
      const adapted = join(adaptedRoot, agent, `${slug}.md`);
      mkdirSync(dirname(adapted), { recursive: true });
      writeFileSync(adapted, md, { mode: 0o644 });
      writeFileSync(dest, md, { mode: 0o644 });
      exposed.push({ agent, path: dest, id: e.id, kind: e.kind });
    }

    // Claude native skill folder (SKILL.md) when source was a skill
    if (e.kind === "skill" && existsSync(join(HOME, ".claude"))) {
      const skillDir = join(dirs.claudeSkills, slug);
      mkdirSync(skillDir, { recursive: true });
      const skillMd = `---\nname: ${slug}\ndescription: ${JSON.stringify(`[pack:${name}] ${e.description}`)}\nversion: 1\n---\n${body}\n\n${MARK}\n`;
      writeFileSync(join(skillDir, "SKILL.md"), skillMd, { mode: 0o644 });
      exposed.push({ agent: "claude-skill", path: join(skillDir, "SKILL.md"), id: e.id, kind: "skill" });
    }
  }

  // Local AI / lean staff: mirror into ~/.agents-holding/skills/library/<slug> as read-only copies
  const libRoot = join(HOME, ".agents-holding", "skills", "library");
  mkdirSync(libRoot, { recursive: true, mode: 0o700 });
  for (const e of entries.filter((x) => x.kind === "skill")) {
    const slug = `ah-pack-${name}-${e.id}`;
    const dest = join(libRoot, slug);
    mkdirSync(dest, { recursive: true });
    const skillMd = `---\nname: ${e.id}\ndescription: ${JSON.stringify(`[pack:${name}] ${e.description}`)}\nversion: ${e.fm.version || "1"}\n---\n${adaptSkillBody(e)}\n\n${MARK}\n`;
    writeFileSync(join(dest, "SKILL.md"), skillMd, { mode: 0o644 });
    exposed.push({ agent: "local-library", path: join(dest, "SKILL.md"), id: e.id, kind: "skill" });
  }

  saveMeta(name, { exposed, entries: entries.map((e) => ({ id: e.id, kind: e.kind, rel: e.rel })) });
  return { entries, exposed };
}

function unexposePack(name) {
  const meta = loadMeta(name);
  for (const x of meta.exposed || []) {
    try {
      if (x.path && existsSync(x.path) && readFileSync(x.path, "utf8").includes(MARK)) unlinkSync(x.path);
      // remove empty claude skill dir
      if (x.agent === "claude-skill") {
        const d = dirname(x.path);
        try { if (readdirSync(d).length === 0) rmSync(d, { recursive: true }); } catch {}
      }
      if (x.agent === "local-library") {
        const d = dirname(x.path);
        try { rmSync(d, { recursive: true, force: true }); } catch {}
      }
    } catch {}
  }
  saveMeta(name, { exposed: [], entries: meta.entries || [] });
}

const consentPath = (dir) => join(dir, ".consent");
function hasConsent(dir) {
  try {
    const x = readFileSync(consentPath(dir), "utf8").trim();
    return x === "allow-scripts" || x.startsWith("allow-scripts");
  } catch { return false; }
}
function grantConsent(dir) {
  writeFileSync(
    consentPath(dir),
    `allow-scripts\n# granted ${new Date().toISOString()}\n# pack scripts run sandboxed; revoke: holding dependency consent <name> --revoke\n`,
    { mode: 0o600 },
  );
  return consentPath(dir);
}
function revokeConsent(dir) {
  try { unlinkSync(consentPath(dir)); return true; } catch { return false; }
}

function runPackScript(packDir, relPath, args = []) {
  if (!hasConsent(packDir)) throw new Error("no consent: run `holding dependency consent <name>` first (pack scripts never auto-run)");
  const abs = resolve(packDir, relPath);
  if (!abs.startsWith(resolve(packDir) + "/") && abs !== resolve(packDir)) throw new Error("script path escapes pack dir");
  if (relPath.includes("..")) throw new Error("script path escapes pack dir");
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`no script ${relPath}`);
  if (lstatSync(abs).isSymbolicLink()) throw new Error("refusing symlink script");
  const env = {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: join(HOME, ".agents-holding/sandbox-home"),
    LANG: "C",
    TMPDIR: join(HOME, ".agents-holding/sandbox-tmp"),
  };
  mkdirSync(env.HOME, { recursive: true });
  mkdirSync(env.TMPDIR, { recursive: true });
  const runBash = () => execFileSync("/bin/bash", [abs, ...args], {
    encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
  });
  if (platform() === "darwin") {
    const profile = `(version 1)
(deny default)
(allow process-exec (literal "/bin/bash") (literal "/bin/sh") (literal "/usr/bin/env") (literal "${abs}"))
(allow process-fork)
(allow sysctl-read)
(allow file-read* (subpath "${packDir}") (subpath "/usr") (subpath "/bin") (subpath "/System") (subpath "/Library") (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "${env.HOME}") (subpath "${env.TMPDIR}"))
(allow file-write* (subpath "${env.HOME}") (subpath "${env.TMPDIR}"))
(deny network*)
`;
    const pf = join(env.TMPDIR, `seatbelt-dep-${Date.now()}.sb`);
    writeFileSync(pf, profile);
    try {
      return execFileSync("sandbox-exec", ["-f", pf, "/bin/bash", abs, ...args], {
        encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
      });
    } catch (e) {
      const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join(" | ").slice(0, 400);
      throw new Error(`sandboxed run failed: ${detail || "unknown"}`);
    } finally { try { unlinkSync(pf); } catch {} }
  }
  return runBash();
}

function companiesUsing(name) {
  const root = join(HOME, ".config/agents-holding/state");
  const hits = [];
  if (!existsSync(root)) return hits;
  for (const c of readdirSync(root)) {
    const deps = loadRefs(c);
    if (deps.some((d) => d.name === name)) hits.push(c);
  }
  return hits;
}

function cmdAdd(link) {
  if (!link) { usage(); process.exit(2); }
  const company = companyOf();
  if (!company) throw new Error("no company resolved — pass --company <slug> or run inside a company workspace");
  const name = packNameFromLink(link);
  const dest = PACKS(name);
  const { reused, url } = clonePack(link, dest);
  const refs = loadRefs(company);
  if (refs.some((d) => d.name === name)) {
    const existing = refs.find((d) => d.name === name);
    if (existing && existing.url !== (url || link)) { existing.url = url || link; existing.updated_at = new Date().toISOString(); saveRefs(company, refs); }
    console.log(`already\t${name}\tcompany=${company}\t${dest}`);
  } else {
    refs.push({
      name,
      url: url || link,
      path: dest,
      added_at: new Date().toISOString(),
    });
    saveRefs(company, refs);
  }
  const idx = loadIndex();
  idx.packs[name] = { path: dest, url: url || link, updated_at: new Date().toISOString() };
  saveIndex(idx);
  const { entries, exposed } = exposePack(name, dest);
  console.log(`status\tok\t${reused ? "reused" : "cloned"}\tpack=${name}\tcompany=${company}`);
  console.log(`path\t${dest}`);
  console.log(`skills\t${entries.length}\texposed\t${exposed.length}`);
  console.log(`consent\tpack scripts need: holding dependency consent ${name}`);
  console.log(`note\tproject git is untouched; only a company reference was stored`);
}

function cmdList(asJson) {
  const company = companyOf();
  const refs = company ? loadRefs(company) : [];
  const idx = loadIndex();
  const packs = Object.keys(idx.packs || {});
  // also discover on-disk packs
  if (existsSync(PACKS())) {
    for (const n of readdirSync(PACKS())) {
      if (n === "index.json") continue;
      if (existsSync(PACKS(n, ".git")) && !packs.includes(n)) packs.push(n);
    }
  }
  if (asJson) {
    console.log(JSON.stringify({ company, refs, packs: packs.map((n) => ({
      name: n,
      path: PACKS(n),
      companies: companiesUsing(n),
      consent: hasConsent(PACKS(n)),
      head: gitHead(PACKS(n)),
    })) }, null, 2));
    return;
  }
  console.log(`company\t${company || "(none resolved)"}`);
  console.log("references:");
  if (!refs.length) console.log("  (none)");
  for (const d of refs) console.log(`  ${d.name}\t${d.url || "-"}\t${d.path || PACKS(d.name)}`);
  console.log("packs on disk:");
  if (!packs.length) console.log("  (none)");
  for (const n of packs) {
    const used = companiesUsing(n);
    const head = gitHead(PACKS(n));
    console.log(`  ${n}\tcompanies=${used.join(",") || "-"}\tconsent=${hasConsent(PACKS(n)) ? "yes" : "no"}\t${head || "-"}`);
  }
}

function gitHead(dir) {
  if (!existsSync(join(dir, ".git"))) return null;
  const r = runGit(["rev-parse", "--short", "HEAD"], { cwd: dir });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim();
}

function cmdUpdate(nameOrLink) {
  if (!nameOrLink) { usage(); process.exit(2); }
  const name = existsSync(PACKS(nameOrLink, ".git")) ? nameOrLink : packNameFromLink(nameOrLink);
  const dest = PACKS(name);
  if (!existsSync(join(dest, ".git"))) throw new Error(`no pack checkout at ${dest} — add it first`);
  // pull --rebase keeps local learning commits on top of upstream
  let r = runGit(["pull", "--rebase", "--autostash"], { cwd: dest });
  if (r.status !== 0) {
    // HTTPS fallback remotes if SSH remote fails
    const rem = runGit(["remote", "get-url", "origin"], { cwd: dest });
    const origin = (rem.stdout || "").trim();
    for (const url of cloneUrls(origin)) {
      if (url === origin) continue;
      runGit(["remote", "set-url", "origin", url], { cwd: dest });
      r = runGit(["pull", "--rebase", "--autostash"], { cwd: dest });
      if (r.status === 0) break;
    }
  }
  if (r.status !== 0) {
    let err = (r.stderr || r.stdout || "pull failed").trim().split("\n").slice(-3).join(" | ");
    err = err.replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted]");
    throw new Error(err);
  }
  const { entries, exposed } = exposePack(name, dest);
  const idx = loadIndex();
  if (idx.packs[name]) idx.packs[name].updated_at = new Date().toISOString();
  saveIndex(idx);
  console.log(`status\tok\tupdated\tpack=${name}\thead=${gitHead(dest)}`);
  console.log(`skills\t${entries.length}\texposed\t${exposed.length}`);
  console.log(`note\tlocal commits (if any) were rebased on top of upstream`);
}

function cmdRemove(nameOrLink, { purge = false } = {}) {
  if (!nameOrLink) { usage(); process.exit(2); }
  const company = companyOf();
  if (!company) throw new Error("no company resolved — pass --company <slug>");
  const name = existsSync(PACKS(nameOrLink, ".git")) ? nameOrLink : (() => {
    try { return packNameFromLink(nameOrLink); } catch { return sanitizeName(nameOrLink); }
  })();
  const detached = detachPackAttachments(company, name);
  if (detached.length) {
    console.log(`warn\tdetaching ${detached.length} pack-skill attachment(s) for pack=${name}:`);
    for (const a of detached) console.log(`  ${a.staff}\t${a.ref}`);
  }
  const refs = loadRefs(company).filter((d) => d.name !== name);
  saveRefs(company, refs);
  const still = companiesUsing(name);
  if (!still.length) {
    unexposePack(name);
    if (purge) {
      const dest = PACKS(name);
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      const idx = loadIndex();
      delete idx.packs[name];
      saveIndex(idx);
      console.log(`status\tok\tremoved-ref+purged\tpack=${name}\tcompany=${company}`);
    } else {
      console.log(`status\tok\tremoved-ref\tpack=${name}\tcompany=${company}`);
      console.log(`note\tpack checkout kept at ${PACKS(name)} (un-exposed). Pass --purge to delete it.`);
    }
  } else {
    console.log(`status\tok\tremoved-ref\tpack=${name}\tcompany=${company}`);
    console.log(`note\tstill used by: ${still.join(", ")} — pack left shared`);
  }
}

function cmdConsent(name, revoke) {
  if (!name) { console.log("usage: holding dependency consent <name> [--revoke]"); process.exit(2); }
  const dest = PACKS(name);
  if (!existsSync(dest)) throw new Error(`no pack ${name}`);
  if (revoke) {
    revokeConsent(dest);
    console.log(`revoked\t${name}`);
  } else {
    console.log(`→ ${grantConsent(dest)}`);
    console.log(`scripts may now run: holding dependency run ${name} <relative-script> [args...]`);
  }
}

function cmdRun(name, rel, args) {
  if (!name || !rel) { console.log("usage: holding dependency run <name> <scripts/file> [args...]"); process.exit(2); }
  const dest = PACKS(name);
  if (!existsSync(dest)) throw new Error(`no pack ${name}`);
  const out = runPackScript(dest, rel, args);
  process.stdout.write(out);
}

function cmdExpose(name) {
  if (!name) { usage(); process.exit(2); }
  const dest = PACKS(name);
  if (!existsSync(dest)) throw new Error(`no pack ${name}`);
  const { entries, exposed } = exposePack(name, dest);
  console.log(`status\tok\texposed\tpack=${name}\tskills=${entries.length}\tlinks=${exposed.length}`);
}

function usage() {
  console.log(`usage: holding dependency <verb>
  add <link>              clone pack to ~/.agents-holding/packs/<name>, store company ref, expose skills
  list                    company refs + packs on disk
  update <name|link>      pull --rebase upstream (local learning commits stay)
  remove <name|link>      drop company ref (--purge deletes unused checkout)
  consent <name> [--revoke]   allow / revoke pack scripts
  run <name> <script> [args]  run one pack script (needs consent; sandboxed)
  expose <name>           re-adapt pack skills for Grok/Claude/Codex/local AI

Packs live outside the project repo. Multiple companies may share one pack.
Commands only: holding dependency <verb> (no aliases).`);
}

const argv = process.argv.slice(2).filter((a) => a !== "--");
const jsonIdx = argv.indexOf("--json");
const asJson = jsonIdx >= 0;
if (asJson) argv.splice(jsonIdx, 1);
const purge = argv.includes("--purge");
const revoke = argv.includes("--revoke");
const cleaned = argv.filter((a) => a !== "--purge" && a !== "--revoke");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const verb = (cleaned[0] || "list").toLowerCase();
const rest = cleaned.slice(1);

try {
  switch (verb) {
    case "add":
      cmdAdd(rest[0]);
      break;
    case "list":
    case "":
      cmdList(asJson);
      break;
    case "update":
      cmdUpdate(rest[0]);
      break;
    case "remove":
      cmdRemove(rest[0], { purge });
      break;
    case "consent":
      cmdConsent(rest[0], revoke);
      break;
    case "run":
      cmdRun(rest[0], rest[1], rest.slice(2));
      break;
    case "expose":
      cmdExpose(rest[0]);
      break;
    case "-h":
    case "--help":
    case "help":
      usage();
      break;
    default:
      usage();
      process.exit(2);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}

}
