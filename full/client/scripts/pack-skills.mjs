#!/usr/bin/env node
/**
 * Local pack-skill attachments for company dependency packs.
 * holding skill add|remove|list resolve pack skills as <pack>/<skill> or unique name;
 * staff brief enrichment loads adapted pack skill text. Pack update keeps attachments;
 * dependency remove detaches with a warning.
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  readdirSync, statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { resolveCompany as _resolveCompany } from "./company.mjs";

const HOME = process.env.HOME || homedir();
const PACKS = (...p) => join(HOME, ".agents-holding", "packs", ...p);
const STATE = (...p) => join(HOME, ".config", "agents-holding", "state", ...p);
const LIB = (...p) => join(HOME, ".agents-holding", "skills", "library", ...p);
const LOCAL = (...p) => join(HOME, ".agents-holding", "skills", ...p);
const LOCAL_CACHE = (...p) => join(HOME, ".config", "agents-holding", "cache", ...p);

function resolveCompany(argv = process.argv.slice(2)) {
  try {
    return _resolveCompany({ argv, env: process.env, cwd: process.cwd(), home: HOME });
  } catch {
    return { company: process.env.AH_COMPANY || null, source: "env" };
  }
}

function companyOf(argv) {
  return resolveCompany(argv)?.company || process.env.AH_COMPANY || null;
}

function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}

function writeJson(p, obj, mode = 0o600) {
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", { mode });
}

function attachPath(company) {
  return STATE(company, "pack-skills.json");
}

export function loadAttachments(company) {
  if (!company) return [];
  const j = readJson(attachPath(company), { attachments: [] });
  return Array.isArray(j?.attachments) ? j.attachments : [];
}

function saveAttachments(company, attachments) {
  if (!company) throw new Error("no company resolved — pass --company <slug>");
  writeJson(attachPath(company), { attachments, updated_at: new Date().toISOString() });
}

function loadRefs(company) {
  if (!company) return [];
  const j = readJson(STATE(company, "dependencies.json"), { dependencies: [] });
  return Array.isArray(j?.dependencies) ? j.dependencies : [];
}

function loadMeta(name) {
  return readJson(PACKS(name, ".ah-meta.json"), { name, entries: [], exposed: [] }) || { entries: [] };
}

/** All skill entries from packs this company references (and on-disk packs if no company). */
export function availablePackSkills(company) {
  const refs = company ? loadRefs(company) : [];
  const names = refs.map((d) => d.name);
  if (!names.length && existsSync(PACKS())) {
    // fallback: nothing referenced — still allow resolve against on-disk packs for diagnose
  }
  const out = [];
  for (const name of names) {
    const meta = loadMeta(name);
    for (const e of meta.entries || []) {
      if (e.kind && e.kind !== "skill") continue;
      out.push({
        pack: name,
        skill: e.id,
        ref: `${name}/${e.id}`,
        kind: e.kind || "skill",
        rel: e.rel || null,
      });
    }
  }
  return out;
}

/**
 * Resolve <pack>/<skill> or unique skill name among company dependency packs.
 * Returns { pack, skill, ref } or null. Throws on ambiguous unique-name match.
 */
export function resolvePackSkill(company, raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const all = availablePackSkills(company);
  if (!all.length) return null;

  if (s.includes("/")) {
    const [pack, ...rest] = s.split("/");
    const skill = rest.join("/");
    const hit = all.find((x) => x.pack === pack && x.skill === skill);
    if (!hit) throw new Error(`pack skill not found: ${s} (add the pack with holding dependency add, or check holding dependency list)`);
    return hit;
  }

  // also accept ah-pack-<pack>-<skill> library slug
  const m = /^ah-pack-([a-z0-9-]+)-([a-z0-9-]+)$/.exec(s);
  if (m) {
    const hit = all.find((x) => x.pack === m[1] && x.skill === m[2]);
    if (hit) return hit;
  }

  const hits = all.filter((x) => x.skill === s);
  if (!hits.length) return null;
  if (hits.length > 1) {
    throw new Error(
      `skill "${s}" matches multiple packs: ${hits.map((h) => h.ref).join(", ")}. Use <pack>/<skill>.`,
    );
  }
  return hits[0];
}

