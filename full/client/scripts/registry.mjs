// Project registry: ~/.config/agents-holding/projects.json (chmod 600, NO secrets). Many-to-many:
// one repo can be fed by several Jira boards, one board can feed several repos.
//   { "version": 1, "projects": [ { "name": "web", "path": "/abs/repo",
//       "boards": [ { "site": "https://x.atlassian.net", "project_key": "KAN", "company": "acme-123" } ],
//       "settings": { "auto_pr": null, "agent": "grok", "workflow": null } } ] }
// settings: auto_pr null = follow the server/company flag, false = force off locally; agent/workflow are per-repo hints.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const registryPath = (home) => join(home, ".config/agents-holding/projects.json");
export const empty = () => ({ version: 1, projects: [] });
export const projectKeyOf = (issue) => (String(issue ?? "").match(/^([A-Z][A-Z0-9_]*)-\d+$/) ?? [])[1] ?? null;
// Registry boards store the human-facing Jira site, while OAuth clients may
// expose an Atlassian API/ex-jira base. Compare canonical identities when
// possible; an API cloud id cannot be derived back into a site hostname.
const siteKey = (site) => {
  if (!site) return null;
  try {
    const u = new URL(String(site));
    const m = u.pathname.match(/^\/ex\/jira\/([^/]+)/i);
    return m ? `cloud:${m[1].toLowerCase()}` : `host:${u.hostname.toLowerCase()}`;
  } catch { return String(site).replace(/\/$/, "").toLowerCase(); }
};
const sameSite = (a, b) => !a || !b || siteKey(a) === siteKey(b);

export function load(home) {
  const p = registryPath(home); if (!existsSync(p)) return null;
  let j; try { j = JSON.parse(readFileSync(p, "utf8")); } catch (e) {
    console.error(`agents-holding: ${p} is corrupted (${e.message.split("\n")[0]}). Fix it or move it away (mv "${p}" "${p}.bad") and re-run holding project add.`); process.exit(3); }
  return { version: 1, projects: [], ...(j && typeof j === "object" ? j : {}) };
}
export function save(home, reg) {
  const p = registryPath(home); mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  for (const pr of reg.projects) for (const k of Object.keys(pr)) if (/token|secret|password|key$/i.test(k) && k !== "project_key") throw new Error(`refusing to store secret-looking field ${k}`);
  writeFileSync(p + ".tmp", JSON.stringify(reg, null, 1) + "\n", { mode: 0o600 }); renameSync(p + ".tmp", p); chmodSync(p, 0o600);
}
/** Add (or extend) a repo with one board. Same board on several repos and several boards on one repo are both allowed. */
export function addBoard(reg, { path, name, site, project_key, company, settings }) {
  path = resolve(path); let pr = reg.projects.find((x) => x.path === path);
  if (!pr) {
    let n = name || basename(path); const taken = new Set(reg.projects.map((x) => x.name)); for (let i = 2; taken.has(n); i++) n = `${name || basename(path)}-${i}`;
    pr = { name: n, path, boards: [], settings: { auto_pr: null, agent: "grok", workflow: null } }; reg.projects.push(pr);
  }
  if (settings) pr.settings = { ...pr.settings, ...settings };
  const b = { site: site ?? null, project_key: project_key.toUpperCase(), company };
  if (!pr.boards.some((x) => x.project_key === b.project_key && x.company === b.company && sameSite(x.site, b.site))) pr.boards.push(b);
  return pr;
}
/** Remove a board from a repo (or the whole repo if no key). Returns the number of removed entries. */
export function removeBoard(reg, { path, project_key }) {
  path = resolve(path); const pr = reg.projects.find((x) => x.path === path || x.name === path.split("/").pop()); if (!pr) return 0;
  if (!project_key) { reg.projects = reg.projects.filter((x) => x !== pr); return 1; }
  const n = pr.boards.length; pr.boards = pr.boards.filter((b) => b.project_key !== project_key.toUpperCase());
  if (!pr.boards.length) reg.projects = reg.projects.filter((x) => x !== pr);
  return n - pr.boards.length;
}
export const companies = (reg) => [...new Set(reg.projects.flatMap((p) => p.boards.map((b) => b.company)).filter(Boolean))];

