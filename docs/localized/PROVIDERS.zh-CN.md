# 代理 provider：哪个 AI 运行每位 staff

[English](../PROVIDERS.md)

Lean runner 与 `/ceo` 通过一个小 interface（`AgentProvider` protocol）与 **provider** 通信。它们不绑定特定 CLI。

| Kind | 是什么 | 来源 |
| --- | --- | --- |
| Built-in | `grok`、`claude`、`codex`：原生 coding CLI | `scripts/providers/*.mjs` |
| `openai-compatible` | 任意 `/v1/chat/completions` endpoint，例如 DeepSeek、Kimi/Moonshot、OpenRouter、Ollama、LM Studio 或 vLLM | config only |
| Custom | 你自己的 module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` 列出每个 provider 并做 health check：binary version、endpoint 是否可达、Keychain 中是否有 key。

## 按 company 的 staff mapping

用户示例把每位 staff 送到不同 provider：
- BA → local LLM
- developer 的 coding → 便宜的 Claude model
- PO (plan) → 昂贵的 Codex model

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` 把 runtime 放在每位 staff 名字后面。说明在下一行。

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**CEO 始终是你当前的 chat session**（无论你在用哪个 agent / model）。它没有 binding，`holding staff set ceo …` 会被拒绝。当 `/ceo` 委派时，它运行 `holding staff run <staff> "<task>"`（default AI agent CLI：`/staff run <staff> <task>`），将该 staff 作为 **带有自己 binding 的独立 process** 启动。Jira Listener 在每个 stage 也这样做。

**Binding 步骤。** `holding project add`（新 company）和 `holding staff add <role>` 会按每位 staff（从不为 CEO）询问：

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter 接受 Default（该 role 已记住的 binding）。Custom 询问 provider（来自 `holding provider list` 的列表及 health）→ model → effort，并成为新的记住的 default。在 agent chat 中：`/staff add <role> --agent claude --model haiku --effort low`（无 flag = 记住的 default）。`holding provider set [staff …]` 会重跑该步骤。记住的 binding 在 `~/.config/agents-holding/agent-defaults.json`；`holding provider list` 显示它们，`holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` 编辑它们。每次 `set-staff` 也会被记住。没有 binding 的 staff 使用 company default，并在 `/staff list` 标为 `⚠ unbound`。

mapping **按 company** 存在 `~/.config/agents-holding/state/<company>/agent.json`：

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

全局 default 与 provider 定义在 `~/.config/agents-holding/agents.json`。company 的 file 也可定义自己的 `providers`。

**Resolution order**（处处相同：lean run、`holding staff run`、`/staff run`、`/staff list`）：

- **Provider:**
  1. `AH_AGENT`
  2. company 的 `staff.<role>.provider`
  3. 全局 `staff.<role>.provider`
  4. company 的 `agent`
  5. 全局 `default.provider`
  6. `grok`
- **Model:**
  1. `AH_MODEL`（code）或 `AH_TEXT_MODEL`（text）
  2. staff mapping 的 model
  3. flow 的按 stage model（`/flow edit`：stage `model`，或 flow `model`）
  4. company 的 `model` / `text_model`
  5. provider default
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. staff mapping 的 effort
  3. company 的 `effort` / `text_effort`
  4. 全局 `default.effort`

  effort 如何到达各 provider：
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`（仅当 `supportsEffort: true`）

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` 仍然可用（legacy）。

## Ollama（local、免费）示例

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

然后运行 `holding staff set ba-lead ollama qwen2.5-coder:7b low`，并用 `holding provider list` 检查。LM Studio（`http://localhost:1234/v1`）与 vLLM（`http://host:8000/v1`）用法相同。

**Secrets：仅 Keychain。** provider 的 `keychain` 字段命名 macOS Keychain service。调用时读取 key（`security find-generic-password -s <service> -a $USER -w`），绝不写入 config file 或 log。要保存：

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Ollama 等 local server 不需要 key；省略 `keychain`。

**没有原生 coding CLI？** `openai-compatible` adapter 会跑自己的最小 tool loop：

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stage（plan、question） | 无 | 1 call |
| Tech plan | `read_file` 与 `list_dir` | 最多 4 turns |
| Coding | `read_file`、`list_dir`、`write_file` 与 `run_tests` | 最多 `maxTurns` turns（default 15） |

`run_tests` 运行 `testCommand`，若无则在有 `package.json` 时运行 `npm test`。所有 path 必须在 repo 内：离开 repo 的 path（`..`）和 `.git` 会被拒绝。最后一轮关闭 tools，因此 model 必须给出最终 JSON answer。

## `AgentProvider` interface

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

- **Custom adapter.** 将文件存为 `~/.config/agents-holding/providers/my-llm.mjs`。可 export 上面的 object，或 factory `(name, def) => provider`（`def` 为该 provider 的 `agents.json` 条目）。然后运行 `holding staff set <staff> my-llm <model>`。
- **Built-in 参考。** `scripts/providers/{grok,claude,codex}.mjs` 展示 CLI adapter 如何使用 `ctx.spawn`。
- **每个 adapter 的规则：**
  - 无 MCP 或 server 访问（runner 自己与 server 通信）
  - 每次调用一个新 session
  - 返回符合 `o.schema` 的 JSON
  - 尽可能报告 token usage

