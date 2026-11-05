// Built-in adapter: grok CLI (lean GROK_HOME, no MCP). See docs/PROVIDERS.md for the AgentProvider interface.
import { execFileSync } from "node:child_process";
import { leanGrokArgs, parseResult, TECH_TOOLS } from "../lean.mjs";
export default {
  id: "grok", displayName: "Grok CLI", supportsEffort: true, supportsResume: true, defaults: { text: "grok-4.7-build-fast", code: null },
  healthCheck({ bin = "grok" } = {}) { try { return { ok: true, detail: execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 10000 }).trim().split("\n")[0] }; } catch (e) { return { ok: false, detail: `${bin} not runnable` }; } },
  async run(o, ctx) {
    const args = leanGrokArgs({ sid: o.sid, model: o.model, effort: o.effort, text: o.text, prompt: o.prompt, schema: o.schema, system: o.system, context: o.context, resume: !!o.resume, ...(o.kind === "tech" ? { tools: TECH_TOOLS, maxTurns: 4 } : {}), ...(o.noTools ? { tools: "" } : {}) });
    const exitCode = await ctx.spawn(args, { home: ctx.leanHome, bin: o.bin });
    const g = ctx.grokUsage?.(o.sid);
    return { result: parseResult(ctx.stdout()), exitCode, usage: g ? { input: g.inputTokens, output: g.outputTokens, cached: g.cachedReadTokens, reasoning: g.reasoningTokens ?? 0, calls: g.modelCalls, model: g.primaryModelId } : null };
  },
};
