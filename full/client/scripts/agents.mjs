// Which local CLI the lean runner drives: grok (default) | claude (Claude Code) | codex (Codex CLI).
// Choose with AH_AGENT, else per company ~/.config/agents-holding/state/<company>/agent.json {"agent","model","text_model"}, else the repo's
// projects.json settings.agent (holding project add --agent A), else grok. `holding company set agent <grok|claude|codex> [--model M] [--text-model M]` writes agent.json.
// Models: AH_MODEL / AH_TEXT_MODEL override everything.
// Every call stays tool-light and MCP-free (the runner talks to the server itself), one fresh session, JSON result + token usage.
import { loadJsonc, writeJsonc } from "./staff-config.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Provider protocol: the CLIs above are built-in adapters in providers/; more come from ~/.config/agents-holding/agents.json
// { "default": {provider, model, effort}, "providers": {<name>: {type:"openai-compatible", baseURL, model, keychain}}, "staff": {<role>: {provider, model, effort}} }
// or custom modules ~/.config/agents-holding/providers/<name>.mjs. See docs/PROVIDERS.md.
const globalPath = (home) => join(home, ".config/agents-holding/agents.json");
export function loadGlobalCfg(home = process.env.HOME || homedir()) { try { return JSON.parse(readFileSync(globalPath(home), "utf8")); } catch { return {}; } }
export function saveGlobalCfg(home, o) { mkdirSync(join(home, ".config/agents-holding"), { recursive: true, mode: 0o700 }); writeFileSync(globalPath(home), JSON.stringify({ ...loadGlobalCfg(home), ...o }, null, 1), { mode: 0o600 }); }
/** Every usable provider id (sync): built-ins + agents.json providers + custom modules. */
export function providerIds(home = process.env.HOME || homedir(), g = loadGlobalCfg(home)) {
  let custom = []; try { custom = readdirSync(join(home, ".config/agents-holding/providers")).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)); } catch {}
  return [...new Set([...AGENTS, ...Object.keys(g.providers ?? {}), ...custom])];
}

export const AGENTS = ["grok", "claude", "codex"];
/** Cheap model for text stages (plan/question), default model for the coding call (null = the CLI/account default). */
export const DEFAULT_MODELS = {
  grok: { text: "grok-4.7-build-fast", code: null },
  claude: { text: "haiku", code: null },
  codex: { text: null, code: null }, // codex: account default model, low reasoning effort for text stages
};
export const CLAUDE_CODE_TOOLS = "Bash,Read,Edit,Write,Grep,Glob,Task";

