# Provider cho agent: AI nào chạy từng nhân sự

[English](../PROVIDERS.md)

Lean runner và `/ceo` nói chuyện với **provider** qua một giao diện nhỏ (protocol `AgentProvider`). Chúng không gắn với một CLI cụ thể.

| Loại | Là gì | Đến từ đâu |
| --- | --- | --- |
| Tích hợp sẵn | `grok`, `claude`, `codex`: các CLI coding gốc | `scripts/providers/*.mjs` |
| `openai-compatible` | Mọi endpoint `/v1/chat/completions`, ví dụ DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio or vLLM | config only |
| Tuỳ chỉnh | Module của bạn | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` liệt kê mọi provider kèm kiểm tra sức khỏe: phiên bản binary, endpoint tới được, và key Keychain có mặt hay không.

## Ánh xạ nhân sự theo công ty

Ví dụ của người dùng gửi mỗi nhân sự tới một provider khác:
- BA → LLM local
- the developer's coding → mô hình Claude rẻ
- PO (plan) → mô hình Codex đắt

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` đặt runtime ngay sau tên mỗi nhân sự. Mô tả ở dòng sau.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**CEO luôn là phiên chat hiện tại của bạn** (bất kỳ agent và model nào bạn đang chat). Không có binding và `holding staff set ceo …` bị từ chối. Khi CEO hoặc leader ủy quyền, nó dùng lệnh spawn staff tương ứng; provider tạo native sub-agent/thread trên binding của staff đó. Jira Listener chỉ đưa event, workflow và checkpoint; với stage manager/leader, listener không tự chọn và chạy IC thay cho manager.

### Điều phối manager linh hoạt

Binding chỉ là lựa chọn, không phải flow cố định. Có thể dùng Codex cho
CEO/leader, Claude cho coding hoặc QC, và local LLM cho task nhỏ. Manager đọc
roster/skill để chọn staff cần spawn: cần hỏi user thì gọi `ba-user`, cần plan
mới gọi `po-new`, sửa plan gọi `po-modify`, còn implementation/QC thì gọi role
tương ứng. Provider của staff đó mới quyết định native sub-agent thực thi.

**Bước binding.** `holding project add` (công ty mới) và `holding staff add <role>` hỏi từng nhân sự (không bao giờ CEO):

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter nhận Default (binding đã nhớ cho vai trò đó). Custom hỏi provider (danh sách từ `holding provider list`, kèm sức khỏe) → model → effort, và trở thành mặc định mới được nhớ. Trong chat agent: `/staff add <role> --agent claude --model haiku --effort low` (không cờ = mặc định đã nhớ). `holding provider set [staff …]` chạy lại bước. Binding đã nhớ nằm trong `~/.config/agents-holding/agent-defaults.json`; `holding provider list` hiện chúng, `holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` sửa chúng. Mọi `set-staff` cũng được nhớ. Nhân sự không binding dùng mặc định công ty và bị gắn `⚠ unbound` trong `/staff list`.

Ánh xạ được lưu **theo công ty** trong `~/.config/agents-holding/state/<company>/agent.json`:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

Mặc định toàn cục và định nghĩa provider nằm trong `~/.config/agents-holding/agents.json`. File công ty cũng có thể định nghĩa `providers` riêng.

**Thứ tự resolve** (cùng thứ tự mọi nơi: lean run, `holding staff run`, `/staff run`, `/staff list`):

- **Provider:**
  1. `AH_AGENT`
  2. `staff.<role>.provider` của company
  3. `staff.<role>.provider` toàn cục
  4. `agent` của company
  5. `default.provider` toàn cục
  6. `grok`
- **Model:**
  1. `AH_MODEL` (code) hoặc `AH_TEXT_MODEL` (text)
  2. model trong staff mapping
  3. model theo stage của flow (`/flow edit`: stage `model`, hoặc flow `model`)
  4. `model` / `text_model` của company
  5. default của provider
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. effort trong staff mapping
  3. `effort` / `text_effort` của company
  4. `default.effort` toàn cục

  Cách effort tới từng provider:
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`, chỉ khi `supportsEffort: true`

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` vẫn chạy (legacy).

## Ví dụ Ollama (local, miễn phí)

```bash
ollama pull qwen2.5-coder:7b && ollama serve   # http://localhost:11434
```

`~/.config/agents-holding/agents.json`:

```json
{
  "default": { "provider": "grok" },
  "providers": {
    "ollama":   { "type": "openai-compatible", "baseURL": "http://localhost:11434/v1", "model": "qwen2.5-coder:7b", "maxTurns": 12, "testCommand": "npm test --silent" },
    "deepseek": { "type": "openai-compatible", "baseURL": "https://api.deepseek.com/v1", "model": "deepseek-chat", "keychain": "agents-holding-deepseek" },
    "kimi":     { "type": "openai-compatible", "baseURL": "https://api.moonshot.ai/v1", "model": "kimi-k2", "keychain": "agents-holding-kimi" }
  }
}
```

