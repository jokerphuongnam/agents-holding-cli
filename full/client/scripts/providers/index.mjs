// AgentProvider registry. Interface (docs/PROVIDERS.md):
//   { id, displayName, supportsEffort, defaults: {text, code}, listModels?(), healthCheck(opts) -> {ok, detail},
//     run({prompt, system, schema, kind, text, cwd, model, effort, maxTurns, sid, bin}, ctx) -> {result, text?, usage:{input,output,...}, exitCode, error?} }
// Sources: built-ins (grok, claude, codex), agents.json providers.<name> {type:"openai-compatible"|<built-in>, ...},
// custom modules ~/.config/agents-holding/providers/<name>.mjs (default export = provider object or (name, def) => provider).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGlobalCfg } from "../agents.mjs";
import grok from "./grok.mjs";
import claude from "./claude.mjs";
import codex from "./codex.mjs";
import { createProvider as openaiCompatible } from "./openai-compatible.mjs";
export const BUILTINS = { grok, claude, codex };
export const customDir = (home) => join(home, ".config/agents-holding/providers");
export function customIds(home) { try { return readdirSync(customDir(home)).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)); } catch { return []; } }
export async function getProvider(id, home, cfg = loadGlobalCfg(home)) {
  const def = cfg.providers?.[id];
  if (def?.type === "openai-compatible") return openaiCompatible(id, def);
  if (customIds(home).includes(id)) { const m = (await import(pathToFileURL(join(customDir(home), `${id}.mjs`)).href)).default; return typeof m === "function" ? await m(id, def ?? {}) : m; }
  const b = BUILTINS[def?.type ?? id]; if (b) return b;
  throw new Error(`unknown provider ${id}: built-ins ${Object.keys(BUILTINS).join("|")}, or define it in agents.json / ${customDir(home)}`);
}
export async function listProviders(home, cfg = loadGlobalCfg(home)) {
  const ids = [...new Set([...Object.keys(BUILTINS), ...Object.keys(cfg.providers ?? {}), ...customIds(home)])];
  const out = [];
  for (const id of ids) { let p, h;
    try { p = await getProvider(id, home, cfg); h = await p.healthCheck({ bin: process.env[`AH_${id.toUpperCase().replace(/-/g, "_")}_BIN`] || cfg.providers?.[id]?.bin || id }); } catch (e) { h = { ok: false, detail: e.message }; }
    out.push({ id, name: p?.displayName ?? id, source: BUILTINS[id] && !cfg.providers?.[id] ? "built-in" : cfg.providers?.[id] ? "agents.json" : "custom module", ok: !!h?.ok, detail: h?.detail ?? "", effort: !!p?.supportsEffort });
  }
  return out;
}
