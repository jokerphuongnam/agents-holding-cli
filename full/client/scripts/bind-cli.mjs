#!/usr/bin/env node
// holding bind [role ...] [--agent P --model M --effort E] [--company X] [--yes]: bind each staff (never the CEO: it is the
// current chat session) to provider/model/effort for this company. Per staff: Default (remembered binding, Enter) or Custom.
// A custom choice becomes the remembered default (~/.config/agents-holding/agent-defaults.json).
// holding defaults [set <role> <provider> [model] [effort] | unset <role>]: show/edit the remembered bindings.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import * as A from "./agents.mjs";
import { resolveCompany } from "./company.mjs";
const home = process.env.HOME || homedir();
const a = process.argv.slice(2), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const VAL = ["--agent", "--provider", "--model", "--effort", "--company"];
const pos = a.filter((x, i) => !x.startsWith("--") && !VAL.includes(a[i - 1]));
if (pos[0] === "defaults") {
  const [, sub, role, provider, model, effort] = pos;
  if (sub === "set" && role && provider) { if (effort && !A.EFFORTS.includes(effort)) { console.error(`effort must be ${A.EFFORTS.join("|")}`); process.exit(1); } A.saveDefault(home, role, { provider, model, effort }); }
  else if (sub === "unset" && role) A.saveDefault(home, role, null);
  else if (sub) { console.error("usage: holding defaults [set <role> <provider> [model] [effort] | unset <role>]"); process.exit(1); }
  const d = A.loadDefaults(home); const ks = Object.keys(d);
  console.log(ks.length ? ks.map((r) => A.bindingLabel(r, d[r])).join("\n") : "no remembered bindings yet (set one with holding set-staff / bind / defaults set)");
  process.exit(0);
}
const company = resolveCompany().company;
if (!company) { console.error("run inside a repo with .agents/company.json, pass --company, or holding use <company>"); process.exit(1); }
let roles = pos.filter((r) => r !== "ceo");
if (!roles.length && !process.stdin.isTTY) { try { roles = (JSON.parse(readFileSync(0, "utf8") || "[]")).filter((r) => r !== "ceo"); } catch {} }
const flags = { command: opt("--command"), provider: opt("--agent") ?? opt("--provider"), model: opt("--model"), effort: opt("--effort") };
const tty = process.stdin.isTTY && !a.includes("--yes") && !process.env.AH_HOOK_RUN;
const defs = A.loadDefaults(home), cfg = A.loadAgentCfg(home, company);
const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
let shown = false;
if (tty) { const { writeExample } = await import("./providers/command.mjs"); console.log(`example of every staff field: ${writeExample(home)}`); }
for (const role of roles) {
  const remembered = defs[role] ?? cfg.staff?.[role] ?? null;
  let m = null;
  if (flags.command) m = { command: flags.command };
  else if (flags.provider) m = flags;
  else if (!tty) m = remembered;
  else {
    if (!shown) { const { listProviders } = await import("./providers/index.mjs"); for (const p of await listProviders(home)) console.log(`  ${p.ok ? "✅" : "❌"} ${p.id.padEnd(18)} ${p.name} ${p.detail}`); shown = true; }
    const fb = remembered ?? (cfg.command ? { command: cfg.command } : { provider: cfg.agent ?? A.loadGlobalCfg(home).default?.provider ?? "grok" });
    const c = (await rl.question(`${role}:\n  1) Default  ${A.bindingLabel(role, fb)}\n  2) Custom\n  choice [1]: `)).trim();
    if (c === "2" || /^c/i.test(c)) {
      const cmd = (await rl.question(`  launch command, {prompt} = the task, e.g. claude -p --model sonnet --effort low "{prompt}"\n  (Enter = pick provider/model/effort instead): `)).trim();
      if (cmd) { const ask = async (k, ex, d) => (await rl.question(`  ${k.padEnd(9)} e.g. ${ex} [${d ?? ""}]: `)).trim() || d || undefined;
        const fd = fb.command ? fb : {};
        m = { command: cmd, model: await ask("model", "sonnet", fd.model), effort: await ask("effort", "low|medium|high", fd.effort), cwd: await ask("cwd", "(empty = company repo)", fd.cwd),
          context: await ask("context", "auto | none | ~/ctx.md", fd.context ?? "auto"), max_turns: Number(await ask("max_turns", "25", fd.max_turns)) || undefined, timeout: Number(await ask("timeout", "900 (sec)", fd.timeout)) || undefined };
        const ev = await ask("env", "K=V,K2=V2", fd.env ? Object.entries(fd.env).map(([k, v]) => `${k}=${v}`).join(",") : undefined);
        if (ev) m.env = Object.fromEntries(ev.split(",").map((kv) => [kv.split("=")[0].trim(), kv.split("=").slice(1).join("=")])); } else {
      const provider = (await rl.question(`  provider [${fb.provider}]: `)).trim() || fb.provider;
      const model = (await rl.question(`  model [${fb.model ?? "default"}]: `)).trim() || (provider === fb.provider ? fb.model : null);
      const effort = (await rl.question(`  effort low|medium|high [${fb.effort ?? "default"}]: `)).trim() || (provider === fb.provider ? fb.effort : null);
      m = { provider, model, effort }; }
    } else m = fb;
  }
  if (m?.command) { try { A.setStaff(home, company, role, null); A.setStaff(home, company, role, m); console.log(`✅ ${A.bindingLabel(role, m)}`); } catch (e) { console.log(`❌ ${role}: ${e.message}`); } continue; }
  if (!m?.provider) { console.log(`⚠ ${role}: unbound, uses the company default (bind: holding set-staff ${role} <provider> <model> [effort])`); continue; }
  try { A.setStaff(home, company, role, null); A.setStaff(home, company, role, { provider: m.provider, model: m.model ?? null, effort: m.effort ?? null }); console.log(`✅ ${A.bindingLabel(role, A.loadAgentCfg(home, company).staff[role])}`); }
  catch (e) { console.log(`❌ ${role}: ${e.message}`); }
}
rl?.close();
