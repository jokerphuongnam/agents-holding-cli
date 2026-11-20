#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// holding staff run <staff> "task" [--company X] [--json]: run one staff directly on ITS bound provider/model/effort
// (holding staff set). Every staff run may use tools; the task and local policy decide whether tools are needed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import * as L from "./lean.mjs";
import { runStaff, runBatch } from "./provider-run.mjs";
import * as S from "./subagent.mjs";
import { resolveCompany, localCompanies, fromCwd } from "./company.mjs";
import { enrichBriefWithPackSkills, enrichBriefWithLocalSkills, packSkillsCover } from "./pack-skills.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
import { staffingRecovery } from "./dispatch-errors.mjs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();
// Nested staff dispatches run in the same local CLI environment. Keep the
// installed `holding` command available to role leads even when the parent
// application did not put ~/.local/bin on PATH.
const holdingBin = join(homedir(), ".local", "bin");
const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
if (!pathEntries.includes(holdingBin)) process.env.PATH = [holdingBin, ...pathEntries].join(delimiter);
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const a = process.argv.slice(2), flag = (n) => a.includes(n), opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const valueFlags = new Set(["--company", "--repo"]);
const pos = a.filter((x, i) => !x.startsWith("--") && !(i > 0 && valueFlags.has(a[i - 1])));
const [staff, ...rest] = pos, task = rest.join(" "); // --continue / --new force or skip reusing the last session; --batch: tasks split on ";;"
if (!staff || !task) { console.error('usage: holding staff run <staff> "<task>" [--company X] [--repo PATH] [--json]'); process.exit(1); }
// Honor the explicit company supplied by CEO/lead dispatch. Without this,
// cross-company runs silently resolve from the caller's cwd/active company.
const company = resolveCompany({ argv: a }).company;
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
// staffing gate (same logic as the Jira path): no staff with the role -> fail fast; role without the skill -> ask 1/2/3
if (!process.argv.includes("--proceed")) {
  const st = await mcp("staffing_check", { company, request: task, staff, lang }).catch((error) => ({ kind: "unavailable", error }));
  if (!st || typeof st !== "object") {
    console.error("[staffing check invalid response] Expected a structured company staffing decision; no staff was dispatched.");
    process.exit(5);
  }
  if (st?.kind === "unavailable") {
    console.error(staffingRecovery(st.error));
    process.exit(5);
  }
  if (st?.kind !== "ok") {
    // Pack-skill attachments are local: if they cover every missing skill, continue.
    if (st.kind === "needs_decision" && Array.isArray(st.missing_skills) && st.missing_skills.length
        && packSkillsCover(company, staff, st.missing_skills)) {
      /* covered by holding skill add of a dependency pack skill */
    } else {
      console.log(st.text ?? `${st.kind}: ${(st.why ?? []).join("; ")}`);
      if (st.kind === "needs_decision") console.log(`\n1) /staff add ${st.hire_for_skill?.[0] ?? "<role>"}   2) holding skill add ${st.role} ${st.missing_skills?.[0]}   3) holding staff run ${staff} "<task>" --proceed`);
      process.exit(st.kind === "needs_hire" ? 3 : 4);
    }
  }
}
if (flag("--batch")) { const parts = task.split(";;").map((x) => x.trim()).filter(Boolean); let bb;
  try { bb = await mcp("staff_brief", { company, role: staff, text: parts.join("\n"), max_skills: 2 }); }
  catch (e) { console.error(`[staff brief unavailable] ${e.message}\nNo staff was dispatched because the private role brief could not be loaded.`); process.exit(5); }
  let batchRepo;
  try { batchRepo = repoFor(company); } catch (e) { console.error(`[staff dispatch blocked] ${e.message}`); process.exit(6); }
  const rs = await runBatch(parts.map((t) => ({ role: staff, kind: "code", task: t })), { company, cwd: batchRepo, noTools: false, context: L.contextOf({ brief: bb, lang, company, repo: batchRepo }), system: "Use the available tools only when the task requires them; answer the task yourself." });
  rs.forEach((x, n) => console.log(`${n + 1}. ${S.renderShort(x)}`)); process.exit(rs.some((x) => x.status === "blocked") ? 1 : 0); }
let b;
try { b = await mcp("staff_brief", { company, role: staff, text: task, max_skills: 2 }); }
catch (e) {
  console.error(`[staff brief unavailable] ${e.message}\nNo staff was dispatched because the private role brief could not be loaded.`);
  process.exit(5);
}
b = enrichBriefWithPackSkills(company, staff, b);
b = enrichBriefWithLocalSkills(company, staff, b);
function repoFor(co) {
  const registered = (localCompanies().find((x) => x.company === co)?.repos ?? []).filter(existsSync);
  const requested = opt("--repo");
  if (requested) {
    let exact;
    try { exact = realpathSync(requested); } catch { throw new Error(`registered repository does not exist: ${requested}`); }
    if (!registered.some((r) => realpathSync(r) === exact)) throw new Error(`repository is not registered for ${co}: ${exact}`);
    return exact;
  }
  const here = process.cwd();
  if (registered.some((r) => here === r || here.startsWith(r + "/"))) return here;
  if (registered.length) return registered[0];
  if (fromCwd(here)?.company === co) return here;
  throw new Error(`no local repository is registered for company "${co}"; register its product repository before dispatch`);
}
let repo;
try { repo = repoFor(company); } catch (e) { console.error(`[staff dispatch blocked] ${e.message}`); process.exit(6); }
const r = await runStaff({ company, role: staff, kind: "code", noTools: false, cwd: repo,
  schema: { type: "object", properties: { summary: { type: "string" }, steps: { type: "array", items: { type: "string" } }, tests: { type: "string" }, changed_files: { type: "array", items: { type: "string" } } }, required: ["summary"] },
  system: `Use repository tools when the task requires inspection or changes. The registered interactive terminal is company-scoped. This run belongs to company ${company} and repo ${repo}; never inspect, list, or use another company's staff or terminals. The terminal is for QC/check commands and launching subagents with 'holding staff run', not for direct Git or implementation commands. All subagent roles available for this company may be dispatched according to the task; do not restrict dispatch to QC. List only this company's sessions with 'holding terminal status --company ${shellQuote(company)} --repo ${shellQuote(repo)}', then dispatch with 'holding terminal dispatch --company ${shellQuote(company)} --repo ${shellQuote(repo)} <session-id> "<command>"'. Wait for completion and capture the terminal output; never redispatch a command while it is busy. Do not register, unregister, or close a terminal unless the user explicitly asks. Follow the task exactly; do not modify files for a read-only review.`,
  context: L.contextOf({ brief: b, lang, company, repo }),
  prompt: task, continue: flag("--continue") ? true : flag("--new") ? false : undefined });
const tag = `${staff} - ${r.provider} · ${r.model ?? "default"} - ${r.effort ?? "default"}`;
if (flag("--json")) { console.log(JSON.stringify({ staff, company, provider: r.provider, model: r.model, effort: r.effort, result: r.result ?? r.text, error: r.error })); process.exit(r.error ? 1 : 0); }
if (r.error) { console.error(`[${staff}] (${tag}) failed: ${r.error}`); process.exit(1); }
const o = r.result; console.log(`[${staff}] (${tag})${r.reused ? " (same session)" : ""}`);
if (r.short) { console.log(S.renderShort(r.short)); process.exit(0); }
console.log(o && typeof o === "object" ? [o.summary, ...(o.steps ?? []).map((x) => `- ${x}`)].filter(Boolean).join("\n") : (o ?? r.text ?? ""));
