// Built-in adapter: Claude Code (`claude -p`). See docs/PROVIDERS.md.
import { execFileSync } from "node:child_process";
import { claudeArgs, parseClaude } from "../agents.mjs";
export default {
  id: "claude", displayName: "Claude Code", supportsEffort: true, defaults: { text: "haiku", code: null },
  healthCheck({ bin = "claude" } = {}) { try { return { ok: true, detail: execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 10000 }).trim() }; } catch { return { ok: false, detail: `${bin} not runnable` }; } },
  async run(o, ctx) {
    const args = claudeArgs({ model: o.model, effort: o.effort, text: o.text && o.kind !== "tech", prompt: o.prompt, schema: o.schema, system: o.system, context: o.context,
      codeTools: o.kind === "tech" ? "Read,Grep,Glob" : undefined, maxTurns: o.kind === "tech" ? 4 : undefined });
    const exitCode = await ctx.spawn(args, { bin: o.bin, env: { ...process.env } });
    const p = parseClaude(ctx.stdout(), o.model); return { result: p.result, usage: p.usage, error: p.error, exitCode };
  },
};