## 语言

Output 跟随输入语言。`holding company set lang <code|auto>` 可按 company 覆盖。见 WHO-DECIDES。

## 哪家 company

Binding 按 company。Company = `--company X` > 当前文件夹向上最近的 `.agents/company.json` > active company（`holding company use <company>`）。`holding company list` 列出它们；`holding company show` 打印本 shell resolve 到的结果。

## 一个 /ceo，两种模式

`/ceo` 自行 route。若能 resolve 到一家 company（`--company`、`@slug`、prompt 中的 company 名、repo 的 `.agents/company.json` 或 active company），则以 company 模式运行，回复以 `[ceo @ <slug>]` 开头。否则，或当请求跨 company 时，以 holding 模式运行，回复以 `[holding]` 开头。`/ceo` 是 alias。

## Staff 启动 command（简单方式）

给 staff 一条固定 command。当该 staff 接到工作时，agents-holding 在 company repo（projects.json 中的 path）中原样运行该 command。

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

字段（除 `command` 外均可选）。`holding staff add` / `holding project add` 的 binding 步骤在 **Custom** 下询问相同字段。**Default** 是 `agent-defaults.json` 中记住的值。首次会把带注释的各字段示例写入 `~/.config/agents-holding/staff.example.jsonc`。

| field | example | 用途 |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | 实际运行的 command |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | 空 = company repo | `{cwd}` 与 process 的 cwd |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context（见下） |
| timeout | `900`（秒） | 超时后 kill |
| env | `{"K":"V"}` / `--env K=V` | 额外 env（从不传递 server key） |

Placeholder：
- `{prompt}`：task 正文作为单个 argv。不跑 shell，故引号、`$` 与 backtick 保持字面。超过 200 KB 拒绝；改用 `{prompt_file}`。
- `{prompt_file}`：含 task 的 0600 临时文件。
- `{model}`、`{effort}`、`{max_turns}`：取自上述字段。字段为空时连同前面的 flag 一起去掉（例如 `--model {model}` 消失）。
- `{cwd}`：工作目录。
- `{context}`、`{context_file}`：staff context，文本或临时文件。

### Task 与 staff context

`{prompt}` **只**携带 task。staff context 每次运行单独建文件，从不塞进 prompt。它包含 persona、2–3 条相关 skill 摘要、learned habits、company conventions、output 语言，以及 stage 说明。通过各 CLI 自己的通道传递（已对照 grok 1.0.70、claude 2.1.177、codex 0.133 的 `--help`）：

- claude: `--append-system-prompt-file <ctx>`（built-in adapter：`--append-system-prompt`）
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- 其他 command：若有 `{context}` / `{context_file}` 则用，否则 env `AH_CONTEXT_FILE`

从不写 repo 文件（AGENTS.md 等）。

Output 解析按首个词选择：
- `claude`：JSON result 与 usage
- `codex`：JSONL events 与 usage
- `grok`：JSON
- 其他：plain text（若末尾有 `{...}` JSON 则使用）

`holding provider list` 打印每个 built-in 的完整有效 template，然后是 company default command 与按 staff 的 command。`/staff list` 显示 `<staff> - $ <command…>`。

## Sub-agent presets（headless）

Preset 创建一个 sub agent，供 staff 在每项 task 中于后台 headless 运行 — **不会**打开 chat。对 local LLM，装好后与它 chat 是错误做法；请将其添加为 sub-agent runner。

`holding staff presets` 列出每个 preset 并检测是否已安装（PATH 上的 binary，或 local server 响应 `/models`）：

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}`（prompt 走 stdin） |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | 任意兼容 endpoint | 在 `~/.config/agents-holding/agents.json` 中设置 `baseURL` |

### 错误与正确做法

**错误**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → 打开 chat。
3. 粘贴 task，复制答案。staff 无法使用。

**正确**
1. `ollama pull qwen2.5-coder`（或启动 LM Studio / llama.cpp / vLLM server）。
2. `holding staff presets` → 看到 `✅ ollama`。
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → headless 运行，无 chat。
5. `/ceo KAN-12` → 轮到 backend-engineer 时，staff 自行调用该 runner。

## Staff run 的 built-in token 节省

每位 staff（sub-agent）调用默认开启；`AH_SUBAGENT_OPT=0` 关闭。
- **Slim brief：** 粘贴的文件内容替换为 file path（staff 自行打开所需内容）；从不发送 chat history。
- **Follow-up 同一 session：** 对同一 staff、company 与 repo 在 30 分钟内的 follow-up（"continue…"、"also…" 或 `--continue`）恢复该 staff 的 session 而非新建（grok CLI；其他 CLI 仍新建）。`--new` 强制新 session。
- **短回答：** 每位 staff 按固定 template 回复：status、summary（≤ 3 句）、changes（≤ 8 项）、next。无 log。
- **利于 cache 的 prefix：** system prompt 与 staff context（persona + skills，固定顺序，无日期或 id）始终在前且各次 run 相同；task 在最后，以便 CLI 的 prompt caching 生效。
- **Batching：** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` 将同一 staff 的小 task 合并为一次 call（最多 6），并为每个 task 打印简短结果。
model 选择与每 task 的 token budget 仍由你决定（`holding staff set`）。
