// Which local CLI the lean runner drives: grok (default) | claude (Claude Code) | codex (Codex CLI).
// Choose with AH_AGENT, else per company ~/.config/agents-holding/state/<company>/agent.json {"agent","model","text_model"}, else the repo's
// projects.json settings.agent (holding add-project --agent A), else grok. `holding agent <grok|claude|codex> [--model M] [--text-model M]` writes agent.json.
// Models: AH_MODEL / AH_TEXT_MODEL override everything.
// Every call stays tool-light and MCP-free (the runner talks to the server itself), one fresh session, JSON result + token usage.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const AGENTS = ["grok", "claude", "codex"];
/** Cheap model for text stages (plan/question), default model for the coding call (null = the CLI/account default). */
export const DEFAULT_MODELS = {
  grok: { text: "grok-4.7-build-fast", code: null },
  claude: { text: "haiku", code: null },
  codex: { text: null, code: null }, // codex: account default model, low reasoning effort for text stages
};
export const CLAUDE_CODE_TOOLS = "Bash,Read,Edit,Write,Grep,Glob";

const cfgPath = (home, company) => join(home, ".config/agents-holding/state", company, "agent.json");
export function loadAgentCfg(home, company) { try { return JSON.parse(readFileSync(cfgPath(home, company), "utf8")); } catch { return {}; } }
export function saveAgentCfg(home, company, o) {
  if (o.agent && !AGENTS.includes(o.agent)) throw new Error(`agent must be one of ${AGENTS.join("|")}`);
  mkdirSync(join(home, ".config/agents-holding/state", company), { recursive: true, mode: 0o700 });
  writeFileSync(cfgPath(home, company), JSON.stringify({ ...loadAgentCfg(home, company), ...o }, null, 1), { mode: 0o600 });
}
/** Resolve {agent, model} for a call: env > per-company file > defaults. */
export function resolveAgent({ env = process.env, cfg = {}, text }) {
  const agent = (env.AH_AGENT || cfg.agent || "grok").toLowerCase();
  if (!AGENTS.includes(agent)) throw new Error(`AH_AGENT=${agent}: use ${AGENTS.join("|")}`);
  const d = DEFAULT_MODELS[agent];
  const model = text ? (env.AH_TEXT_MODEL || cfg.text_model || d.text) : (env.AH_MODEL || cfg.model || d.code);
  const bin = env[`AH_${agent.toUpperCase()}_BIN`] || (agent === "grok" ? env.GROK_BIN : null) || agent;
  return { agent, model: model || null, bin };
}

export function claudeArgs({ model, text, prompt, schema, system, codeTools = CLAUDE_CODE_TOOLS, maxTurns }) {
  if (!text && !maxTurns) maxTurns = Math.max(5, Number(process.env.AH_CODE_MAX_TURNS) || 25);
  return ["-p", ...(maxTurns ? ["--max-turns", String(maxTurns)] : []), "--output-format", "json", "--no-session-persistence", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands",
    "--permission-mode", "bypassPermissions", "--tools", text ? "" : codeTools,
    ...(model ? ["--model", model] : []), ...(system ? ["--system-prompt", system] : []), "--json-schema", JSON.stringify(schema), prompt];
}
export function codexArgs({ model, text, prompt, schemaFile, system }) {
  return ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "-s", text ? "read-only" : "workspace-write", "--output-schema", schemaFile,
    ...(model ? ["-m", model] : []), ...(text ? ["-c", 'model_reasoning_effort="low"'] : []), system ? `${system}\n\n${prompt}` : prompt];
}

/** Lean CODEX_HOME: auth only (symlink), no MCP servers / custom prompts -> small, predictable context. */
export function leanCodexHome(home) {
  const d = join(home, ".config/agents-holding/codex-home"); mkdirSync(d, { recursive: true, mode: 0o700 });
  const auth = join(d, "auth.json"), real = join(process.env.CODEX_HOME || join(home, ".codex"), "auth.json");
  try { if (!existsSync(auth) && existsSync(real)) execFileSync("ln", ["-sf", real, auth]); } catch {}
  const cfg = join(d, "config.toml"); if (!existsSync(cfg)) writeFileSync(cfg, "# agents-holding lean codex home (listener runs): no MCP servers\napproval_policy = \"never\"\n");
  return d;
}

const firstJson = (s) => { const m = String(s ?? "").match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
/** Claude Code `-p --output-format json`: one result object (or a JSON array of messages ending in the result). */
export function parseClaude(stdout, model = null) {
  let j = null; try { j = JSON.parse(stdout); } catch { j = firstJson(stdout); }
  if (Array.isArray(j)) j = j.findLast((x) => x?.type === "result") ?? {};
  j ??= {};
  const result = j.is_error ? {} : j.structured_output ?? firstJson(j.result) ?? (typeof j.result === "string" && j.result ? { summary: j.result } : {});
  const u = j.usage ?? {}, models = Object.keys(j.modelUsage ?? {});
  const usage = j.usage ? { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0, cached: u.cache_read_input_tokens ?? 0, reasoning: 0,
    calls: j.num_turns ?? 1, model: models[0] ?? model, cost_usd: j.total_cost_usd ?? null } : null;
  return { result, usage, error: j.is_error ? String(j.result ?? j.subtype ?? "error") : null };
}
/** Codex `exec --json`: JSONL events; final agent_message = the JSON answer, turn.completed carries usage (summed over turns). */
export function parseCodex(stdout, model = null) {
  let msg = null, usage = null, error = null;
  for (const l of String(stdout).split("\n")) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.type === "item.completed" && e.item?.type === "agent_message") msg = e.item.text;
    if (e.type === "turn.completed" && e.usage) { const u = e.usage; usage ??= { input: 0, output: 0, cached: 0, reasoning: 0, calls: 0, model };
      usage.input += u.input_tokens ?? 0; usage.output += u.output_tokens ?? 0; usage.cached += u.cached_input_tokens ?? 0; usage.reasoning += u.reasoning_output_tokens ?? 0; usage.calls += 1; }
    if (e.type === "turn.failed" || e.type === "error") error = e.error?.message ?? e.message ?? "error";
  }
  return { result: error ? {} : firstJson(msg) ?? (msg ? { summary: msg } : {}), usage, error };
}
