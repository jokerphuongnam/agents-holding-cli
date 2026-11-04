#!/usr/bin/env node
// holding provider list [--json] [--company X]: every agent provider with a health check, its full effective launch template,
// and the per-staff command overrides of the company on top.
import { homedir } from "node:os";
import { listProviders } from "./providers/index.mjs";
import { BUILTIN_TEMPLATES } from "./providers/command.mjs";
import * as A from "./agents.mjs";
import { resolveCompany } from "./company.mjs";
const ps = await listProviders(homedir()), co = resolveCompany(process.argv.slice(2)).company;
const staff = co ? Object.entries(A.loadAgentCfg(homedir(), co).staff ?? {}).filter(([, m]) => m.command) : [];
const def = co ? A.loadAgentCfg(homedir(), co).command : null;
if (process.argv.includes("--json")) { console.log(JSON.stringify({ providers: ps.map((p) => ({ ...p, template: BUILTIN_TEMPLATES[p.id] ?? null })), company: co, default_command: def ?? null, staff_commands: Object.fromEntries(staff) }, null, 1)); process.exit(0); }
for (const p of ps) { console.log(`${p.ok ? "✅" : "❌"} ${p.id.padEnd(18)} ${p.name} [${p.source}${p.effort ? ", effort" : ""}] ${p.detail}`);
  const t = BUILTIN_TEMPLATES[p.id]; if (t) console.log(`   text : ${t.text}\n   code : ${t.code}\n   parse: ${t.parse}\n   cwd  : ${t.cwd}`); }
for (const id of ["openai-compatible", "ollama"]) if (!ps.some((p) => p.id === id)) { const t = BUILTIN_TEMPLATES[id]; console.log(`ℹ️  ${id} (example, not configured)\n   run  : ${t.text}\n   parse: ${t.parse}${t.example ? `\n   setup: ${t.example}` : ""}`); }
if (co) { console.log(`\ncompany ${co}: default command ${def ? `$ ${def}` : "(none: built-in provider)"}`);
  for (const [r, m] of staff) console.log(`  ${r} - $ ${m.command}${["model", "effort", "max_turns", "timeout", "context", "cwd"].filter((k) => m[k]).map((k) => `  ${k}=${m[k]}`).join("")}`);
  if (!staff.length) console.log("  no per-staff commands (holding staff set <staff> \"<command with {prompt}>\")"); }
