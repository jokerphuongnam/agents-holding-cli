#!/usr/bin/env node
// Sub-agent presets: every preset is a HEADLESS runner the staff invokes in the background for one task (no chat window, no TTY).
// kind "command" = a fixed non-interactive launch command; kind "endpoint" = a local OpenAI-compatible server (agents.json provider).
// holding staff presets [--json]  |  holding staff add <role> --preset <id> [--model M]
import { execFileSync } from "node:child_process";
export const NOTE_VI = "Lưu ý: chọn ở đây là tạo một sub agent để nhân sự gọi chạy nền (headless) khi làm task — KHÔNG mở cửa sổ chat. " +
  "Với LLM chạy trên máy (Ollama, LM Studio, llama.cpp, vLLM…): cài xong rồi mở chat với nó là sai cách; cách đúng là thêm nó làm sub agent runner ở bước này.";
export const NOTE_EN = "Note: choosing here creates a sub agent the staff runs headless in the background for each task — it does NOT open a chat. " +
  "For local LLMs (Ollama, LM Studio, llama.cpp, vLLM…): installing one and chatting with it is the wrong way; add it here as a sub-agent runner.";
export const PRESETS = [
  { id: "claude", name: "Claude Code (headless -p)", kind: "command", bin: "claude", command: 'claude -p --output-format json --no-session-persistence --permission-mode bypassPermissions --model {model} "{prompt}"' },
  { id: "codex", name: "Codex (codex exec)", kind: "command", bin: "codex", command: 'codex exec --json --skip-git-repo-check --ephemeral -m {model} "{prompt}"' },
  { id: "ollama", name: "Ollama (ollama run, prompt on stdin)", kind: "command", bin: "ollama", command: "ollama run {model} --nowordwrap", model: "qwen2.5-coder" },
  { id: "ollama-api", name: "Ollama server (OpenAI-compatible)", kind: "endpoint", baseURL: "http://localhost:11434/v1", model: "qwen2.5-coder" },
  { id: "lmstudio", name: "LM Studio local server", kind: "endpoint", baseURL: "http://localhost:1234/v1", model: "local-model" },
  { id: "llamacpp", name: "llama.cpp server (llama-server)", kind: "endpoint", baseURL: "http://localhost:8080/v1", model: "local-model", bin: "llama-server" },
  { id: "vllm", name: "vLLM server", kind: "endpoint", baseURL: "http://localhost:8000/v1", model: "local-model", bin: "vllm" },
  { id: "openai-compatible", name: "Any OpenAI-compatible endpoint (set baseURL)", kind: "endpoint", baseURL: "http://localhost:8000/v1", model: "local-model" },
];
/** Every preset must be non-interactive: commands carry their headless flag, endpoints are plain HTTP. */
export const isHeadless = (p) => p.kind === "endpoint" || /(^claude .*(-p|--print)\b)|(^codex exec\b)|(^ollama run \S+)/.test(p.command);
const has = (bin) => { try { execFileSync("/bin/sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }); return true; } catch { return false; } };
async function up(url) { try { const r = await fetch(`${url}/models`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } }
/** detect-installed: binary on PATH, or the local server answering /models. */
export async function detect(p) {
  if (p.kind === "command") return { installed: has(p.bin), how: has(p.bin) ? `${p.bin} found` : `${p.bin} not on PATH` };
  const ok = await up(p.baseURL); return { installed: ok || (p.bin ? has(p.bin) : false), running: ok, how: ok ? `server answers at ${p.baseURL}` : p.bin && has(p.bin) ? `${p.bin} installed, server not running` : `no server at ${p.baseURL}` };
}
/** Binding for holding staff add --preset: command presets -> {command, model}; endpoint presets -> provider def + {provider, model}. */
export function bindingFor(p, model) {
  if (p.kind === "command") return { command: p.command, model: model ?? p.model };
  return { provider: p.id, model: model ?? p.model, providerDef: { type: "openai-compatible", baseURL: p.baseURL, model: model ?? p.model } };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const vi = /^vi/i.test(process.env.AH_LANG ?? process.env.LANG ?? "");
  const rows = await Promise.all(PRESETS.map(async (p) => ({ ...p, ...(await detect(p)) })));
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  console.log(vi ? NOTE_VI : NOTE_EN); console.log("");
  rows.forEach((p, i) => console.log(`${i + 1}. ${p.installed ? "✅" : "▫️"} ${p.id.padEnd(18)} ${p.name} — ${p.how}\n     ${p.kind === "command" ? "$ " + p.command : "POST " + p.baseURL + "/chat/completions"}`));
  console.log(vi ? "\nGắn cho nhân sự: holding staff add <role> --preset <id> [--model M]" : "\nAttach to a staff: holding staff add <role> --preset <id> [--model M]");
  const { select } = await import("./menu.mjs");
  const i = await select(vi ? "\nChọn preset:" : "\nPick a preset:", rows.map((p) => `${p.installed ? "✅" : "▫️"} ${p.id.padEnd(18)} ${p.name}`));
  if (i !== null) console.log(`\n${vi ? "Lệnh gắn" : "Attach with"}: holding staff add <role> --preset ${rows[i].id}${rows[i].installed ? "" : `\n⚠️  ${rows[i].how}`}`);
}
