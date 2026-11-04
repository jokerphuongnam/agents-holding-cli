#!/usr/bin/env node
// holding company set agent [grok|claude|codex] [--model M] [--text-model M] [--effort low|medium|high] [--staff ROLE] [--company ID] (--staff: per-staff override of agent/model): which CLI the listener's lean runner uses
// for this repo's company (no args = show). Stored in ~/.config/agents-holding/state/<company>/agent.json; AH_AGENT env overrides.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as A from "./agents.mjs";
import { resolveCompany } from "./company.mjs";
const a = process.argv.slice(2), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const company = resolveCompany().company;
if (!company) { console.error("run inside a repo with .agents/company.json, pass --company ID, or holding company use <company>"); process.exit(1); }
if (a[0] === "lang") { // holding company set lang <code|auto> [--company X]: output language for this company (auto = follow each card / prompt)
  const v = a.filter((x, i) => !x.startsWith("--") && a[i - 1] !== "--company")[1];
  if (!v || !/^(auto|[a-z]{2}(-[a-z]{2})?)$/i.test(v)) { console.error("usage: holding company set lang <code|auto>   e.g. vi, zh, en, auto"); process.exit(1); }
  A.saveAgentCfg(homedir(), company, { lang: v.toLowerCase() }); console.log(`company ${company}: output language ${v.toLowerCase() === "auto" ? "auto (same as the input)" : v.toLowerCase()}`); process.exit(0);
}
if (a[0] === "set" || a[0] === "unset") { // holding staff set <staff> <provider> <model> [effort] | staff unset <staff>  [--company X]
  const [cmd, role, provider, model, effort] = a.filter((x, i) => !x.startsWith("--") && !(a[i - 1] === "--company"));
  if (!role || (cmd === "set" && !provider)) { console.error("usage: holding staff set <staff> <provider> <model> [low|medium|high] [--company X] | holding staff unset <staff>"); process.exit(1); }
  const cmdArg = opt("--command") ?? (provider && /\s|\{/.test(provider) ? provider : null);
  if (cmd === "set" && cmdArg) { const { render } = await import("./providers/command.mjs"); render(cmdArg, { prompt: "x", dir: "/tmp", b: {} }); // validates quoting
    if (role === "default") { A.saveAgentCfg(homedir(), company, { command: cmdArg }); console.log(`company ${company}: default command $ ${cmdArg}`); process.exit(0); }
    const envs = a.flatMap((x, i) => (x === "--env" ? [a[i + 1]] : [])).filter(Boolean), env = envs.length ? Object.fromEntries(envs.map((kv) => [kv.split("=")[0], kv.split("=").slice(1).join("=")])) : undefined;
    A.setStaff(homedir(), company, role, { command: cmdArg, model: opt("--model"), effort: opt("--effort"), cwd: opt("--cwd"), context: opt("--context"), max_turns: opt("--max-turns") ? Number(opt("--max-turns")) : undefined, timeout: opt("--timeout") ? Number(opt("--timeout")) : undefined, env }); console.log(`company ${company}: ${role} - $ ${cmdArg}${/\{prompt(_file)?\}/.test(cmdArg) ? "" : "  (no {prompt}: the prompt goes to stdin)"}`); process.exit(0); }
  if (cmd === "unset" && role === "default") { A.saveAgentCfg(homedir(), company, { command: "" }); console.log(`company ${company}: default command removed`); process.exit(0); }
  const r = A.setStaff(homedir(), company, role, cmd === "unset" ? null : { provider, model: model && model !== "-" ? model : undefined, effort });
  const c = A.resolveAgent({ cfg: A.loadAgentCfg(homedir(), company), text: true, role });
  console.log(`company ${company}: ${role} - ${c.agent} · ${c.model ?? "default"} - ${c.effort ?? "default"}${r ? "" : " (mapping removed, company/global defaults)"}`);
  process.exit(0);
}
const agent = a.find((x) => A.providerIds().includes(x));
const set = Object.fromEntries(Object.entries({ agent, model: opt("--model"), text_model: opt("--text-model"), effort: opt("--effort") }).filter(([, v]) => v !== undefined));
const staff = opt("--staff");
if (staff) { const cur = A.loadAgentCfg(homedir(), company); const one = { ...(cur.staff?.[staff] ?? {}), ...(set.agent ? { agent: set.agent } : {}), ...(set.model ? { model: set.model } : {}), ...(set.effort ? { effort: set.effort } : {}) };
  if (Object.keys(set).length) A.saveAgentCfg(homedir(), company, { staff: { ...(cur.staff ?? {}), [staff]: one } });
  const c = A.resolveAgent({ cfg: A.loadAgentCfg(homedir(), company), text: false, role: staff });
  console.log(`company ${company}, staff ${staff}: agent ${c.agent}; model ${c.model ?? "CLI default"}; effort ${c.effort ?? "default"}${one.effort || one.model || one.agent ? " (per-staff override)" : ""}`); process.exit(0); }
if (Object.keys(set).length) A.saveAgentCfg(homedir(), company, set);
const cfg = A.loadAgentCfg(homedir(), company);
const t = A.resolveAgent({ cfg, text: true }), c = A.resolveAgent({ cfg, text: false });
console.log(`company ${company}: agent ${c.agent}${process.env.AH_AGENT ? " (from AH_AGENT)" : ""}; text model ${t.model ?? "CLI default"}; code model ${c.model ?? "CLI default"}`);
