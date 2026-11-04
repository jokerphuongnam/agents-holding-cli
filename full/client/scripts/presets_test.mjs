// node presets_test.mjs: every preset is headless; endpoint presets are OpenAI-compatible; bindings are well-formed.
import { PRESETS, isHeadless, bindingFor, detect, NOTE_VI } from "./presets.mjs";
let f = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) f++; };
for (const id of ["claude", "codex", "ollama", "lmstudio", "llamacpp", "vllm", "openai-compatible"]) ok(`preset ${id} exists`, PRESETS.some((p) => p.id === id));
for (const p of PRESETS) { ok(`${p.id}: headless`, isHeadless(p)); const b = bindingFor(p);
  ok(`${p.id}: binding`, p.kind === "command" ? !!b.command && !/--interactive|\bchat\b/.test(b.command) : b.providerDef?.type === "openai-compatible" && /^http:\/\/localhost:\d+\/v1$/.test(b.providerDef.baseURL));
  const d = await detect(p); ok(`${p.id}: detect returns a status`, typeof d.installed === "boolean" && !!d.how); }
ok("VI note says headless + no chat", /chạy nền/.test(NOTE_VI) && /KHÔNG mở cửa sổ chat/.test(NOTE_VI) && /sai cách/.test(NOTE_VI));
console.log(`presets_test: ${f} failures`); process.exit(f ? 1 : 0);
