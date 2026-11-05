#!/usr/bin/env node
// holding company list [--json] | holding company use <company> | holding company show : local companies, the active one, and what this shell resolves to.
import * as C from "./company.mjs";
const [cmd, arg] = process.argv.slice(2).filter((x) => x !== "--json");
const cs = C.localCompanies(), act = C.getActive(), cur = C.resolveCompany();
if (cmd === "use") {
  if (!arg) { console.error("usage: holding company use <company>"); process.exit(1); }
  const hit = cs.find((c) => c.company === arg) ?? cs.find((c) => c.company.includes(arg));
  if (!hit && !process.argv.includes("--force")) { console.error(`unknown company ${arg} (holding company list lists them; --force to set anyway)`); process.exit(1); }
  C.setActive(hit?.company ?? arg); console.log(`active company: ${hit?.company ?? arg}`); process.exit(0);
}
if (cmd === "show") { console.log(cur.company ? `company: ${cur.company} (from ${cur.source})` : "company: none (cd into a repo with .agents/<company>/COMPANY.md, legacy company.json, pass --company, or holding company use <company>)"); process.exit(0); }
if (process.argv.includes("--json")) { console.log(JSON.stringify({ active: act, current: cur, companies: cs }, null, 1)); process.exit(0); }
if (!cs.length) console.log("no local companies yet (holding project add)");
for (const c of cs) console.log(`${c.company === cur.company ? "▶" : c.company === act ? "*" : " "} ${c.company}  boards: ${c.boards.join(",") || "-"}  staff bound: ${c.staff}  repos: ${c.repos.join(", ") || "-"}${c.company === act ? "  (active)" : ""}`);
console.log(cur.company ? `current: ${cur.company} (from ${cur.source})` : "current: none");
