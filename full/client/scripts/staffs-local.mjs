#!/usr/bin/env node
// stdin: server `/staff list` tree. Rewrites each "<staff> - <model> - <effort>" cell with what THIS machine's lean runner will
// actually use (AH_AGENT/AH_MODEL/AH_EFFORT, agent.json, per-staff override staff.<role>, the flow's per-stage model).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as A from "./agents.mjs";
import { resolveCompany } from "./company.mjs";
const company = process.argv[2] || resolveCompany({ argv: process.argv.slice(3) }).company;
const cfg = company ? A.loadAgentCfg(homedir(), company) : {};
export function localize(txt, cfg, env = process.env) {
  const g = A.loadGlobalCfg(env.HOME || homedir());
  return txt.replace(/^([│├└─ ]*)([a-z0-9][a-z0-9-]*) - (\S+) - (\S+)/gm, (all, pre, role, m, e) => {
    if (role === "ceo") return `${pre}ceo - current session`;
    const def = m === "text-default" || m === "code-default";
    const flag = env.AH_AGENT || cfg.staff?.[role]?.provider || cfg.staff?.[role]?.command || cfg.command || g.staff?.[role]?.provider ? "" : " ⚠ unbound (company default)";
    try { return `${pre}${role} - ${A.staffRuntime({ env, cfg, role, text: m !== "code-default", stageModel: def ? null : m })}${flag}`; } catch { return all; }
  });
}
if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(localize(readFileSync(0, "utf8"), cfg));
