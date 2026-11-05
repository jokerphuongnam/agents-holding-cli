// Fixed per-staff launch command (holding staff set <staff> "claude -p --model sonnet --effort low").
// The runner executes exactly that command in the company repo. The prompt is injected where {prompt} / {prompt_file} appear,
// otherwise it is written to stdin. Optional placeholders: {system} {system_file} {cwd}. Output/usage parsing is picked by the
// first word: claude | codex | grok | ollama | anything else = plain text.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseClaude, parseCodex } from "../agents.mjs";
import { parseResult } from "../lean.mjs";
import * as POL from "../policy.mjs";

/** Split a command line into argv (quotes and backslashes like sh, no expansion). */
export function words(s) {
  const out = []; let cur = "", q = null, has = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === q) q = null; else if (c === "\\" && q === '"' && i + 1 < s.length) cur += s[++i]; else cur += c; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === "\\" && i + 1 < s.length) { cur += s[++i]; has = true; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ""; has = false; continue; }
    cur += c; }
  if (q) throw new Error("unclosed quote in command");
  if (cur || has) out.push(cur); return out;
}
export const kindOf = (cmd) => { const w = basename(words(cmd)[0] ?? ""); return ["claude", "codex", "grok", "ollama"].includes(w) ? w : "text"; };
export const shortCmd = (cmd, n = 40) => (cmd.length > n ? cmd.slice(0, n - 1) + "…" : cmd);

export const PLACEHOLDERS = ["prompt", "prompt_file", "model", "effort", "cwd", "context", "context_file", "max_turns"];
/** Build {bin, args, stdin, env} for one call; pure except temp files, used by `holding staff test` too.
 * b = staff binding fields {command, model, effort, cwd, context: auto|none|<file>, max_turns, timeout, env}.
 * {prompt} carries ONLY the task. The staff context goes through {context}/{context_file}, else the CLI's native channel
 * (claude --append-system-prompt-file, codex -c developer_instructions, grok --rules), else env AH_CONTEXT_FILE. */
export function render(cmd, { prompt = "", context = "", cwd = process.cwd(), dir = null, b = {} } = {}) {
  const w = words(cmd); if (!w.length) throw new Error("empty command");
  const d = dir ?? mkdtempSync(join(tmpdir(), "ah-cmd-"));
  const file = (name, body) => { const f = join(d, name); writeFileSync(f, body, { mode: 0o600 }); return f; };
  const ctx = b.context === "none" ? "" : b.context && b.context !== "auto" ? (() => { try { return readFileSync(b.context, "utf8"); } catch { throw new Error(`context file not readable: ${b.context}`); } })() : context;
  let used = false, ctxUsed = false, ctxFile = null;
  const val = { model: b.model ?? "", effort: b.effort ?? "", cwd, max_turns: b.max_turns ? String(b.max_turns) : "" };
  const out = [];
  for (const t of w.slice(1)) {
    let empty = false;
    const r = t.replace(/\{(\w+)\}/g, (all, k) => {
      if (!PLACEHOLDERS.includes(k)) return all;
      if (k === "prompt") { used = true; return prompt; }
      if (k === "prompt_file") { used = true; return file("prompt.txt", prompt); }
      if (k === "context") { ctxUsed = true; return ctx; }
      if (k === "context_file") { ctxUsed = true; return (ctxFile ??= file("context.md", ctx)); }
      if (!val[k]) empty = true; return val[k];
    });
    if (empty && r === "" && out.length && out[out.length - 1].startsWith("-")) { out.pop(); continue; } // "--model {model}" with no model: drop the pair
    out.push(r);
  }
  const kind = kindOf(cmd), env = { ...(b.env ?? {}) };
  if (ctx && !ctxUsed) {
    if (kind === "claude") out.splice(0, 0, "--append-system-prompt-file", (ctxFile ??= file("context.md", ctx)));
    else if (kind === "codex") { const i = out.indexOf("exec"); out.splice(i >= 0 ? i + 1 : 0, 0, "-c", `developer_instructions=${JSON.stringify(ctx)}`); }
    else if (kind === "grok") out.splice(0, 0, "--rules", ctx);
    else env.AH_CONTEXT_FILE = (ctxFile ??= file("context.md", ctx));
  }
  if (used && out.some((a) => a.length > 200000)) throw new Error("prompt too long for {prompt}: use {prompt_file} or stdin (no placeholder)");
  return { bin: w[0], args: out, stdin: used ? null : prompt, kind, env, contextVia: !ctx ? "none" : ctxUsed ? "placeholder" : { claude: "--append-system-prompt-file", codex: "-c developer_instructions", grok: "--rules" }[kind] ?? "env AH_CONTEXT_FILE", cwd: b.cwd || cwd };
}

