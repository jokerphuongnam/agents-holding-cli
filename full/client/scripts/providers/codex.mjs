// Built-in adapter: Codex CLI (`codex exec --json`, lean CODEX_HOME). See docs/PROVIDERS.md.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { codexArgs, leanCodexHome, parseCodex } from "../agents.mjs";
export default {
  id: "codex", displayName: "Codex CLI", supportsEffort: true, defaults: { text: null, code: null, textEffort: "low" },
  healthCheck({ bin = "codex" } = {}) { try { return { ok: true, detail: execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 10000 }).trim() }; } catch { return { ok: false, detail: `${bin} not runnable` }; } },
  async run(o, ctx) {
    const schemaFile = join(ctx.logDir, `schema-${o.sid}.json`);
    writeFileSync(schemaFile, JSON.stringify({ ...o.schema, additionalProperties: false, required: Object.keys(o.schema.properties) }));
    const args = codexArgs({ model: o.model, effort: o.effort, text: o.text, prompt: o.prompt, schemaFile, system: o.system, context: o.context });
    // Codex manages its own skills/state during startup. On macOS the outer
    // seatbelt wrapper can reject that internal write even when the repo is
    // writable, producing a misleading "workspace unavailable" result.
    // Keep Holding's native policy and Codex workspace-write sandbox, but do
    // not wrap Codex in a second OS sandbox.
    const exitCode = await ctx.spawn(args, { bin: o.bin, env: { ...process.env, AH_SANDBOX: "off", CODEX_HOME: leanCodexHome(homedir()) } });
    const p = parseCodex(ctx.stdout(), o.model); return { result: p.result, usage: p.usage, error: p.error, exitCode };
  },
};