const cfgPath = (home, company) => join(home, ".config/agents-holding/state", company, "agent.json");
export function loadAgentCfg(home, company) {
  let c = {}; try { c = JSON.parse(readFileSync(cfgPath(home, company), "utf8")); } catch {}
  const j = loadJsonc(home, company); // state/<company>/agents.jsonc (commented, hand-editable) wins for staff + default command
  if (j) { if (j.staff && typeof j.staff === "object") c.staff = { ...(c.staff ?? {}), ...j.staff }; if (typeof j.default === "string") c.command = j.default || c.command; }
  return c;
}
/** Flatten repo-local staffs tree for lookup while preserving hierarchy metadata. */
export function flattenStaffs(tree = {}, inherited = {}, parent = null, out = {}) {
  for (const [role, raw] of Object.entries(tree ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const { members, ...own } = raw;
    const entry = { ...own, ...(own.command ? {} : inherited.command ? { command: inherited.command } : {}), ...(parent ? { parent } : {}) };
    out[role] = entry;
    flattenStaffs(members, { command: entry.command }, role, out);
  }
  return out;
}
/** holding staff set / staff unset: per-company mapping staff.<role> = {provider, model, effort} in state/<company>/agent.json. */
export function setStaff(home, company, role, m) {
  if (role === "ceo" && m) throw new Error("the CEO is always your current chat session; it has no provider binding");
  if (m?.command) m = Object.fromEntries(Object.entries(m).filter(([k, v]) => CMD_FIELDS.includes(k) && v !== undefined && v !== null && v !== "")); // fixed command binding
  if (m?.command) m.command = String(m.command).trim();
  else if (m?.provider) m = { ...m, command: undefined };
  if (m?.provider && !providerIds(home, { providers: { ...(loadGlobalCfg(home).providers ?? {}), ...(loadAgentCfg(home, company).providers ?? {}) } }).includes(m.provider)) throw new Error(`unknown provider ${m.provider} (see holding provider list)`);
  if (m?.effort && !EFFORTS.includes(m.effort)) throw new Error(`effort must be ${EFFORTS.join("|")}`);
  const cur = loadAgentCfg(home, company), staff = { ...(cur.staff ?? {}) };
  if (m === null) delete staff[role]; else staff[role] = Object.fromEntries(Object.entries({ ...staff[role], ...m }).filter(([k, v]) => v && k !== "agent" && !(m.command && !CMD_FIELDS.includes(k))));
  saveAgentCfg(home, company, { staff });
  if (staff[role]?.provider || staff[role]?.command) saveDefault(home, role, staff[role]); // remembered per-role preference
  return staff[role] ?? null;
}
export function saveAgentCfg(home, company, o) {
  if (o.agent && !providerIds(home).includes(o.agent)) throw new Error(`agent must be one of ${providerIds(home).join("|")}`);
  mkdirSync(join(home, ".config/agents-holding/state", company), { recursive: true, mode: 0o700 });
  const next = { ...loadAgentCfg(home, company), ...o };
  writeFileSync(cfgPath(home, company), JSON.stringify(next, null, 1), { mode: 0o600 });
  if (o.staff || "command" in o || o.lang) writeJsonc(home, company, next); // keep the commented agents.jsonc in sync
}
/** Resolve {agent, model} for a call. Agent: AH_AGENT > per-staff override (agent.json staff.<role>.agent) > company agent.json > grok.
 * Model: AH_MODEL/AH_TEXT_MODEL > per-staff model (staff.<role>.model) > the flow's per-stage model (server flow def stage.model / flow model)
 * > company model/text_model > CLI defaults. `holding staff list` shows exactly this resolution. */
export function resolveAgent({ env = process.env, cfg = {}, text, role = null, stageModel = null, global = loadGlobalCfg(env.HOME || homedir()) }) {
  // per-staff mapping: company agent.json staff.<role> over agents.json staff.<role>; `agent` is the legacy name of `provider`
  const gs = (role && global.staff?.[role]) || {}, cs = (role && cfg.staff?.[role]) || {};
  const st = { ...gs, ...cs, provider: cs.provider ?? cs.agent ?? gs.provider ?? gs.agent };
  const gd = global.default ?? {};
  const agent = String(env.AH_AGENT || st.provider || cfg.agent || gd.provider || "grok").toLowerCase();
  const provs = { ...(global.providers ?? {}), ...(cfg.providers ?? {}) }; // company-local provider defs win
  const ids = providerIds(env.HOME || homedir(), { providers: provs });
  if (!ids.includes(agent)) throw new Error(`provider ${agent}: use ${ids.join("|")}`);
  const pd = provs[agent] ?? {};
  const d = DEFAULT_MODELS[pd.type ?? agent] && !pd.model ? DEFAULT_MODELS[pd.type ?? agent] : { text: pd.textModel ?? pd.model ?? gd.model ?? null, code: pd.model ?? gd.model ?? null };
  const model = text ? (env.AH_TEXT_MODEL || st.model || stageModel || cfg.text_model || d.text) : (env.AH_MODEL || st.model || stageModel || cfg.model || d.code);
  // reasoning effort (low|medium|high): AH_EFFORT > staff.<role>.effort > company effort (text_effort for text calls) > codex text default low
  let effort = String(env.AH_EFFORT || st.effort || (text ? cfg.text_effort || cfg.effort : cfg.effort) || gd.effort || (agent === "codex" && text ? "low" : "")).toLowerCase() || null;
  if (effort && !EFFORTS.includes(effort)) effort = null;
  const bin = env[`AH_${agent.toUpperCase().replace(/-/g, "_")}_BIN`] || (agent === "grok" ? env.GROK_BIN : null) || pd.bin || agent;
  const command = env.AH_AGENT ? null : (st.command || (!st.provider && cfg.command) || null); // fixed launch command: staff > company default
  const binding = command ? { ...(st.command ? st : {}), command } : null;
  const fallback = (Array.isArray(st.fallback) ? st.fallback : st.fallback ? [st.fallback] : []).map(String).filter(Boolean); // per-staff fallback commands (agents.jsonc)
  return { fallback, binding, agent: command ? "command" : agent, model: command ? null : model || null, effort: command ? null : effort, bin, command, providerDef: pd.type ? pd : null };
}

/** Fields of a fixed-command staff binding; {model} {effort} {cwd} {max_turns} placeholders resolve from them. */
export const CMD_FIELDS = ["command", "model", "effort", "cwd", "context", "max_turns", "timeout", "env", "fallback", "jira_user"];
export const EFFORTS = ["low", "medium", "high"];
/** `holding staff list` runtime cell for one staff: "<model> - <effort>" exactly as resolveAgent will run it. */
export function staffRuntime({ env = process.env, cfg = {}, role, text = true, stageModel = null }) {
  const r = resolveAgent({ env, cfg, text, role, stageModel });
  if (r.command) return `$ ${r.command.length > 40 ? r.command.slice(0, 39) + "…" : r.command}`;
  return `${r.model ?? `${r.agent} default`} - ${r.effort ?? "default"}`;
}
export function claudeArgs({ model, text, prompt, schema, system, codeTools = CLAUDE_CODE_TOOLS, maxTurns, effort, context }) {
  if (!text && !maxTurns) maxTurns = Math.max(5, Number(process.env.AH_CODE_MAX_TURNS) || 25);
  return ["-p", ...(maxTurns ? ["--max-turns", String(maxTurns)] : []), "--output-format", "json", "--no-session-persistence", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands",
    "--permission-mode", "bypassPermissions", "--tools", text ? "" : codeTools,
    ...(model ? ["--model", model] : []), ...(effort ? ["--effort", effort] : []), ...(system ? ["--system-prompt", system] : []), ...(context ? ["--append-system-prompt", context] : []), "--json-schema", JSON.stringify(schema), prompt];
}
export function codexArgs({ model, text, prompt, schemaFile, system, effort, context }) {
  // Holding's local policy is the authority for staff access.  Codex's
  // workspace-write seatbelt can reject managed macOS company repos before
  // the worker even starts (sandbox_apply: Operation not permitted).  Use
  // full local access for implementation workers; denied paths are enforced
  // by the generated Holding policy/native wrapper. Text-only stages remain
  // read-only.
  return ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "-s", text ? "read-only" : "danger-full-access", "--output-schema", schemaFile,
    ...(model ? ["-m", model] : []), ...(effort || text ? ["-c", `model_reasoning_effort="${effort ?? "low"}"`] : []), ...(context || system ? ["-c", `developer_instructions=${JSON.stringify([system, context].filter(Boolean).join("\n\n"))}`] : []), prompt];
}

