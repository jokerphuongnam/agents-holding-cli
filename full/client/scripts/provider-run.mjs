// Run one staff call through its configured AgentProvider outside the listener (holding ceo, /ceo hook, delegated staff runs).
// Same resolution as lean runs: AH_* env > company staff mapping > global agents.json > defaults (agents.mjs resolveAgent).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as L from "./lean.mjs";
import { getProvider } from "./providers/index.mjs";
export function simpleSpawn(cwd, buf) {
  return (args, o = {}) => new Promise((res) => {
    const env = { ...(o.env ?? process.env), ...(o.home ? { GROK_HOME: o.home } : {}) }; delete env.AGENTS_HOLDING_KEY; // staff runs never get server access
    const ch = spawn(o.bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    ch.stdout.on("data", (d) => buf.push(d)); ch.stderr.on("data", () => {});
    const t = setTimeout(() => ch.kill("SIGTERM"), Number(process.env.AH_RUN_TIMEOUT_MS) || 15 * 60000);
    ch.on("close", (c, s) => { clearTimeout(t); res(c ?? s); }); ch.on("error", () => { clearTimeout(t); res(127); });
  });
}
export async function runStaff({ home = homedir(), company, role, kind = "text", prompt, system, schema, cwd = process.cwd(), stageModel = null, noTools = false, context = null }) {
  const cfg = L.loadAgentCfg(home, company), text = kind !== "code";
  const r = L.resolveAgent({ cfg, text, role, stageModel });
  if (r.command) { const { runCommand } = await import("./providers/command.mjs");
    const res = await runCommand(r.binding, { prompt, system, context, cwd }).catch((e) => ({ result: {}, exitCode: 1, error: e.message }));
    return { ...res, provider: "command", command: r.command, model: null, effort: null }; }
  const prov = await getProvider(r.agent, home, { providers: { ...(L.loadGlobalCfg(home).providers ?? {}), ...(cfg.providers ?? {}) } });
  const buf = [], sid = randomUUID(), logDir = join(home, ".config/agents-holding/logs"); mkdirSync(logDir, { recursive: true });
  const ctx = { spawn: simpleSpawn(cwd, buf), stdout: () => Buffer.concat(buf).toString("utf8"), leanHome: r.agent === "grok" ? L.leanGrokHome(home) : null, logDir, log: () => {} };
  const res = await prov.run({ prompt, system, context, schema, kind, text, cwd, model: r.model, effort: r.effort, sid, bin: r.bin, noTools }, ctx).catch((e) => ({ result: {}, exitCode: 1, error: e.message }));
  return { ...res, provider: r.agent, model: r.model, effort: r.effort };
}
