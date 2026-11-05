#!/usr/bin/env node
// Local roles: ~/.config/agents-holding/state/<company>/roles/{public,private}/<role>/
// Private roles NEVER sync (name, prompt, skills). Process structure uses opaque ids private-role-<hash>.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

globalThis.__ahSha256Hex = (s) => createHash("sha256").update(s).digest("hex");
const { opaquePrivateRoleId, isOpaquePrivateRole, scrubProcessStructure, PRIVATE_ROLE_RE } = await import("./role-privacy.mjs");

const state = (co, home = process.env.HOME || homedir()) => join(home, ".config/agents-holding/state", co);
const rolesRoot = (co, home) => join(state(co, home), "roles");
const privacyFile = (co, home) => join(state(co, home), "privacy.json");

export function companySalt(co, home = process.env.HOME || homedir()) {
  const f = privacyFile(co, home);
  if (existsSync(f)) {
    try { const j = JSON.parse(readFileSync(f, "utf8")); if (j.salt && /^[a-f0-9]{32,}$/i.test(j.salt)) return j.salt; } catch {}
  }
  mkdirSync(state(co, home), { recursive: true });
  const salt = randomBytes(32).toString("hex");
  writeFileSync(f, JSON.stringify({ salt, created_at: new Date().toISOString() }, null, 2));
  return salt;
}

export function listRoles(co, home = process.env.HOME || homedir()) {
  const root = rolesRoot(co, home); const out = [];
  for (const vis of ["public", "private"]) {
    const d = join(root, vis); if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) {
      const dir = join(d, name); out.push({ name, vis, dir, opaque: vis === "private" ? opaquePrivateRoleId(companySalt(co, home), name) : null });
    }
  }
  return out;
}

export function isPrivateRole(co, name, home = process.env.HOME || homedir()) {
  return existsSync(join(rolesRoot(co, home), "private", name));
}

export function setRoleVisibility(co, name, vis, home = process.env.HOME || homedir()) {
  if (!["public", "private"].includes(vis)) throw new Error("public|private");
  const root = rolesRoot(co, home);
  const from = ["public", "private"].map((v) => join(root, v, name)).find(existsSync);
  if (!from) {
    // allow marking a roster-only role by creating a private stub folder
    mkdirSync(join(root, vis, name), { recursive: true });
    writeFileSync(join(root, vis, name, "README.md"), `# ${name}\nLocal role marker. Private roles never sync name/prompt/skills.\n`);
    return { name, vis, opaque: vis === "private" ? opaquePrivateRoleId(companySalt(co, home), name) : null };
  }
  const to = join(root, vis, name);
  if (from === to) return { name, vis, opaque: vis === "private" ? opaquePrivateRoleId(companySalt(co, home), name) : null };
  mkdirSync(join(root, vis), { recursive: true });
  renameSync(from, to);
  return { name, vis, opaque: vis === "private" ? opaquePrivateRoleId(companySalt(co, home), name) : null };
}

/** Scrub process/flow JSON before any server upload. */
export function scrubForUpload(co, structure, home = process.env.HOME || homedir()) {
  const salt = companySalt(co, home);
  return scrubProcessStructure(structure, { salt, isPrivateLocal: (id) => isPrivateRole(co, id, home) });
}

export { opaquePrivateRoleId, isOpaquePrivateRole, PRIVATE_ROLE_RE };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, co, name, vis] = process.argv.slice(2);
  if (cmd === "list") { console.log(JSON.stringify(listRoles(co || process.env.AH_COMPANY), null, 2)); }
  else if (cmd === "set" && name && (vis === "public" || vis === "private")) {
    const r = setRoleVisibility(co || process.env.AH_COMPANY, name, vis);
    console.log(vis === "private"
      ? `Role ${name} is private (never synced). Synced processes will show it as ${r.opaque} only.`
      : `Role ${name} is public (may sync name/persona/skills per existing rules).`);
  } else {
    console.log("usage: roles.mjs list <company> | set <company> <role> public|private");
    process.exit(cmd ? 1 : 0);
  }
}