export function parseOut(kind, stdout, model = null) {
  if (kind === "claude" && /^\s*[\[{]/.test(stdout)) return parseClaude(stdout, model);
  if (kind === "codex" && /"type"\s*:/.test(stdout)) return parseCodex(stdout, model);
  if (kind === "grok" && /^\s*\{/.test(stdout)) return { result: parseResult(stdout) };
  const t = stdout.trim(), m = t.match(/\{[\s\S]*\}\s*$/); let j = null; try { j = m && JSON.parse(m[0]); } catch {}
  return { result: j && typeof j === "object" ? j : { summary: t }, text: t };
}

/** Run a fixed command as one staff call. system (stage instructions) + staff context go to the context channel, never into {prompt}. */
export async function runCommand(b, { prompt, system, context, cwd, env = process.env, log = () => {}, company = env.AH_COMPANY, role = null }) {
  prompt = POL.redactText(prompt ?? ""); if (context) context = POL.redactText(context); if (system) system = POL.redactText(system);
  if (typeof b === "string") b = { command: b };
  const r = render(b.command, { prompt, context: [system, context].filter(Boolean).join("\n\n"), cwd, b });
  const timeoutMs = (Number(b.timeout) || 0) * 1000 || Number(process.env.AH_RUN_TIMEOUT_MS) || 15 * 60000;
  const e = { ...env, ...r.env }; delete e.AGENTS_HOLDING_KEY; // staff commands never get server access
  log(`command ${r.bin} (${r.kind}) in ${r.cwd}, prompt via ${r.stdin === null ? "placeholder" : "stdin"}, context via ${r.contextVia}`);
  const buf = [], errb = [];
  const exitCode = await new Promise((res) => {
    const w = POL.wrapLaunch({ co: company, role: role ?? "staff", bin: r.bin, args: r.args, env: e, cwd: r.cwd });
    const ch = spawn(w.bin, w.args, { cwd: r.cwd, env: w.env, stdio: [r.stdin === null ? "ignore" : "pipe", "pipe", "pipe"] });
    ch.stdout.on("data", (d) => buf.push(d)); ch.stderr.on("data", (d) => errb.push(d));
    if (r.stdin !== null) { ch.stdin.on("error", () => {}); ch.stdin.end(r.stdin); }
    const t = setTimeout(() => ch.kill("SIGTERM"), timeoutMs);
    ch.on("close", (c, s) => { clearTimeout(t); res(c ?? s); }); ch.on("error", () => { clearTimeout(t); res(127); });
  });
  const out = Buffer.concat(buf).toString("utf8"), p = parseOut(r.kind, out, b.model);
  return { result: p.result ?? {}, usage: p.usage ?? null, error: p.error ?? (exitCode ? Buffer.concat(errb).toString("utf8").slice(-300) : null), exitCode, text: p.text ?? null };
}
export const commandProvider = (b) => ({ id: "command", displayName: `command: ${shortCmd(b.command ?? b)}`, run: (o, ctx) => runCommand(b, { prompt: o.prompt, system: o.system, context: o.context, cwd: o.cwd, log: ctx?.log, company: o.company, role: o.role }) });

/** Commented example of every staff binding field, written once to ~/.config/agents-holding/staff.example.jsonc on setup. */
export const EXAMPLE = `// agents-holding: staff launch command bindings (example; the live file is state/<company>/agent.json "staff").
// Set with: holding staff set <staff> "<command>" [--model M] [--effort E] [--cwd DIR] [--context auto|none|FILE] [--max-turns N] [--timeout SEC] [--env K=V]
// {prompt} = ONLY the task. Staff context (persona, skill summaries, habits, language) is a separate per-run file:
//   {context} / {context_file} if you use them, else claude --append-system-prompt-file, codex -c developer_instructions, grok --rules,
//   else env AH_CONTEXT_FILE. No {prompt}/{prompt_file}: the task goes to stdin. cwd defaults to the company repo (projects.json).
{
  "staff": {
    "developer": {
      "command": "claude -p --model {model} --effort {effort} --max-turns {max_turns} --permission-mode acceptEdits --output-format json \\"{prompt}\\"",
      "model": "sonnet", "effort": "low", "max_turns": 25,
      "cwd": "",            // empty = company repo
      "context": "auto",    // auto | none | /path/to/context.md
      "timeout": 900,       // seconds
      "env": { "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "8000" }
    },
    "tech-lead": { "command": "codex exec --json --skip-git-repo-check -s read-only -m {model} -c model_reasoning_effort=\\"{effort}\\" \\"{prompt}\\"", "model": "gpt-5", "effort": "medium" },
    "ba-lead":   { "command": "grok --single \\"{prompt}\\" --model {model} --reasoning-effort {effort} --max-turns {max_turns} --output-format json --no-subagents", "model": "grok-4.7-build-fast", "effort": "low", "max_turns": 1 },
    "qa":        { "command": "ollama run {model}", "model": "qwen2.5-coder", "context": "none" },
    "writer":    { "command": "my-llm --system-file {context_file} --cwd {cwd} --prompt-file {prompt_file}" }
  }
}
`;
export function writeExample(home) { const f = join(home, ".config/agents-holding/staff.example.jsonc"); try { readFileSync(f); } catch { writeFileSync(f, EXAMPLE, { mode: 0o600 }); } return f; }

/** Effective built-in launch templates (what the built-in adapters run; verified against grok 1.0.70, claude 2.1.177, codex 0.133 --help).
 * Text stages run without tools; code stages get repo tools. Context = per-run staff context, delivered natively. */
export const BUILTIN_TEMPLATES = {
  grok: { text: `grok --trust --always-approve --session-id <uuid> --model {model} --reasoning-effort {effort} --tools read_file --max-turns 1 --disable-web-search --no-subagents --no-plan --system-prompt-override <stage system> --rules {context} --json-schema <schema> --output-format json --single "{prompt}"`,
    code: `grok ... --tools <code tools> --max-turns {max_turns} ... --output-format json --single "{prompt}"   (GROK_HOME = lean home, no MCP)`, parse: "JSON .structuredOutput (else last {...} in .text); usage from the grok session file", cwd: "company repo" },
  claude: { text: `claude -p --output-format json --no-session-persistence --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands --permission-mode bypassPermissions --tools "" --model {model} --effort {effort} --system-prompt <stage system> --append-system-prompt {context} --json-schema <schema> "{prompt}"`,
    code: `claude -p --max-turns {max_turns} ... --tools Bash,Read,Edit,Write,Grep,Glob ...   (--max-turns is accepted but hidden from --help)`, parse: "JSON result .structured_output/.result; usage .usage (input/output/cache) + total_cost_usd", cwd: "company repo" },
  codex: { text: `codex exec --json --skip-git-repo-check --ephemeral -s read-only --output-schema <schema file> -m {model} -c model_reasoning_effort="{effort}" -c developer_instructions="<stage system + {context}>" "{prompt}"`,
    code: `codex exec --json ... -s workspace-write ...   (CODEX_HOME = lean home: auth only, no MCP)`, parse: "JSONL: last item.completed agent_message; usage from turn.completed", cwd: "company repo" },
  "openai-compatible": { text: `POST {baseURL}/chat/completions {model, messages:[system: <stage system>+{context}, user: {prompt}]}`, code: "same + repo-confined tools read_file/list_dir/write_file/run_tests, up to maxTurns", parse: "choices[0].message.content (JSON); usage.prompt_tokens/completion_tokens", cwd: "company repo",
    example: `agents.json providers.ollama = {"type":"openai-compatible","baseURL":"http://localhost:11434/v1","model":"qwen2.5-coder"}` },
  ollama: { text: `ollama run {model}   (prompt on stdin, context via env AH_CONTEXT_FILE; or use the openai-compatible provider above for a system message)`, parse: "plain text", cwd: "company repo" },
};