export function attachPackSkill(company, staff, hit) {
  if (!company) throw new Error("no company resolved — pass --company <slug>");
  if (!staff) throw new Error("missing <staff>");
  if (!hit?.pack || !hit?.skill) throw new Error("missing pack skill");
  const list = loadAttachments(company);
  const ref = hit.ref || `${hit.pack}/${hit.skill}`;
  if (list.some((a) => a.staff === staff && a.pack === hit.pack && a.skill === hit.skill)) {
    return { already: true, ref, staff };
  }
  list.push({
    staff,
    pack: hit.pack,
    skill: hit.skill,
    ref,
    added_at: new Date().toISOString(),
  });
  saveAttachments(company, list);
  return { already: false, ref, staff };
}

export function detachPackSkill(company, staff, raw) {
  if (!company) throw new Error("no company resolved — pass --company <slug>");
  const list = loadAttachments(company);
  let pack = null, skill = null;
  try {
    const hit = resolvePackSkill(company, raw);
    if (hit) { pack = hit.pack; skill = hit.skill; }
  } catch {
    // may already be detached / pack removed — parse ref form
  }
  if (!pack && String(raw).includes("/")) {
    const [p, ...r] = String(raw).split("/");
    pack = p; skill = r.join("/");
  }
  if (!pack) {
    // match by skill id alone among attachments for this staff
    const cand = list.filter((a) => a.staff === staff && (a.skill === raw || a.ref === raw));
    if (cand.length === 1) { pack = cand[0].pack; skill = cand[0].skill; }
    else if (cand.length > 1) {
      throw new Error(`ambiguous: ${cand.map((c) => c.ref).join(", ")}. Use <pack>/<skill>.`);
    }
  }
  if (!pack) return { removed: false, reason: "not-attached" };
  const keep = [];
  let removed = null;
  for (const a of list) {
    if (a.staff === staff && a.pack === pack && a.skill === skill) removed = a;
    else keep.push(a);
  }
  if (!removed) return { removed: false, reason: "not-attached", ref: `${pack}/${skill}` };
  saveAttachments(company, keep);
  return { removed: true, ref: removed.ref, staff };
}

/** Detach every attachment for a pack (dependency remove). Returns detached rows. */
export function detachPackAttachments(company, packName) {
  if (!company || !packName) return [];
  const list = loadAttachments(company);
  const keep = [], gone = [];
  for (const a of list) {
    if (a.pack === packName) gone.push(a);
    else keep.push(a);
  }
  if (gone.length) saveAttachments(company, keep);
  return gone;
}

export function attachmentsForStaff(company, staff) {
  return loadAttachments(company).filter((a) => a.staff === staff || a.staff === "*");
}

