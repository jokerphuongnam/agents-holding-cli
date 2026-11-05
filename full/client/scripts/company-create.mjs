#!/usr/bin/env node
// holding company create [name] [--parent P] [--tech a,b] [--jira KEY]
// Works from ANY directory (no repo required). Name optional: defaults to cwd basename (slugified), confirm/edit.
// After create: process setup menu; if cwd is a git repo, offer to link it (project add).
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v ?? ""; };
const parent = flag("--parent"), tech = flag("--tech"), jira = flag("--jira");
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "company";
const interactive = process.env.AH_NONINTERACTIVE !== "1" && process.stdin.isTTY && !process.env.CI;

let name = args.join(" ").trim();
const fromCwd = !name;
if (!name) name = basename(resolve(process.cwd())) || "company";

if (interactive) {
  const { select } = await import("./menu.mjs");
  const label = fromCwd ? `Use folder name "${name}"` : `Use "${name}"`;
  const pick = await select("Create company:", [label, "Type a different name", "Cancel"]);
  if (pick === 2 || pick == null) { console.log("Cancelled."); process.exit(0); }
  if (pick === 1) {
    const rl = createInterface({ input, output });
    const typed = (await rl.question(`Company name [${name}]: `)).trim();
    rl.close();
    if (typed) name = typed;
  }
} else if (fromCwd) {
  console.log(`Using directory name as company: ${name} (AH_NONINTERACTIVE=1)`);
}

const createArgs = ["company", "create", name];
if (parent) createArgs.push("--parent", parent);
if (tech) createArgs.push("--tech", tech);
if (jira) createArgs.push("--jira", jira);
const r = spawnSync("bash", [join(here, "ah-cli.sh"), ...createArgs], { encoding: "utf8" });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status) process.exit(r.status ?? 1);

const out = `${r.stdout || ""}\n${r.stderr || ""}`;
const m = out.match(/Created ([a-z0-9][a-z0-9-]{0,47})/i) || out.match(/Đã tạo công ty ([a-z0-9][a-z0-9-]{0,47})/i);
const slug = m?.[1] || slugify(name);

// Process setup (Jira Listener)
spawnSync("node", [join(here, "policy.mjs"), "processes", slug, "--company", slug], { stdio: "inherit" });

const cwd = resolve(process.cwd());
const isGit = existsSync(join(cwd, ".git"));
if (isGit && interactive) {
  const { select } = await import("./menu.mjs");
  const pick = await select(`Link this git repo to company ${slug}?`, [
    "Yes — write .agents/company.json and run project add (asks for Jira key)",
    "Write .agents/company.json only",
    "Skip",
  ]);
  if (pick === 0 || pick === 1) {
    const dir = join(cwd, ".agents"); mkdirSync(dir, { recursive: true });
    const cj = join(dir, "company.json");
    if (!existsSync(cj)) writeFileSync(cj, JSON.stringify({ company: slug }, null, 2) + "\n");
    else {
      try { const j = JSON.parse(readFileSync(cj, "utf8")); j.company = slug; writeFileSync(cj, JSON.stringify(j, null, 2) + "\n"); }
      catch { writeFileSync(cj, JSON.stringify({ company: slug }, null, 2) + "\n"); }
    }
    console.log(`Wrote ${cj}`);
  }
  if (pick === 0) {
    const rl = createInterface({ input, output });
    const key = (await rl.question("Jira project key (e.g. SHOP), empty to skip project add: ")).trim().toUpperCase();
    rl.close();
    if (key) {
      const pr = spawnSync("node", [join(here, "projects.mjs"), "add", "--company", slug, "--jira-project", key, "--repo", cwd], { stdio: "inherit" });
      if (pr.status) process.exit(pr.status ?? 1);
    } else console.log(`Skipped project add. Later: holding project add --company ${slug} --jira-project KEY`);
  }
} else if (isGit && !interactive) {
  console.log(`Git repo detected. Link later: holding project add --company ${slug} --jira-project KEY`);
}

console.log(`Company ${slug} ready. Use: holding company use ${slug}`);