Sau đó chạy `holding staff set ba-lead ollama qwen2.5-coder:7b low` và kiểm tra bằng `holding provider list`. LM Studio (`http://localhost:1234/v1`) và vLLM (`http://host:8000/v1`) cũng dùng tương tự.

**Bí mật: chỉ Keychain.** Trường `keychain` của provider đặt tên dịch vụ macOS Keychain. Key được đọc lúc gọi (`security find-generic-password -s <service> -a $USER -w`), và không bao giờ ghi vào file cấu hình hay log. Để lưu:

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Server local như Ollama không cần key; bỏ `keychain`.

**Không có CLI coding gốc?** Adapter `openai-compatible` chạy vòng tool tối thiểu của riêng nó:

| Stage | Tools | Turns |
| --- | --- | --- |
| Stage chữ (plan, question) | không | 1 lần gọi |
| Tech plan | `read_file` và `list_dir` | tối đa 4 lượt |
| Coding | `read_file`, `list_dir`, `write_file` và `run_tests` | tối đa `maxTurns` lượt (mặc định 15) |

`run_tests` chạy `testCommand`, hoặc `npm test` khi có `package.json`. Mọi đường dẫn phải nằm trong repo: đường dẫn ra ngoài (`..`) và `.git` bị từ chối. Ở lượt cuối tools bị tắt để model đưa câu trả lời JSON cuối.

## Giao diện `AgentProvider`

```js
export default {
  id: "my-llm", displayName: "My LLM", supportsEffort: false,
  defaults: { text: "small-model", code: "big-model" },
  async healthCheck({ bin }) { return { ok: true, detail: "reachable" }; },
  async listModels() { return ["small-model", "big-model"]; },          // optional
  // o: { prompt, system, schema, kind: "text"|"tech"|"code"|"habits", text, cwd, model, effort, maxTurns, sid, bin }
  // ctx: { spawn(args, {bin, env, home}) -> exitCode, stdout(), logDir, leanHome, log(msg) }  (spawn = for CLI providers)
  async run(o, ctx) { return { result: { /* JSON matching o.schema */ }, text: "", usage: { input: 0, output: 0 }, exitCode: 0 }; },
};
```

- **Adapter tuỳ chỉnh.** Lưu file thành `~/.config/agents-holding/providers/my-llm.mjs`. Có thể export object trên, hoặc factory `(name, def) => provider`, với `def` là mục `agents.json` của provider đó. Rồi chạy `holding staff set <staff> my-llm <model>`.
- **Tham chiếu tích hợp.** `scripts/providers/{grok,claude,codex}.mjs` cho thấy adapter CLI dùng `ctx.spawn` thế nào.
- **Quy tắc cho mọi adapter:**
  - không truy cập MCP hay server (runner tự nói với server)
  - một phiên mới mỗi lần gọi
  - trả JSON khớp `o.schema`
  - báo token usage khi có thể

## Ngôn ngữ

Output theo ngôn ngữ đầu vào. `holding company set lang <code|auto>` ghi đè theo công ty. Xem WHO-DECIDES.

## Công ty nào

Binding theo từng công ty. Công ty = `--company X` > `.agents/company.json` gần nhất từ thư mục hiện tại > công ty active (`holding company use <company>`). `holding company list` liệt kê; `holding company show` in ra công ty shell này resolve được.

## Một /ceo, hai chế độ

`/ceo` tự định tuyến. Nếu resolve được một công ty (`--company`, `@slug`, tên công ty trong prompt, `.agents/company.json` của repo, hoặc công ty active), chạy chế độ company và trả lời bắt đầu bằng `[ceo @ <slug>]`. Nếu không, hoặc yêu cầu xuyên công ty, chạy chế độ holding và trả lời bắt đầu bằng `[holding]`. `/ceo` là alias.

## Lệnh khởi chạy nhân sự (cách đơn giản)

Gán cho nhân sự một lệnh cố định. Khi nhân sự nhận việc, agents-holding chạy đúng lệnh đó trong repo công ty (đường dẫn trong projects.json).

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

Các trường (tuỳ chọn hết trừ `command`). Bước binding trong `holding staff add` / `holding project add` hỏi cùng các trường dưới **Custom**. **Default** là cái đã nhớ trong `agent-defaults.json`. Lần đầu, ví dụ có comment của mọi trường được ghi vào `~/.config/agents-holding/staff.example.jsonc`.

