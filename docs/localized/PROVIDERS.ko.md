# 에이전트 프로바이더: 어떤 AI가 각 스태프를 실행하나

[English](../PROVIDERS.md)

The lean runner and `/ceo` talk to **providers** through one small interface (the `AgentProvider` protocol). They are not tied to a particular CLI.

| Kind | What it is | Where it comes from |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex`: the native coding CLIs | `scripts/providers/*.mjs` |
| `openai-compatible` | Any `/v1/chat/completions` endpoint, such as DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio or vLLM | config only |
| Custom | Your own module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` lists every provider with a health check: binary version, reachable endpoint, and whether the Keychain key is present.

## 회사별 스태프 매핑

The user's example sends each staff to a different provider:
- BA → a local LLM
- the developer's coding → a cheap Claude model
- PO (plan) → an expensive Codex model

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` puts the runtime right after each staff's name. The description is on the next line.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**The CEO is always your current chat session** (whatever agent and model you are chatting in). It has no binding and `holding staff set ceo …` is refused. When `/ceo` delegates, it runs `holding staff run <staff> "<task>"` (default AI agent CLI: `/staff run <staff> <task>`), which starts that staff as a **separate process on its own binding**. The Jira listener does the same for every stage.

**Binding step.** `holding project add` (new company) and `holding staff add <role>` ask, per staff (never the CEO):

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter accepts Default (your remembered binding for that role). Custom asks provider (the list from `holding provider list`, with health) → model → effort, and becomes the new remembered default. In agent chat: `/staff add <role> --agent claude --model haiku --effort low` (no flags = remembered default). `holding provider set [staff …]` reruns the step. Remembered bindings live in `~/.config/agents-holding/agent-defaults.json`; `holding provider list` shows them, `holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` edits them. Every `set-staff` is remembered too. A staff without a binding uses the company default and is flagged `⚠ unbound` in `/staff list`.

The mapping is stored **per company** in `~/.config/agents-holding/state/<company>/agent.json`:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

Global defaults and provider definitions live in `~/.config/agents-holding/agents.json`. A company file can also define its own `providers`.

**Resolution order** (the same order is used everywhere: lean runs, `holding staff run`, `/staff run`, `/staff list`):

- **Provider:**
  1. `AH_AGENT`
  2. the company's `staff.<role>.provider`
  3. the global `staff.<role>.provider`
  4. the company `agent`
  5. the global `default.provider`
  6. `grok`
- **Model:**
  1. `AH_MODEL` (code) or `AH_TEXT_MODEL` (text)
  2. the staff mapping's model
  3. the flow's per-stage model (`/flow edit`: stage `model`, or the flow `model`)
  4. the company `model` / `text_model`
  5. the provider default
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. the staff mapping's effort
  3. the company `effort` / `text_effort`
  4. the global `default.effort`

  How effort reaches each provider:
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`, only when `supportsEffort: true`

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` still works (legacy).

## Ollama(로컬, 무료) 예제

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

Then run `holding staff set ba-lead ollama qwen2.5-coder:7b low` and check with `holding provider list`. LM Studio (`http://localhost:1234/v1`) and vLLM (`http://host:8000/v1`) work the same way.

**Secrets: Keychain only.** A provider's `keychain` field names a macOS Keychain service. The key is read when the call is made (`security find-generic-password -s <service> -a $USER -w`), and it is never written to a config file or a log. To store it:

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Local servers such as Ollama need no key; omit `keychain`.

**No native coding CLI?** The `openai-compatible` adapter runs its own minimal tool loop:

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stages (plan, question) | none | 1 call |
| Tech plan | `read_file` and `list_dir` | up to 4 turns |
| Coding | `read_file`, `list_dir`, `write_file` and `run_tests` | up to `maxTurns` turns (default 15) |

`run_tests` runs `testCommand`, or `npm test` when there is a `package.json`. Every path must stay inside the repo: paths that leave the repo (`..`) and `.git` are refused. On the last turn tools are disabled, so the model has to give its final JSON answer.

## `AgentProvider` 인터페이스

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

- **Custom adapter.** Save the file as `~/.config/agents-holding/providers/my-llm.mjs`. It can export the object above, or a factory `(name, def) => provider`, where `def` is that provider's `agents.json` entry. Then run `holding staff set <staff> my-llm <model>`.
- **Built-in reference.** `scripts/providers/{grok,claude,codex}.mjs` show how CLI adapters use `ctx.spawn`.
- **Rules for every adapter:**
  - no MCP or server access (the runner talks to the server itself)
  - one fresh session per call
  - return JSON that matches `o.schema`
  - report token usage when you can

## 언어

Output follows the input language. `holding company set lang <code|auto>` overrides it per company. See WHO-DECIDES.

## 어느 회사인가

Bindings are per company. Company = `--company X` > nearest `.agents/company.json` from the current folder > active company (`holding company use <company>`). `holding company list` lists them; `holding company show` prints what this shell resolves to.

## 하나의 /ceo, 두 모드

`/ceo` routes on its own. If one company resolves (`--company`, `@slug`, the company named in the prompt, the repo `.agents/company.json`, or the active company), it runs in company mode and the reply starts with `[ceo @ <slug>]`. Otherwise, or when the request spans companies, it runs in holding mode and the reply starts with `[holding]`. `/ceo` is an alias.

## 스태프 실행 명령(간단한 방법)

Give a staff one fixed command. When that staff gets work, agents-holding runs exactly that command in the company repo (the path in projects.json).

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

Fields (all optional except `command`). The binding step in `holding staff add` / `holding project add` asks for the same fields under **Custom**. **Default** is the remembered one in `agent-defaults.json`. A commented example of every field is written to `~/.config/agents-holding/staff.example.jsonc` the first time.

| field | example | used by |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | the exact command run |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | empty = company repo | `{cwd}` and the process cwd |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context (see below) |
| timeout | `900` (seconds) | kill after |
| env | `{"K":"V"}` / `--env K=V` | extra env (the server key is never passed) |

Placeholders:
- `{prompt}`: the task text, as one argv entry. No shell runs, so quotes, `$` and backticks stay literal. Over 200 KB it is refused; use `{prompt_file}` instead.
- `{prompt_file}`: a 0600 temp file with the task.
- `{model}`, `{effort}`, `{max_turns}`: taken from the fields above. If a field is empty, it is dropped together with the flag in front of it (for example, `--model {model}` disappears).
- `{cwd}`: the working directory.
- `{context}`, `{context_file}`: the staff context, as text or as a temp file.

### 작업 vs 스태프 문맥

`{prompt}` carries **only the task**. The staff context is built per run as a separate file and never stuffed into the prompt. It holds the persona, the 2-3 relevant skill summaries, learned habits, company conventions and the output language, plus the stage instructions. It is delivered through each CLI's own channel (checked against `--help` of grok 1.0.70, claude 2.1.177 and codex 0.133):

- claude: `--append-system-prompt-file <ctx>` (built-in adapter: `--append-system-prompt`)
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- any other command: `{context}` / `{context_file}` if present, else env `AH_CONTEXT_FILE`

Repo files (AGENTS.md etc.) are never written.

Output parsing is picked from the first word:
- `claude`: JSON result and usage
- `codex`: JSONL events and usage
- `grok`: JSON
- anything else: plain text (a trailing `{...}` JSON is used if present)

`holding provider list` prints each built-in's full effective template, then the company's default command and per-staff commands. `/staff list` shows `<staff> - $ <command…>`.

## 서브 에이전트 프리셋(헤드리스)

프리셋은 스태프가 각 작업마다 백그라운드에서 헤드리스로 돌리는 서브 에이전트를 만듭니다 — 채팅을 **열지 않습니다**. 로컬 LLM을 설치하고 채팅하는 것은 잘못된 방법입니다. 서브 에이전트 러너로 추가하세요.

`holding staff presets` lists every preset with a detect-installed check (binary on PATH, or the local server answering `/models`):

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}` (prompt on stdin) |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | any compatible endpoint | set `baseURL` in `~/.config/agents-holding/agents.json` |

### 잘못된 방법 vs 올바른 방법

**잘못된 방법**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → 채팅이 열림.
3. 작업을 붙여넣고 답을 복사. 스태프가 쓸 수 없음.

**올바른 방법**
1. `ollama pull qwen2.5-coder`(또는 LM Studio / llama.cpp / vLLM 서버 시작).
2. `holding staff presets` → `✅ ollama` 확인.
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → 헤드리스 실행, 채팅 없음.
5. `/ceo KAN-12` → backend-engineer 차례에 스태프가 그 러너를 스스로 호출.

## 스태프 실행을 위한 내장 토큰 절약

On by default for every staff (sub-agent) call; `AH_SUBAGENT_OPT=0` turns it off.
- **Slim brief:** pasted file contents are replaced by the file path (the staff opens what it needs); chat history is never sent.
- **Same session for follow-ups:** a follow-up ("continue…", "also…", or `--continue`) to the same staff, company and repo within 30 minutes resumes that staff's session instead of starting a new one (the grok CLI; other CLIs start fresh). `--new` forces a new session.
- **Short answers:** every staff replies in one fixed template: status, summary (≤ 3 sentences), changes (≤ 8 items), next. No logs.
- **Cache-friendly prefix:** system prompt and staff context (persona + skills, in a fixed order, no dates or ids) always come first and stay identical between runs; the task comes last, so the CLI's prompt caching applies.
- **Batching:** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` sends small tasks of the same staff in one call (up to 6) and prints one short result per task.
Model choice and token budgets per task stay yours (`holding staff set`).
