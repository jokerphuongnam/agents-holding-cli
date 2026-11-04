#!/usr/bin/env node
// holding habit list|edit|clear [--company ID]: the user habits the listener learned on Done (local only,
// ~/.config/agents-holding/state/<company>/habits.md, chmod 600). They are added to plan / tech plan / coding prompts.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as L from "./lean.mjs";
import { resolveCompany } from "./company.mjs";
const a = process.argv.slice(2), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const cmd = a.find((x) => ["list", "edit", "clear"].includes(x)) ?? "list";
const company = resolveCompany().company;
if (!company) { console.error("run inside a repo with .agents/company.json, pass --company ID, or holding company use <company>"); process.exit(1); }
const home = process.env.AH_HOME ?? homedir(), p = L.habitsPath(home, company);
if (cmd === "clear") { L.saveHabits(home, company, []); console.log(`cleared ${p}`); }
else if (cmd === "edit") {
  if (!existsSync(p)) L.saveHabits(home, company, L.loadHabits(home, company));
  execFileSync(process.env.EDITOR || "vi", [p], { stdio: "inherit" });
  const { all } = L.mergeHabits([], L.loadHabits(home, company)); L.saveHabits(home, company, all); // re-normalize + cap
  console.log(`${all.length} habit(s) saved in ${p}`);
} else {
  const h = L.loadHabits(home, company);
  console.log(h.length ? `${h.length} habit(s) for ${company} (${p}):\n${h.map((x) => `- ${x}`).join("\n")}` : `no habits yet for ${company} (learned when a task with your comments reaches Done)`);
}
