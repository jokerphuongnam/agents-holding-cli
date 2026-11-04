// Company resolution, the same everywhere (holding CLI + Grok slash commands):
// --company X > nearest .agents/company.json from cwd up > active company (~/.config/agents-holding/active, set by holding company use).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const H = () => process.env.HOME || homedir();
export const activePath = (home = H()) => join(home, ".config/agents-holding/active");
export const getActive = (home = H()) => { try { return readFileSync(activePath(home), "utf8").trim() || null; } catch { return null; } };
export function fromCwd(cwd = process.cwd()) { let d = cwd; for (;;) { try { return JSON.parse(readFileSync(join(d, ".agents/company.json"), "utf8")).company ?? null; } catch {} const p = join(d, ".."); if (p === d) return null; d = p; } }
export function resolveCompany({ argv = process.argv.slice(2), env = process.env, cwd = process.cwd(), home = H() } = {}) {
  const i = argv.indexOf("--company");
  if (i >= 0 && argv[i + 1]) return { company: argv[i + 1], source: "--company" };
  if (env.AH_COMPANY) return { company: env.AH_COMPANY, source: "AH_COMPANY" };
  const c = fromCwd(cwd); if (c) return { company: c, source: ".agents/company.json" };
  const a = getActive(home); return a ? { company: a, source: "active (holding company use)" } : { company: null, source: null };
}
export const companyOrNull = (o) => resolveCompany(o).company;
/** Local companies: from projects.json boards + state/<company> dirs. */
export function localCompanies(home = H()) {
  let reg = { projects: [] }; try { reg = JSON.parse(readFileSync(join(home, ".config/agents-holding/projects.json"), "utf8")); } catch {}
  const m = new Map(), get = (id) => m.get(id) ?? (m.set(id, { company: id, repos: [], boards: [], staff: 0 }), m.get(id));
  for (const p of reg.projects ?? []) for (const b of p.boards ?? []) if (b.company) { const c = get(b.company); if (!c.repos.includes(p.path)) c.repos.push(p.path); c.boards.push(b.project_key); }
  try { for (const d of readdirSync(join(home, ".config/agents-holding/state"))) if (existsSync(join(home, ".config/agents-holding/state", d, "agent.json"))) get(d); } catch {}
  for (const c of m.values()) { try { c.staff = Object.keys(JSON.parse(readFileSync(join(home, ".config/agents-holding/state", c.company, "agent.json"), "utf8")).staff ?? {}).length; } catch {} }
  return [...m.values()];
}
export function setActive(company, home = H()) { mkdirSync(join(home, ".config/agents-holding"), { recursive: true, mode: 0o700 }); writeFileSync(activePath(home), company + "\n", { mode: 0o600 }); }