| trường | ví dụ | dùng bởi |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | đúng lệnh được chạy |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | trống = repo công ty | `{cwd}` and the process cwd |
| context | `auto` \| `none` \| `/path/ctx.md` | ngữ cảnh nhân sự (xem dưới) |
| timeout | `900` (seconds) | hủy sau |
| env | `{"K":"V"}` / `--env K=V` | env thêm (key server không bao giờ được truyền) |

Placeholder:
- `{prompt}`: nội dung task, một mục argv. Không chạy shell nên dấu ngoặc, `$` và backtick giữ nguyên. Trên 200 KB bị từ chối; dùng `{prompt_file}`.
- `{prompt_file}`: file tạm 0600 chứa task.
- `{model}`, `{effort}`, `{max_turns}`: lấy từ các trường trên. Nếu trường trống, nó bị bỏ cùng cờ phía trước (ví dụ `--model {model}` biến mất).
- `{cwd}`: thư mục làm việc.
- `{context}`, `{context_file}`: ngữ cảnh nhân sự, dạng chữ hoặc file tạm.

### Task so với ngữ cảnh nhân sự

`{prompt}` chỉ mang **task**. Ngữ cảnh nhân sự được dựng mỗi lần chạy thành file riêng và không nhồi vào prompt. Nó gồm persona, 2–3 tóm tắt skill liên quan, thói quen đã học, quy ước công ty và ngôn ngữ output, cùng hướng dẫn stage. Được giao qua kênh riêng của từng CLI (đối chiếu `--help` của grok 1.0.70, claude 2.1.177 và codex 0.133):

- claude: `--append-system-prompt-file <ctx>` (built-in adapter: `--append-system-prompt`)
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- any other command: `{context}` / `{context_file}` if present, else env `AH_CONTEXT_FILE`

File trong repo (AGENTS.md v.v.) không bao giờ bị ghi.

Cách parse output chọn theo từ đầu:
- `claude`: JSON result and usage
- `codex`: JSONL events and usage
- `grok`: JSON
- còn lại: plain text (JSON `{...}` ở cuối được dùng nếu có)

`holding provider list` in template hiệu lực đầy đủ của mỗi built-in, rồi lệnh mặc định công ty và lệnh theo nhân sự. `/staff list` hiện `<staff> - $ <command…>`.

## Preset sub-agent (chạy nền)

Preset tạo một sub agent để nhân sự gọi chạy nền (headless) khi làm task — **không** mở cửa sổ chat. Với LLM local, cài xong rồi mở chat với nó là sai cách; hãy thêm nó làm sub-agent runner.

`holding staff presets` liệt kê mọi preset kèm kiểm tra đã cài (binary trên PATH, hoặc server local trả lời `/models`):

| id | runner | lời gọi headless |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}` (prompt on stdin) |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | any compatible endpoint | set `baseURL` in `~/.config/agents-holding/agents.json` |

### Sai vs đúng

**Sai**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → một cửa sổ chat mở ra.
3. Dán task vào chat, copy kết quả ra. Nhân sự không dùng được nó.

**Đúng**
1. `ollama pull qwen2.5-coder` (hoặc bật server LM Studio / llama.cpp / vLLM).
2. `holding staff presets` → thấy `✅ ollama`.
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → chạy nền, không mở chat.
5. `/ceo KAN-12` → khi tới bước của backend-engineer, nhân sự tự gọi runner đó.

## Tiết kiệm token sẵn có khi gọi nhân sự

Bật mặc định cho mọi lần gọi nhân sự (sub-agent); `AH_SUBAGENT_OPT=0` tắt.
- **Brief gọn:** nội dung file dán vào được thay bằng đường dẫn file (nhân sự tự mở cái cần); lịch sử chat không bao giờ gửi.
- **Cùng phiên cho follow-up:** follow-up ("continue…", "also…", hoặc `--continue`) tới cùng nhân sự, công ty và repo trong 30 phút tiếp tục phiên của nhân sự đó thay vì mở mới (CLI grok; CLI khác mở mới). `--new` bắt buộc phiên mới.
- **Trả lời ngắn:** mọi nhân sự trả lời theo một mẫu cố định: status, summary (≤ 3 câu), changes (≤ 8 mục), next. Không log.
- **Tiền tố thân thiện cache:** system prompt và ngữ cảnh nhân sự (persona + skills, thứ tự cố định, không ngày hay id) luôn đứng đầu và giống nhau giữa các lần chạy; task đứng cuối để CLI dùng prompt cache.
- **Gom batch:** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` gửi các task nhỏ cùng nhân sự trong một lần gọi (tối đa 6) và in một kết quả ngắn mỗi task.
Chọn model và ngân sách token mỗi task vẫn do bạn (`holding staff set`).
