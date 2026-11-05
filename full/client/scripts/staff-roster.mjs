// Reconcile hand-created local staff with the authoritative server roster.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { listRoles, opaquePrivateRoleId, companySalt } from "./roles.mjs";
import { fromCwd, getActive } from "./company.mjs";

export const overLimitError = (role, count, limit) => `error: staff ${role} is over the plan limit (${count}/${limit}). Upgrade or remove a staff.`;
export const inactiveError = (role) => `error: staff ${role} is not active (over plan limit). Run holding staff sync or register it with holding staff add ${role}.`;
const valid = (s) => /^[a-z][a-z0-9-]{0,59}$/.test(s);
const filesUnder = (root) => {
  const out = [];
  try { for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p)); else out.push(p);
  } } catch {}
  return out;
};
export function localStaff(cwd = process.cwd(), company = null, home = process.env.HOME || homedir()) {
  const co = company || fromCwd(cwd, { active: getActive(home) })?.company;
  if (!co) return [];
  const found = new Map();
  const add = (name, path, visibility = "public") => { if (valid(name) && name !== "org" && !found.has(name)) found.set(name, { name, path, visibility, id: name }); };
  const root = join(cwd, ".agents", co);
  for (const p of filesUnder(join(root, "system", "staffs"))) if (/\.md$/i.test(p) && !/readme/i.test(basename(p))) add(basename(p).slice(0, -3).toLowerCase(), p);
  for (const p of filesUnder(join(root, "staffs"))) if (/\.md$/i.test(p) && !/readme/i.test(basename(p))) add(basename(p).slice(0, -3).toLowerCase(), p);
  // Company-local role folders: public/<name>/AGENT.md and private/<name>/AGENT.md.
  for (const vis of ["public", "private"]) {
    const d = join(root, "roles", vis); if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) if (statSync(join(d, name)).isDirectory() && existsSync(join(d, name, "AGENT.md"))) add(name.toLowerCase(), join(d, name, "AGENT.md"), vis);
  }
  // Existing client config keeps roles in the user config, including private roles.
  for (const r of listRoles(co, home)) add(r.name, r.dir, r.vis);
  const out = [...found.values()];
  for (const r of out) if (r.visibility === "private") r.id = listRoles(co, home).find((x) => x.name === r.name)?.opaque ?? opaquePrivateRoleId(companySalt(co, home), r.name);
  return out;
}
export function reconcileStaff(local, server, limit) {
  const roster = new Set(server?.roster ?? server?.data?.roster ?? []);
  const out = [], max = limit ?? server?.limit ?? server?.roster_limit ?? null;
  for (const r of local) {
    if (roster.has(r.id)) out.push({ ...r, active: true, status: "active" });
    else if (max != null && roster.size >= max) out.push({ ...r, active: false, status: "not active (over plan limit)", error: overLimitError(r.name, roster.size, max) });
    else out.push({ ...r, active: false, status: "not registered", error: inactiveError(r.name) });
  }
  return out;
}
export function statusFile(home, company) { return join(home, ".config/agents-holding/state", company, "staff-status.json"); }
export function writeStaffStatus(home, company, rows) {
  const byName = Object.fromEntries(rows.map((r) => [r.name, { status: r.status, active: r.active, ...(r.id !== r.name ? { server_id: r.id } : {}) }]));
  const f = statusFile(home, company); mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
  writeFileSync(f, JSON.stringify({ server_checked_at: new Date().toISOString(), staff: byName }, null, 2), { mode: 0o600 });
}
export function rosterEntry(local, role) {
  const r = local.find((x) => x.name === role || x.id === role);
  return r ? { ...r, id: r.id ?? r.name } : { name: role, id: role, path: null, visibility: "public" };
}
