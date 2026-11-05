#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// holding staff run <staff> "task" [--company X] [--json]: run one staff directly on ITS bound provider/model/effort
// (holding staff set). Dev/engineer roles get the code tool loop in the cwd; others answer as text.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "./lean.mjs";
import { runStaff, runBatch } from "./provider-run.mjs";
import * as S from "./subagent.mjs";
import { resolveCompany, localCompanies } from "./company.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();
const a = process.argv.slice(2), flag = (n) => a.includes(n), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const pos = a.filter((x, i) => !x.startsWith("--") && !(i > 0 && a[i - 1] === "--company"));
const [staff, ...rest] = pos, task = rest.join(" "); // --continue / --new force or skip reusing the last session; --batch: tasks split on ";;"
if (!staff || !task) { console.error('usage: holding staff run <staff> "<task>" [--company X] [--json]'); process.exit(1); }
const company = resolveCompany().company;
if (!company) { console.error("run inside a repo with .agents/company.json, pass --company, or holding company use <company>"); process.exit(1); }
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
async function mcp(name, args) {
  const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"); if (!key) throw new Error("no license key in the Keychain: run connect.sh");
  const dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const r = await fetch(process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": AH_CLIENT_VERSION, ...(dev ? { "X-AH-Device": dev } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); const t = j.result?.content?.[0]?.text ?? "";
  if (j.result?.isError) throw new Error(t); try { return JSON.parse(t); } catch { return t; }
}

const cfg = L.loadAgentCfg(process.env.HOME, company);
const lang = L.pickLang(cfg.lang, task); L.setLang(lang);
const code = /-dev$|engineer|developer/.test(staff);
// staffing gate (same logic as the Jira path): no staff with the role -> fail fast; role without the skill -> ask 1/2/3
if (!process.argv.includes("--proceed")) {
  const st = await mcp("staffing_check", { company, request: task, staff, lang }).catch((e) => ({ kind: "ok", error: e.message }));
  if (st?.kind && st.kind !== "ok") {
    console.log(st.text ?? `${st.kind}: ${(st.why ?? []).join("; ")}`);
    if (st.kind === "needs_decision") console.log(`\n1) /staff add ${st.hire_for_skill?.[0] ?? "<role>"}   2) holding skill add ${st.role} ${st.missing_skills?.[0]}   3) holding staff run ${staff} "<task>" --proceed`);
    process.exit(st.kind === "needs_hire" ? 3 : 4);
  }
}
if (flag("--batch")) { const parts = task.split(";;").map((x) => x.trim()).filter(Boolean); const bb = await mcp("staff_brief", { company, role: staff, text: parts.join("\n"), max_skills: 2 }).catch(() => null);
  const rs = await runBatch(parts.map((t) => ({ role: staff, kind: code ? "code" : "text", task: t })), { company, cwd: process.cwd(), noTools: !code, context: L.contextOf({ brief: bb, lang }), system: "Answer each task yourself now." });
  rs.forEach((x, n) => console.log(`${n + 1}. ${S.renderShort(x)}`)); process.exit(rs.some((x) => x.status === "blocked") ? 1 : 0); }
const b = await mcp("staff_brief", { company, role: staff, text: task, max_skills: 2 }).catch(() => null);
function repoFor(co) { const here = process.cwd(); try { const c = localCompanies().find((x) => x.company === co); const rs = c?.repos ?? []; if (!rs.length || rs.some((r) => here === r || here.startsWith(r + "/"))) return here; return rs[0]; } catch { return here; } }
const r = await runStaff({ company, role: staff, kind: code ? "code" : "text", noTools: !code, cwd: repoFor(company),
  schema: code ? undefined : { type: "object", properties: { summary: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, required: ["summary", "steps"] },
  system: code ? "Implement the task in this repo, run the tests, summarise files changed." : "No tools in this run (ignore persona rules about tools, MCP, sessions or delegating to other staff): the user asked you directly, produce the deliverable yourself now.",
  context: L.contextOf({ brief: b, lang }),
  prompt: task, continue: flag("--continue") ? true : flag("--new") ? false : undefined });
const tag = `${staff} - ${r.provider} · ${r.model ?? "default"} - ${r.effort ?? "default"}`;
if (flag("--json")) { console.log(JSON.stringify({ staff, company, provider: r.provider, model: r.model, effort: r.effort, result: r.result ?? r.text, error: r.error })); process.exit(r.error ? 1 : 0); }
if (r.error) { console.error(`[${staff}] (${tag}) failed: ${r.error}`); process.exit(1); }
const o = r.result; console.log(`[${staff}] (${tag})${r.reused ? " (same session)" : ""}`);
if (r.short) { console.log(S.renderShort(r.short)); process.exit(0); }
console.log(o && typeof o === "object" ? [o.summary, ...(o.steps ?? []).map((x) => `- ${x}`)].filter(Boolean).join("\n") : (o ?? r.text ?? ""));
