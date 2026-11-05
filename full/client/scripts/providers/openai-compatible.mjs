import "../kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// Generic adapter for any OpenAI-compatible /chat/completions endpoint (DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio, vLLM...).
// Configured only in ~/.config/agents-holding/agents.json -> providers.<name> = { "type": "openai-compatible", "baseURL", "model",
// "keychain": "<Keychain service holding the API key>" (omit for keyless local servers), "maxTurns", "testCommand", "supportsEffort" }.
// No native coding CLI needed: a minimal, repo-confined tool loop (read_file, list_dir, write_file, run_tests) with capped turns.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const keyFrom = (svc) => { if (!svc) return null; try { return execFileSync("security", ["find-generic-password", "-s", svc, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const firstJson = (s) => { const m = String(s ?? "").match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const fn = (name, description, props, req = Object.keys(props)) => ({ type: "function", function: { name, description, parameters: { type: "object", properties: props, required: req } } });
const S = { type: "string" };
export const TOOL_DEFS = {
  read_file: fn("read_file", "Read a text file in the repo (path relative to repo root).", { path: S }),
  list_dir: fn("list_dir", "List entries of a repo directory (relative path, '.' = root).", { path: S }),
  write_file: fn("write_file", "Create or overwrite a repo file with the full new content.", { path: S, content: S }),
  run_tests: fn("run_tests", "Run the project's configured test command; returns exit code and the output tail.", {}, []),
};
/** Resolve a model-supplied path inside the repo; refuses escapes and .git. */
export function safePath(root, p) {
  const r = resolve(root), abs = resolve(r, String(p ?? "."));
  if (abs !== r && !abs.startsWith(r + sep)) throw new Error("path outside repo");
  if (relative(r, abs).split(sep).includes(".git")) throw new Error(".git is off limits");
  return abs;
}
export function runTool(name, args, { cwd, testCommand, write }) {
  try {
    if (name === "read_file") { const t = readFileSync(safePath(cwd, args.path), "utf8"); return t.length > 20000 ? t.slice(0, 20000) + "\n...[truncated]" : t; }
    if (name === "list_dir") { const d = safePath(cwd, args.path); return readdirSync(d).filter((x) => x !== ".git").slice(0, 300).map((x) => statSync(resolve(d, x)).isDirectory() ? x + "/" : x).join("\n"); }
    if (name === "write_file" && write) { const f = safePath(cwd, args.path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, String(args.content ?? "")); return `wrote ${relative(cwd, f)}`; }
    if (name === "run_tests" && write) {
      const cmd = testCommand || (existsSync(resolve(cwd, "package.json")) ? "npm test --silent" : null); if (!cmd) return "no test command configured";
      try { return "exit 0\n" + execFileSync("sh", ["-c", cmd], { cwd, encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] }).slice(-4000); }
      catch (e) { return `exit ${e.status ?? "?"}\n` + String((e.stdout ?? "") + (e.stderr ?? "")).slice(-4000); }
    }
    return `unknown tool ${name}`;
  } catch (e) { return `error: ${e.message}`; }
}

export function createProvider(name, def = {}) {
  const base = String(def.baseURL ?? "").replace(/\/+$/, "");
  const headers = () => { const k = keyFrom(def.keychain); return { "Content-Type": "application/json", ...(k ? { Authorization: `Bearer ${k}` } : {}) }; };
  return {
    id: name, displayName: def.displayName ?? `${name} (OpenAI-compatible)`, supportsEffort: !!def.supportsEffort, defaults: { text: def.textModel ?? def.model ?? null, code: def.model ?? null },
    async listModels() { const r = await fetch(`${base}/models`, { headers: headers() }); const j = await r.json(); return (j.data ?? []).map((m) => m.id); },
    async healthCheck() {
      if (!base) return { ok: false, detail: "no baseURL" };
      if (def.keychain && !keyFrom(def.keychain)) return { ok: false, detail: `no key in Keychain service ${def.keychain}` };
      try { const m = await this.listModels(); return { ok: true, detail: `${base} (${m.length} models)` }; } catch (e) { return { ok: false, detail: `${base} unreachable: ${e.message}` }; }
    },
    async run(o, ctx = {}) {
      const code = !o.text, names = code ? ["read_file", "list_dir", "write_file", "run_tests"] : o.kind === "tech" ? ["read_file", "list_dir"] : [];
      const maxTurns = o.maxTurns ?? (code ? def.maxTurns ?? 15 : o.kind === "tech" ? 4 : 1);
      const sys = [o.system, o.context, names.length ? "Use the tools to inspect/change files in the repo (paths relative to repo root)." : "",
        `When finished, reply with ONLY one JSON object matching this JSON schema:\n${JSON.stringify(o.schema)}`].filter(Boolean).join("\n\n");
      const msgs = [{ role: "system", content: sys }, { role: "user", content: o.prompt }];
      const usage = { input: 0, output: 0, cached: 0, reasoning: 0, calls: 0, model: o.model ?? def.model ?? null };
      for (let turn = 0; turn < maxTurns + 1; turn++) {
        const last = turn >= maxTurns; // final turn: no tools, force the answer
        const body = { model: o.model ?? def.model, messages: last ? [...msgs, { role: "user", content: "Turn limit reached: answer now with the JSON object only." }] : msgs,
          ...(names.length && !last ? { tools: names.map((n) => TOOL_DEFS[n]) } : {}), ...(o.effort && def.supportsEffort ? { reasoning_effort: o.effort } : {}) };
        let j; try { const r = await fetch(`${base}/chat/completions`, { method: "POST", headers: headers(), body: JSON.stringify(body) }); j = await r.json();
          if (!r.ok) return { result: {}, usage, exitCode: 1, error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}` }; }
        catch (e) { return { result: {}, usage, exitCode: 1, error: e.message }; }
        usage.calls++; usage.input += j.usage?.prompt_tokens ?? 0; usage.output += j.usage?.completion_tokens ?? 0; usage.cached += j.usage?.prompt_tokens_details?.cached_tokens ?? 0; usage.model = j.model ?? usage.model;
        const m = j.choices?.[0]?.message ?? {}; ctx.log?.(`${name} turn ${turn + 1}: ${m.tool_calls?.length ?? 0} tool calls`);
        if (!m.tool_calls?.length || last) { const result = firstJson(m.content) ?? (m.content ? { summary: String(m.content) } : {}); return { result, text: m.content ?? "", usage, exitCode: 0 }; }
        msgs.push({ role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls });
        for (const tc of m.tool_calls) { let a = {}; try { a = JSON.parse(tc.function?.arguments || "{}"); } catch {}
          msgs.push({ role: "tool", tool_call_id: tc.id, content: names.includes(tc.function?.name) ? runTool(tc.function.name, a, { cwd: o.cwd, testCommand: def.testCommand, write: code }) : "tool not allowed" }); }
      }
      return { result: {}, usage, exitCode: 1, error: "turn cap" };
    },
  };
}
export default createProvider;
