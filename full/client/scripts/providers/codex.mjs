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
    const exitCode = await ctx.spawn(args, { bin: o.bin, env: { ...process.env, CODEX_HOME: leanCodexHome(homedir()) } });
    const p = parseCodex(ctx.stdout(), o.model); return { result: p.result, usage: p.usage, error: p.error, exitCode };
  },
};
