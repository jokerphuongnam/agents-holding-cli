// Company resolution (holding CLI + slash commands):
// --company X > AH_COMPANY >
// nearest repo .agents/<folder>/ with COMPANY.md|COMPANY_BOOT.md (any folder name; if several, prefer
//   active from `holding company use` when it matches one of them; else leave unresolved) >
// legacy .agents/company.json > active alone.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const H = () => process.env.HOME || homedir();
export const activePath = (home = H()) => join(home, ".config/agents-holding/active");
export const getActive = (home = H()) => { try { return readFileSync(activePath(home), "utf8").trim() || null; } catch { return null; } };

const MARKERS = ["COMPANY.md", "COMPANY_BOOT.md"];
function isCompanyDir(agents, name) {
  try {
    const dir = join(agents, name);
    if (!statSync(dir).isDirectory()) return false;
    if (name === "." || name === ".." || name.startsWith(".")) return false;
    return MARKERS.some((m) => existsSync(join(dir, m)));
  } catch { return false; }
}

/** Walk cwd→root. Collect company folders under .agents/; resolve one. Legacy company.json is last resort at that level. */
export function fromCwd(cwd = process.cwd(), { active = null } = {}) {
  let d = cwd;
  for (;;) {
    const agents = join(d, ".agents");
    try {
      if (existsSync(agents) && statSync(agents).isDirectory()) {
        const dirs = readdirSync(agents).filter((n) => isCompanyDir(agents, n));
        if (dirs.length === 1) return { company: dirs[0], source: `.agents/${dirs[0]}` };
        if (dirs.length > 1) {
          if (active && dirs.includes(active)) return { company: active, source: `.agents/${active} (active)` };
          // ambiguous: do not guess; keep walking? No — this repo's .agents is the stop; leave unresolved so caller can ask.
          return { company: null, source: null, candidates: dirs.map((n) => `.agents/${n}`) };
        }
        // no marked folders: legacy company.json at this level
        try {
          const j = JSON.parse(readFileSync(join(agents, "company.json"), "utf8"));
          if (j?.company) return { company: String(j.company), source: ".agents/company.json (legacy)" };
        } catch {}
      }
    } catch {}
    const p = join(d, "..");
    if (p === d) return null;
    d = p;
  }
}

export function resolveCompany({ argv = process.argv.slice(2), env = process.env, cwd = process.cwd(), home = H() } = {}) {
  const i = argv.indexOf("--company");
  if (i >= 0 && argv[i + 1]) return { company: argv[i + 1], source: "--company" };
  if (env.AH_COMPANY) return { company: env.AH_COMPANY, source: "AH_COMPANY" };
  const active = getActive(home);
  const hit = fromCwd(cwd, { active });
  if (hit?.company) return { company: hit.company, source: hit.source };
  if (hit?.candidates) return { company: null, source: null, candidates: hit.candidates };
  if (active) return { company: active, source: "active (holding company use)" };
  return { company: null, source: null };
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