function squash(t, n) {
  return String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function readPackSkillSummary(att) {
  const slug = `ah-pack-${att.pack}-${att.skill}`;
  const lib = LIB(slug, "SKILL.md");
  let md = null;
  if (existsSync(lib)) {
    try { md = readFileSync(lib, "utf8"); } catch {}
  }
  if (!md) {
    const meta = loadMeta(att.pack);
    const e = (meta.entries || []).find((x) => x.id === att.skill);
    if (e?.rel) {
      const p = PACKS(att.pack, e.rel);
      if (existsSync(p)) {
        try { md = readFileSync(p, "utf8"); } catch {}
      }
    }
  }
  if (!md) return `[pack:${att.pack}] skill ${att.skill} (content not found — run holding dependency update ${att.pack})`;
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  const body = fm ? fm[2] : md;
  let desc = "";
  if (fm) {
    const d = /^description:\s*(.*)$/m.exec(fm[1]);
    if (d) desc = d[1].trim().replace(/^["']|["']$/g, "");
  }
  return squash(desc ? `${desc}\n${body}` : body, 1400);
}

/** Merge attached pack skills into a staff_brief-shaped object. */
export function enrichBriefWithPackSkills(company, role, brief) {
  const atts = attachmentsForStaff(company, role);
  if (!atts.length) return brief;
  const base = brief && typeof brief === "object"
    ? { ...brief, skills: [...(brief.skills || [])] }
    : { role, persona: null, skills: [] };
  for (const a of atts) {
    const id = a.ref || `${a.pack}/${a.skill}`;
    if (base.skills.some((s) => s.id === id || s.id === a.skill || s.id === `ah-pack-${a.pack}-${a.skill}`)) continue;
    base.skills.push({ id, summary: readPackSkillSummary(a) });
  }
  return base;
}

function localSkillFiles() {
  const out = [];
  for (const vis of ["public", "private"]) {
    const root = LOCAL(vis);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const p = join(root, name, "SKILL.md");
      if (existsSync(p) && statSync(p).isFile()) out.push({ name, vis, path: p });
    }
  }
  return out;
}

function localSkillSummary(path) {
  let md = "";
  try { md = readFileSync(path, "utf8"); } catch { return null; }
  const hash = createHash("sha256").update(md).digest("hex");
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  const desc = fm?.[1]?.match(/^description:\s*(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  const body = fm ? fm[2] : md;
  return { hash, summary: squash(desc ? `${desc}\n${body}` : body, 1400) };
}

/** Inject local skills; private content never leaves this machine. */
export function enrichBriefWithLocalSkills(company, role, brief) {
  const base = brief && typeof brief === "object"
    ? { ...brief, skills: [...(brief.skills || [])] }
    : { role, persona: null, skills: [] };
  const cachePath = LOCAL_CACHE(company || "_global", "skills.json");
  const cache = readJson(cachePath, {});
  let changed = false;
  for (const s of localSkillFiles()) {
    const x = localSkillSummary(s.path);
    if (!x) continue;
    const key = `${s.vis}/${s.name}`;
    if (cache[key]?.hash !== x.hash) { cache[key] = { hash: x.hash, summary: x.summary, updated_at: new Date().toISOString() }; changed = true; }
    const id = `local/${s.vis}/${s.name}`;
    if (!base.skills.some((v) => v.id === id)) base.skills.push({ id, visibility: s.vis, summary: cache[key].summary });
  }
  if (changed) writeJson(cachePath, cache);
  return base;
}

/** Create pointer skills for a dependency without copying its repository. */
export function createPrivatePackMappings(company, pack, entries) {
  const mappings = [];
  for (const e of (entries || []).filter((x) => x.kind === "skill")) {
    const slug = `ah-pack-${pack}-${e.id}`;
    const dir = LOCAL("private", slug);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const md = `---\nname: ${slug}\ndescription: ${JSON.stringify(`[private mapping] ${e.description || e.id} from dependency ${pack}`)}\nversion: 1\nvisibility: private\nsource_pack: ${pack}\nsource_entry: ${e.rel || ""}\n---\n# Private dependency mapping\n\nUse this mapped skill only when relevant. Dependency checkout: \`${PACKS(pack)}\`\n\nSource entry: \`${e.rel || ""}\`\n\nInspect the source before applying it. Do not copy the whole dependency into this skill directory or run dependency scripts without explicit consent.\n`;
    const path = join(dir, "SKILL.md");
    if (!existsSync(path) || readFileSync(path, "utf8") !== md) writeFileSync(path, md, { mode: 0o600 });
    mappings.push({ staff: "*", pack, skill: e.id, ref: `${pack}/${e.id}`, source: "private-mapping", updated_at: new Date().toISOString() });
  }
  if (company && mappings.length) {
    const current = loadAttachments(company).filter((a) => !(a.pack === pack && a.source === "private-mapping"));
    saveAttachments(company, [...current, ...mappings]);
  }
  return mappings;
}

/** True when every listed skill id is covered by a pack attachment for this staff. */
export function packSkillsCover(company, staff, skillIds = []) {
  if (!skillIds?.length) return true;
  const atts = attachmentsForStaff(company, staff);
  const have = new Set();
  for (const a of atts) {
    have.add(a.skill);
    have.add(a.ref);
    have.add(`ah-pack-${a.pack}-${a.skill}`);
  }
  return skillIds.every((id) => have.has(id) || have.has(String(id).split("/").pop()));
}

export function formatPackList(company, { staff = null } = {}) {
  const lines = [];
  const avail = availablePackSkills(company);
  const atts = loadAttachments(company);
  lines.push(`company\t${company || "(none)"}`);
  lines.push("pack skills (from holding dependency packs):");
  if (!avail.length) {
    lines.push("  (none — add a pack with holding dependency add <git-url>)");
  } else {
    for (const s of avail) {
      const who = atts.filter((a) => a.pack === s.pack && a.skill === s.skill).map((a) => a.staff);
      const mark = staff ? (who.includes(staff) ? "attached" : "available") : (who.length ? `attached:${who.join(",")}` : "available");
      lines.push(`  ${s.ref}\tpack=${s.pack}\t${mark}`);
    }
  }
  if (atts.length) {
    lines.push("attachments:");
    for (const a of atts) {
      if (staff && a.staff !== staff) continue;
      lines.push(`  ${a.staff}\t${a.ref}\tpack=${a.pack}`);
    }
    if (staff && !atts.some((a) => a.staff === staff)) lines.push("  (none for this staff)");
  }
  return lines.join("\n");
}

function usage() {
  console.log(`usage:
  holding skill add <staff> <skill>          # pack skill: <pack>/<skill> or unique name
  holding skill remove <staff> <skill>       # detach pack skill (local)
  holding skill list                         # shows pack skills + pack name, then server list
`);
}

function cmdAdd(staff, skill, company) {
  if (!staff || !skill) { usage(); process.exit(2); }
  if (!company) throw new Error("no company resolved — pass --company <slug>");
  const hit = resolvePackSkill(company, skill);
  if (!hit) throw new Error(`not a pack skill: ${skill}`);
  const r = attachPackSkill(company, staff, hit);
  console.log(r.already
    ? `already attached pack skill ${r.ref} to ${r.staff}`
    : `added pack skill ${r.ref} to ${r.staff}`);
}

function cmdRemove(staff, skill, company) {
  if (!staff || !skill) { usage(); process.exit(2); }
  if (!company) throw new Error("no company resolved — pass --company <slug>");
  const r = detachPackSkill(company, staff, skill);
  if (!r.removed) {
    console.error(`not attached as a pack skill: ${staff} ${skill}`);
    console.error("hint: catalog/custom skills need a server remove_skill tool (not deployed yet)");
    process.exit(1);
  }
  console.log(`removed pack skill ${r.ref} from ${r.staff}`);
}

function cmdList(company, argv) {
  const i = argv.indexOf("--staff");
  const staff = i >= 0 ? argv[i + 1] : null;
  console.log(formatPackList(company, { staff }));
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  const company = companyOf(rest);
  try {
    if (cmd === "add") cmdAdd(rest[0], rest[1], company);
    else if (cmd === "remove") cmdRemove(rest[0], rest[1], company);
    else if (cmd === "list") cmdList(company, rest);
    else if (cmd === "detach-pack") {
      // internal: holding dependency remove
      const pack = rest[0];
      const gone = detachPackAttachments(company, pack);
      if (gone.length) {
        console.log(`warn\tdetached ${gone.length} pack-skill attachment(s) for pack=${pack}:`);
        for (const a of gone) console.log(`  ${a.staff}\t${a.ref}`);
      }
    } else { usage(); process.exit(2); }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}
