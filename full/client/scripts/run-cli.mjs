#!/usr/bin/env node
// holding run <staff> "task" [--company X] [--json]: run one staff directly on ITS bound provider/model/effort
// (holding set-staff). Dev/engineer roles get the code tool loop in the cwd; others answer as text.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "./lean.mjs";
import { runStaff } from "./provider-run.mjs";
import { resolveCompany, localCompanies } from "./company.mjs";
const a = process.argv.slice(2), flag = (n) => a.includes(n), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const pos = a.filter((x, i) => !x.startsWith("--") && !(i > 0 && a[i - 1] === "--company"));
const [staff, ...rest] = pos, task = rest.join(" ");
if (!staff || !task) { console.error('usage: holding run <staff> "<task>" [--company X] [--json]'); process.exit(1); }
const company = resolveCompany().company;
if (!company) { console.error("run inside a repo with .agents/company.json, pass --company, or holding use <company>"); process.exit(1); }
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
async function mcp(name, args) {
  const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"); if (!key) throw new Error("no license key in the Keychain: run connect.sh");
  const dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const r = await fetch(process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(dev ? { "X-AH-Device": dev } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); const t = j.result?.content?.[0]?.text ?? "";
  if (j.result?.isError) throw new Error(t); try { return JSON.parse(t); } catch { return t; }
}

const cfg = L.loadAgentCfg(process.env.HOME, company);
const lang = L.pickLang(cfg.lang, task); L.setLang(lang);
const code = /-dev$|engineer|developer/.test(staff);
const b = await mcp("staff_brief", { company, role: staff, text: task, max_skills: 2 }).catch(() => null);
function repoFor(co) { const here = process.cwd(); try { const c = localCompanies().find((x) => x.company === co); const rs = c?.repos ?? []; if (!rs.length || rs.some((r) => here === r || here.startsWith(r + "/"))) return here; return rs[0]; } catch { return here; } }
const r = await runStaff({ company, role: staff, kind: code ? "code" : "text", noTools: !code, cwd: repoFor(company),
  schema: code ? undefined : { type: "object", properties: { summary: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, required: ["summary", "steps"] },
  system: code ? "Implement the task in this repo, run the tests, summarise files changed." : "No tools in this run (ignore persona rules about tools, MCP, sessions or delegating to other staff): the user asked you directly, produce the deliverable yourself now.",
  context: L.contextOf({ brief: b, lang }),
  prompt: task });
const tag = `${staff} - ${r.provider} · ${r.model ?? "default"} - ${r.effort ?? "default"}`;
if (flag("--json")) { console.log(JSON.stringify({ staff, company, provider: r.provider, model: r.model, effort: r.effort, result: r.result ?? r.text, error: r.error })); process.exit(r.error ? 1 : 0); }
if (r.error) { console.error(`[${staff}] (${tag}) failed: ${r.error}`); process.exit(1); }
const o = r.result; console.log(`[${staff}] (${tag})`);
console.log(o && typeof o === "object" ? [o.summary, ...(o.steps ?? []).map((x) => `- ${x}`)].filter(Boolean).join("\n") : (o ?? r.text ?? ""));
