// Run one staff call through its configured AgentProvider outside the listener (holding ceo, /ceo hook, delegated staff runs).
// Same resolution as lean runs: AH_* env > company staff mapping > global agents.json > defaults (agents.mjs resolveAgent).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as L from "./lean.mjs";
import { getProvider } from "./providers/index.mjs";
import * as S from "./subagent.mjs";
import * as POL from "./policy.mjs";
export function simpleSpawn(cwd, buf, pol = {}) {
  return (args, o = {}) => new Promise((res) => {
    const env0 = { ...(o.env ?? process.env), ...(o.home ? { GROK_HOME: o.home } : {}) }; delete env0.AGENTS_HOLDING_KEY; // staff runs never get server access
    const w = POL.wrapLaunch({ co: pol.company, role: pol.role, bin: o.bin, args, env: env0, cwd }), env = w.env; // unified staff policy: native config + OS sandbox
    const ch = spawn(w.bin, w.args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    ch.stdout.on("data", (d) => buf.push(d)); ch.stderr.on("data", () => {});
    const t = setTimeout(() => ch.kill("SIGTERM"), Number(process.env.AH_RUN_TIMEOUT_MS) || 15 * 60000);
    ch.on("close", (c, s) => { clearTimeout(t); res(c ?? s); }); ch.on("error", () => { clearTimeout(t); res(127); });
  });
}
export async function runStaff({ home = homedir(), company, role, kind = "text", prompt, system, schema, cwd = process.cwd(), stageModel = null, noTools = false, context = null, files = [], history = null, continue: cont, opt = S.optOn() }) {
  // history is accepted only to be dropped: staff never get the chat history (subagent.mjs).
  let sess = null;
  if (opt) { const sl = S.slimBrief(prompt, { cwd, history }); prompt = [sl.text, S.fileRefs([...files, ...sl.files], cwd)].filter(Boolean).join("\n\n");
    ({ system, context } = S.stablePrefix(system, context)); schema = schema ?? S.SUMMARY_SCHEMA; sess = S.sessionFor(home, { company, role, cwd, kind }, prompt, { continue: cont, contextHash: S.contextHash(system, context) }); }
  if (company && role) { const pol = POL.loadPolicy(home, company, role); context = [context, POL.rulesText(pol)].filter(Boolean).join("\n\n"); }
  prompt = POL.redactText(prompt); if (context) context = POL.redactText(context); if (system) system = POL.redactText(system);
  const repoCfg = (() => { try { const j = JSON.parse(readFileSync(join(cwd, ".agents", "company.json"), "utf8")); return { ...j, staff: L.flattenStaffs(j.staffs ?? j.staff ?? {}) }; } catch { return {}; } })();
  const baseCfg = L.loadAgentCfg(home, company), cfg = { ...baseCfg, ...repoCfg, staff: { ...(baseCfg.staff ?? {}), ...(repoCfg.staff ?? {}) } }, text = kind !== "code";
  const r = L.resolveAgent({ cfg, text, role, stageModel });
  if (r.command) { const { runCommand } = await import("./providers/command.mjs");
    const res = await runCommand(r.binding, { prompt, system, context, cwd, company, role }).catch((e) => ({ result: {}, exitCode: 1, error: e.message }));
    return { ...res, provider: "command", command: r.command, model: r.binding?.model ?? null, effort: r.binding?.effort ?? null }; }
  const prov = await getProvider(r.agent, home, { providers: { ...(L.loadGlobalCfg(home).providers ?? {}), ...(cfg.providers ?? {}) } });
  const buf = [], sid = sess?.sid ?? randomUUID(), logDir = join(home, ".config/agents-holding/logs"); mkdirSync(logDir, { recursive: true });
  const ctx = { spawn: simpleSpawn(cwd, buf, { company, role }), stdout: () => Buffer.concat(buf).toString("utf8"), leanHome: r.agent === "grok" ? L.leanGrokHome(home) : null, logDir, log: () => {} };
  const res = await prov.run({ prompt, system, context, schema, kind, text, cwd, model: r.model, effort: r.effort, sid, resume: !!sess?.resume, bin: r.bin, noTools }, ctx).catch((e) => ({ result: {}, exitCode: 1, error: e.message }));
  if (opt && !res.error && (prov.supportsResume ?? false)) S.rememberSession(home, { company, role, cwd, kind }, sid, Date.now(), S.contextHash(system, context));
  return { ...res, ...(opt ? { short: S.shortResult(res.error ? { ...res.result, error: res.error } : res.result) } : {}), reused: !!sess?.resume && (prov.supportsResume ?? false), provider: r.agent, model: r.model, effort: r.effort };
}
/** Several small same-type tasks -> as few staff calls as possible; returns one short result per task, in input order. */
export async function runBatch(tasks, common = {}) {
  const out = []; for (const b of S.batchTasks(tasks)) {
    const one = b.length === 1, t0 = b[0];
    const r = await runStaff({ ...common, role: t0.role, kind: t0.kind ?? "text", prompt: S.batchPrompt(b), schema: one ? undefined : S.BATCH_SCHEMA, continue: false });
    S.splitBatch(b, r.error ? { status: "blocked", summary: r.error } : r.result).forEach((x, n) => { out[b[n].i] = { ...x, batched: b.length, provider: r.provider }; });
  } return out;
}