/** Lean CODEX_HOME: auth only (symlink), no MCP servers / custom prompts -> small, predictable context. */
export function leanCodexHome(home) {
  const d = join(home, ".config/agents-holding/codex-home"); mkdirSync(d, { recursive: true, mode: 0o700 });
  const auth = join(d, "auth.json"), real = join(process.env.CODEX_HOME || join(home, ".codex"), "auth.json");
  try { if (!existsSync(auth) && existsSync(real)) execFileSync("ln", ["-sf", real, auth]); } catch {}
  const cfg = join(d, "config.toml");
  if (!existsSync(cfg)) writeFileSync(cfg, "# agents-holding lean codex home (listener runs): no MCP servers\napproval_policy = \"never\"\n\n[agents]\nenabled = true\n");
  else { const current = readFileSync(cfg, "utf8"); if (!/\[agents\][\s\S]*?enabled\s*=\s*true/.test(current)) writeFileSync(cfg, `${current.trimEnd()}\n\n[agents]\nenabled = true\n`); }
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

/** Remembered per-role bindings (the user's preference), prefilled by holding provider set / staff add / project add: ~/.config/agents-holding/agent-defaults.json */
const defaultsPath = (home) => join(home, ".config/agents-holding/agent-defaults.json");
export function loadDefaults(home = process.env.HOME || homedir()) { try { return JSON.parse(readFileSync(defaultsPath(home), "utf8")); } catch { return {}; } }
export function saveDefault(home, role, m) {
  if (role === "ceo") return;
  const d = loadDefaults(home);
  if (m === null) delete d[role]; else d[role] = Object.fromEntries(Object.entries(m).filter(([k, v]) => v && ["provider", ...CMD_FIELDS].includes(k)));
  mkdirSync(join(home, ".config/agents-holding"), { recursive: true, mode: 0o700 });
  writeFileSync(defaultsPath(home), JSON.stringify(d, null, 1), { mode: 0o600 });
}
export const bindingLabel = (role, m) => m?.command ? `${role} - $ ${m.command.length > 40 ? m.command.slice(0, 39) + "…" : m.command}` : `${role} - ${m?.provider ?? "?"}/${m?.model ?? "default"} - ${m?.effort ?? "default"}`;
