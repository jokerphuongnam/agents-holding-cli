// state/<company>/agents.jsonc: the per-staff launch config with explanatory comments (English, or Vietnamese when the company lang is vi).
// The runner reads it (comments and trailing commas allowed); holding staff set / bind rewrite it with the same comments, so hand
// edits to values are kept (loadAgentCfg merges it over agent.json) and the explanations never get lost.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const jsoncPath = (home, company) => join(home, ".config/agents-holding/state", company, "agents.jsonc");
/** JSONC -> value: drops line and block comments outside strings and trailing commas. */
export function parseJsonc(src) {
  let out = "", i = 0, q = false;
  while (i < src.length) { const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === "\\") { out += n ?? ""; i += 2; continue; } if (c === '"') q = false; i++; continue; }
    if (c === '"') { q = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? src.length : i + 2; continue; }
    out += c; i++; }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
export function loadJsonc(home, company) { try { return parseJsonc(readFileSync(jsoncPath(home, company), "utf8")); } catch { return null; } }

const T = {
  en: {
    head: `agents-holding: staff launch config for company {co}.
 Edit values here or use: holding staff set <staff> "<command>" [--model M] [--effort E] [--cwd DIR] [--context auto|none|FILE] [--max-turns N] [--timeout SEC] [--env K=V]
 Dry run (no model call): holding staff test <staff>     See all: holding staff list / holding provider list
 Comments are kept: holding staff set rewrites this file with the same explanations.`,
    fields: `Fields of one staff (only "command" is required):
   command    the exact command to run. {prompt} = ONLY the task (one argument, no shell: quotes/$ stay literal).
              No {prompt}/{prompt_file} -> the task goes to stdin.
   model      fills {model}        effort  fills {effort} (low|medium|high)     max_turns  fills {max_turns}
              an empty field drops "--flag {placeholder}" entirely
   cwd        working dir; empty = the company repo from projects.json (also {cwd})
   context    staff context = persona + 2-3 skill summaries + habits + language, built per run as a separate file:
              "auto" (default): {context}/{context_file} if used, else claude --append-system-prompt-file,
              codex -c developer_instructions, grok --rules, other CLIs env AH_CONTEXT_FILE; "none"; or a file path
   timeout    seconds before the run is killed (default 900)
   env        extra environment {"K": "V"} (the server key is never passed)
   jira_user  optional Jira assignee for this staff (accountId or email). Empty = the connected Jira account the Jira Listener
              uses. Set when the staff picks the card up (same moment as the staff:<id> label). For a future team mode.
 Output parsing follows the first word: claude / codex / grok JSON (with token usage), anything else = plain text.`,
    def: `"default": command for every staff without its own (empty = built-in provider adapter)`,
    staff: "Your staff (live values)",
    ex: "Examples (copy one into \"staff\" and remove the //)",
  },
  vi: {
    head: `agents-holding: cấu hình lệnh chạy cho từng nhân viên của công ty {co}.
 Sửa giá trị trực tiếp ở đây hoặc dùng: holding staff set <staff> "<lệnh>" [--model M] [--effort E] [--cwd THƯ_MỤC] [--context auto|none|FILE] [--max-turns N] [--timeout GIÂY] [--env K=V]
 Chạy thử (không gọi model): holding staff test <staff>     Xem tất cả: holding staff list / holding provider list
 Chú thích được giữ nguyên: holding staff set ghi lại file này cùng các giải thích.`,
    fields: `Các trường của một nhân viên (chỉ "command" là bắt buộc):
   command    lệnh chạy chính xác. {prompt} = CHỈ nội dung công việc (một tham số, không qua shell: dấu nháy/$ giữ nguyên).
              Không có {prompt}/{prompt_file} -> công việc được đưa vào stdin.
   model      điền vào {model}     effort  điền vào {effort} (low|medium|high)     max_turns  điền vào {max_turns}
              trường để trống sẽ bỏ luôn cặp "--flag {placeholder}"
   cwd        thư mục làm việc; để trống = repo của công ty trong projects.json (cũng là {cwd})
   context    ngữ cảnh nhân viên = persona + 2-3 tóm tắt skill + thói quen + ngôn ngữ, tạo riêng mỗi lần chạy thành file riêng:
              "auto" (mặc định): {context}/{context_file} nếu có, nếu không thì claude --append-system-prompt-file,
              codex -c developer_instructions, grok --rules, CLI khác qua biến môi trường AH_CONTEXT_FILE; "none"; hoặc đường dẫn file
   timeout    số giây trước khi dừng lần chạy (mặc định 900)
   env        biến môi trường thêm {"K": "V"} (khóa server không bao giờ được truyền)
   jira_user  (tùy chọn) người được giao trên Jira cho nhân viên này (accountId hoặc email). Để trống = tài khoản Jira
              mà Jira Listener đang dùng. Gán ngay khi nhân viên nhận thẻ (cùng lúc với nhãn staff:<id>). Dành cho chế độ team sau này.
 Đọc kết quả theo từ đầu tiên: claude / codex / grok dạng JSON (kèm token), còn lại = văn bản thường.`,
    def: `"default": lệnh cho mọi nhân viên chưa có lệnh riêng (để trống = adapter có sẵn)`,
    staff: "Nhân viên của bạn (giá trị đang dùng)",
    ex: "Ví dụ (chép một dòng vào \"staff\" và bỏ //)",
  },
};
const EXAMPLES = [
  ["claude", `"developer": { "command": "claude -p --model {model} --effort {effort} --max-turns {max_turns} --permission-mode acceptEdits --output-format json \\"{prompt}\\"", "model": "sonnet", "effort": "low", "max_turns": 25, "timeout": 900 },`],
  ["codex", `"tech-lead": { "command": "codex exec --json --skip-git-repo-check -s read-only -m {model} -c model_reasoning_effort=\\"{effort}\\" \\"{prompt}\\"", "model": "gpt-5", "effort": "medium" },`],
  ["grok", `"ba-lead": { "command": "grok --single \\"{prompt}\\" --model {model} --reasoning-effort {effort} --max-turns {max_turns} --output-format json --no-subagents", "model": "grok-4.7-build-fast", "effort": "low", "max_turns": 1 },`],
  ["ollama", `"qa-lead": { "command": "ollama run {model}", "model": "qwen2.5-coder", "context": "none" },`],
  ["jira_user", `"developer": { "command": "", "jira_user": "dev@example.com" },`],
  ["custom CLI", `"writer": { "command": "my-llm --system-file {context_file} --cwd {cwd} --prompt-file {prompt_file}", "env": { "MY_LLM_PROFILE": "work" } },`],
];
export function renderJsonc(company, { staff = {}, command = "", lang = "en" } = {}) {
  const t = T[lang === "vi" ? "vi" : "en"], c = (s) => s.split("\n").map((l) => `//${l.startsWith(" ") ? "" : " "}${l}`).join("\n");
  const live = Object.entries(staff).filter(([r]) => r !== "ceo").map(([r, m]) => `    ${JSON.stringify(r)}: ${JSON.stringify(m)}`).join(",\n");
  return `${c(t.head.replace("{co}", company))}
//
${c(t.fields)}
{
  // ${t.def}
  "default": ${JSON.stringify(command ?? "")},
  // ${t.staff}
  "staff": {
${live}${live ? "\n" : ""}    // ${t.ex}:
${EXAMPLES.map(([k, v]) => `    // ${k}:\n    // ${v}`).join("\n")}
  }
}
`;
}
export function writeJsonc(home, company, cfg) {
  mkdirSync(join(home, ".config/agents-holding/state", company), { recursive: true, mode: 0o700 });
  const f = jsoncPath(home, company); writeFileSync(f, renderJsonc(company, { staff: cfg.staff ?? {}, command: cfg.command ?? "", lang: cfg.lang }), { mode: 0o600 }); return f;
}
