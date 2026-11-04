#!/usr/bin/env node
// holding agent [grok|claude|codex] [--model M] [--text-model M] [--company ID]: which CLI the listener's lean runner uses
// for this repo's company (no args = show). Stored in ~/.config/agents-holding/state/<company>/agent.json; AH_AGENT env overrides.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as A from "./agents.mjs";
const a = process.argv.slice(2), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const company = opt("--company") ?? (() => { try { return JSON.parse(readFileSync(join(process.cwd(), ".agents/company.json"), "utf8")).company; } catch { return null; } })();
if (!company) { console.error("run inside a repo with .agents/company.json, or pass --company ID"); process.exit(1); }
const agent = a.find((x) => A.AGENTS.includes(x));
const set = Object.fromEntries(Object.entries({ agent, model: opt("--model"), text_model: opt("--text-model") }).filter(([, v]) => v !== undefined));
if (Object.keys(set).length) A.saveAgentCfg(homedir(), company, set);
const cfg = A.loadAgentCfg(homedir(), company);
const t = A.resolveAgent({ cfg, text: true }), c = A.resolveAgent({ cfg, text: false });
console.log(`company ${company}: agent ${c.agent}${process.env.AH_AGENT ? " (from AH_AGENT)" : ""}; text model ${t.model ?? "CLI default"}; code model ${c.model ?? "CLI default"}`);
