#!/usr/bin/env node
// holding project add | remove | list  -- manage ~/.config/agents-holding/projects.json (no secrets).
//   holding project add [--repo DIR] --jira-project KEY [--jira-project KEY2 ...] [--company ID] [--name NAME] [--site URL]
//                       [--auto-pr on|off|server] [--agent grok|claude|codex] [--workflow NAME] [--no-validate]
//   holding project remove [--repo DIR|NAME] [--jira-project KEY]     (no key = remove the repo)
//   holding project list [--json]
// Validation uses Jira lazily (OAuth Keychain or API token). Install / company create never call this.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as R from "./registry.mjs";
import * as L from "./lean.mjs";

const [cmd, ...args] = process.argv.slice(2);
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : [])).filter(Boolean);
const opt = (n, d) => all(n)[0] ?? d;
const home = homedir();
const die = (m) => { console.error("error: " + m); process.exit(2); };
const jiraCfg = (() => { try { return JSON.parse(readFileSync(join(home, ".config/agents-holding/jira.json"), "utf8")); } catch { return null; } })();
const reg = () => R.load(home) ?? R.empty();

async function validate(site, key) {
  const { atlassian } = await import("./attach.mjs");
  let A;
  try { A = await atlassian(home); }
  catch (e) { return `skipped (${e.message})`; }
  const base = A.jira || `${site.replace(/\/$/, "")}/rest/api/3`;
  const r = await fetch(`${base}/project/${encodeURIComponent(key)}`, { headers: { Authorization: A.auth(), Accept: "application/json" } });
  if (!r.ok) die(`Jira project ${key} not found on ${A.site || site} (HTTP ${r.status})`);
  const j = await r.json(); return `ok (${j.name})`;
}

async function main() {
if (cmd === "add") {
  const repo = resolve(opt("--repo", process.cwd()));
  if (!existsSync(join(repo, ".git"))) die(`${repo} is not a git repo (run inside the repo or pass --repo)`);
  let company = opt("--company"); if (!company) { try { company = JSON.parse(readFileSync(join(repo, ".agents/company.json"), "utf8")).company; } catch {} }
  if (!company) die("which company? pass --company ID (or run /ceo in the repo to create .agents/company.json)");
  const keys = all("--jira-project"); if (!keys.length) die("pass --jira-project KEY (repeat for several boards)");
  let site = opt("--site", jiraCfg?.site);
  if (!site) {
    try { const A = await (await import("./attach.mjs")).atlassianToken(home); site = A?.site; } catch {}
  }
  if (!site) die("pass --site https://<you>.atlassian.net (or: holding jira connect)");
  const ap = opt("--auto-pr"); const settings = { ...(ap && { auto_pr: ap === "on" ? true : ap === "off" ? false : null }), ...(opt("--agent") && { agent: opt("--agent") }), ...(opt("--workflow") && { workflow: opt("--workflow") }) };
  const r = reg();
  for (const k of keys) {
    const v = args.includes("--no-validate") ? "not validated" : await validate(site, k.toUpperCase());
    const p = R.addBoard(r, { path: repo, name: opt("--name"), site, project_key: k, company, settings });
    const others = R.candidates(r, { company, issue: `${k.toUpperCase()}-1`, site }).filter((x) => x !== p).map((x) => x.name);
    console.log(`added ${k.toUpperCase()} (${site}, company ${company}) -> ${p.name} ${p.path}  Jira: ${v}${others.length ? `\n  note: ${k.toUpperCase()} also feeds ${others.join(", ")}; tasks need a label repo:<name> (or component) to pick the repo(s)` : ""}`);
  }
  R.save(home, r); console.log("restart the listener to pick it up: holding listener start");
} else if (cmd === "remove") {
  const r = R.load(home) ?? die("no registry");
  const n = R.removeBoard(r, { path: opt("--repo", process.cwd()), project_key: opt("--jira-project") });
  if (!n) die("nothing matched"); R.save(home, r); console.log(`removed ${n} entr${n === 1 ? "y" : "ies"}; restart the listener: holding listener start`);
} else if (cmd === "list") {
  const r = R.load(home) ?? R.empty();
  if (args.includes("--json")) console.log(JSON.stringify(r, null, 1));
  else if (!r.projects.length) console.log("no projects (holding project add --jira-project KEY inside a repo)");
  else for (const p of r.projects) console.log(`${p.name}  ${p.path}\n  boards: ${p.boards.map((b) => `${b.project_key}@${b.company}`).join(", ")}\n  settings: ${JSON.stringify(p.settings)}`);
} else die("usage: projects.mjs add|remove|list");
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