// The local registry is a materialized view of canonical company/project config.
// Reconcile it at every listener/install/migrate boundary so a stale machine
// cannot silently drop a Jira project.  This is deliberately independent of
// any product/company name (parent and child repos are ordinary registrations).
export function reconcile(reg, { fileExists = existsSync, readCompany = (p) => {
  try { return JSON.parse(readFileSync(join(p, ".agents/company.json"), "utf8")).company ?? null; } catch { return null; }
} } = {}) {
  const issues = [], repaired = [], seen = new Map();
  for (const p of reg.projects ?? []) {
    p.path = resolve(p.path);
    if (!fileExists(p.path)) issues.push({ code: "missing_repo", path: p.path, message: `registered repo is missing: ${p.path}` });
    const configured = readCompany(p.path);
    // A registry entry is sufficient for routing.  .agents/company.json is
    // optional local metadata and must not take a registered repo offline.
    // This matters on machines where the repo is shared without its local
    // Company OS metadata.
    if (configured) {
      for (const b of p.boards ?? []) if (b.company !== configured) { repaired.push({ code: "company_identity", path: p.path, from: b.company, to: configured, project_key: b.project_key }); b.company = configured; }
    }
    for (const b of p.boards ?? []) {
      const key = `${b.site ?? ""}|${b.project_key}|${b.company}`;
      const prior = seen.get(key);
      if (prior && prior.path !== p.path) issues.push({ code: "duplicate_mapping", key, paths: [prior.path, p.path], message: `Jira ${b.project_key} has duplicate repo mappings: ${prior.path}, ${p.path}` });
      else seen.set(key, p);
      if (!b.project_key || !b.company) issues.push({ code: "incomplete_mapping", path: p.path, message: `${p.path} contains a project mapping without project key/company` });
    }
  }
  // Remove exact duplicate boards after identity repair. Different repos remain
  // ambiguous and are intentionally left for repo:<name>/component selection.
  for (const p of reg.projects ?? []) {
    const before = p.boards?.length ?? 0;
    p.boards = [...new Map((p.boards ?? []).map((b) => [`${b.site ?? ""}|${b.project_key}|${b.company}`, b])).values()];
    if (p.boards.length !== before) repaired.push({ code: "duplicate_entry", path: p.path });
  }
  return { registry: reg, issues, repaired };
}
export function clearRegistrationIssue(reg, { path, project_key, company }) {
  const p = (reg.projects ?? []).find((x) => resolve(x.path) === resolve(path));
  return !!p?.boards?.some((b) => b.project_key === project_key.toUpperCase() && b.company === company);
}
export const registrationComment = (issue, issues) => `[agent-holding] [Tech Lead] REGISTRATION ACTION REQUIRED\n${issue} was not routed because the company/project registration is invalid.\n` +
  issues.map((x) => `- ${x.message}`).join("\n") + "\nFix the canonical company config or run `holding project add --repo <repo> --jira-project <KEY> --company <company>`, then restart the listener. The task was not run.";
/** Repos fed by the board of this issue (company + project key prefix, optional site). */
export function candidates(reg, { company, issue, site }) {
  const key = projectKeyOf(issue);
  return reg.projects.filter((p) => p.boards.some((b) => (!company || b.company === company) && (!key || b.project_key === key || b.project_key === "*") && sameSite(b.site, site)));
}
/**
 * Which repo(s) does a task target?  -> { repos: [project...] } | { ask: [names] } | { none: true }
 * One candidate: that repo. Several: Jira labels "repo:<name>" (several allowed) or components named like a repo; label "repo:all" = all.
 * Several and no marker: { ask } -- never guess; the listener comments on the issue and waits.
 */
export function route(reg, { company, issue, site, labels = [], components = [] }) {
  const c = candidates(reg, { company, issue, site });
  if (!c.length) return { none: true };
  if (c.length === 1) return { repos: c };
  const lab = labels.map((l) => String(l).toLowerCase()).filter((l) => l.startsWith("repo:")).map((l) => l.slice(5));
  if (lab.includes("all")) return { repos: c };
  const want = new Set([...lab, ...components.map((x) => String(x?.name ?? x).toLowerCase())]);
  const hit = c.filter((p) => want.has(p.name.toLowerCase()));
  return hit.length ? { repos: hit } : { ask: c.map((p) => p.name) };
}
/** Route a foreground replay to a specific registered repo and resolve its board company. */
export function routeForRepo(reg, { repo, company, issue, site, labels = [], components = [] }) {
  const path = resolve(repo); const pr = reg.projects.find((p) => resolve(p.path) === path);
  if (!pr) return { none: true };
  const key = projectKeyOf(issue);
  const boards = pr.boards.filter((b) => !key || b.project_key === key || b.project_key === "*");
  // --repo is an explicit routing decision. If OAuth gives us only an
  // api.atlassian.com cloud endpoint, keep the repo-scoped replay usable while
  // still requiring the issue key to belong to a board on that repo.
  const board = boards.find((b) => sameSite(b.site, site)) ?? (boards.length === 1 ? boards[0] : null);
  if (!board) return { none: true };
  const scoped = { ...reg, projects: [pr] };
  return { ...route(scoped, { company: company ?? board.company, issue, site: board.site, labels, components }), company: board.company };
}
export const askComment = (issue, names) => `[agent-holding] [Tech Lead] WHICH REPO?\n${issue} is on a board that feeds several repos: ${names.join(", ")}.\n` +
  `Add a label repo:<name> (one per repo, e.g. repo:${names[0]}; repo:all for every repo) or a component with the repo name, then move or comment on the card again. Nothing was run.`;
/** One-time migration of the old single-repo setup (AH_REPO_DIR / --repo) into the registry. */
export function migrate(home, repo, { site } = {}) {
  if (!repo || !existsSync(join(repo, ".agents/company.json"))) return null;
  const company = JSON.parse(readFileSync(join(repo, ".agents/company.json"), "utf8")).company;
  let keys = []; try { keys = [...new Set(readdirSync(join(home, ".config/agents-holding/state", company)).map((f) => projectKeyOf(f.replace(/\.json$/, ""))).filter(Boolean))]; } catch {}
  const reg = empty();
  if (!keys.length) keys = ["*"];
  for (const k of keys) addBoard(reg, { path: repo, site, project_key: k, company });
  return reg;
}
