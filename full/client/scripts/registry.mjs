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
const sameSite = (a, b) => !a || !b || a.replace(/\/$/, "").toLowerCase() === b.replace(/\/$/, "").toLowerCase();

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
