# 에이전트 provider: 어떤 AI가 각 staff를 실행하나

[English](../PROVIDERS.md)

Lean runner와 `/ceo`는 작은 interface(`AgentProvider` protocol)로 **provider**와 대화합니다. 특정 CLI에 묶이지 않습니다.

| Kind | 무엇인가 | 출처 |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex`: 네이티브 coding CLI | `scripts/providers/*.mjs` |
| `openai-compatible` | DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio, vLLM 같은 임의의 `/v1/chat/completions` endpoint | config only |
| Custom | 직접 만든 module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list`는 health check와 함께 모든 provider를 나열합니다: binary version, 도달 가능한 endpoint, Keychain에 key가 있는지.

## 회사별 staff mapping

사용자 예시는 staff마다 다른 provider로 보냅니다:
- BA → local LLM
- developer의 coding → 저렴한 Claude model
- PO (plan) → 비싼 Codex model

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list`는 각 staff 이름 바로 뒤에 runtime을 둡니다. 설명은 다음 줄입니다.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**CEO는 항상 현재 chat session입니다**(지금 대화 중인 agent/model이 무엇이든). binding이 없고 `holding staff set ceo …`는 거부됩니다. `/ceo`가 위임할 때 `holding staff run <staff> "<task>"`(default AI agent CLI: `/staff run <staff> <task>`)를 실행해 그 staff를 **자체 binding의 별도 process**로 시작합니다. Jira Listener도 모든 stage에서 같습니다.

**Binding 단계.** `holding project add`(새 company)와 `holding staff add <role>`은 staff마다(CEO 제외) 묻습니다:

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter는 Default(그 role의 기억된 binding)를 받습니다. Custom은 provider(`holding provider list` 목록과 health) → model → effort를 묻고 새 기억 Default가 됩니다. agent chat에서는: `/staff add <role> --agent claude --model haiku --effort low`(flag 없음 = 기억된 default). `holding provider set [staff …]`로 단계를 다시 실행합니다. 기억된 binding은 `~/.config/agents-holding/agent-defaults.json`에 있고, `holding provider list`로 보고, `holding provider set --default <role> <provider> [model] [effort]` / `unset <role>`로 고칩니다. 모든 `set-staff`도 기억됩니다. binding 없는 staff는 company default를 쓰고 `/staff list`에 `⚠ unbound`로 표시됩니다.

mapping은 **company별**로 `~/.config/agents-holding/state/<company>/agent.json`에 저장됩니다:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

전역 default와 provider 정의는 `~/.config/agents-holding/agents.json`에 있습니다. company file에서 자체 `providers`도 정의할 수 있습니다.

**Resolution order**(어디서나 동일: lean run, `holding staff run`, `/staff run`, `/staff list`):

- **Provider:**
  1. `AH_AGENT`
  2. company의 `staff.<role>.provider`
  3. 전역 `staff.<role>.provider`
  4. company `agent`
  5. 전역 `default.provider`
  6. `grok`
- **Model:**
  1. `AH_MODEL`(code) 또는 `AH_TEXT_MODEL`(text)
  2. staff mapping의 model
  3. flow의 stage별 model(`/flow edit`: stage `model`, 또는 flow `model`)
  4. company `model` / `text_model`
  5. provider default
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. staff mapping의 effort
  3. company `effort` / `text_effort`
  4. 전역 `default.effort`

  effort가 각 provider에 전달되는 방식:
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`(`supportsEffort: true`일 때만)

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]`도 여전히 동작합니다(legacy).

## Ollama(local, 무료) 예제

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

그다음 `holding staff set ba-lead ollama qwen2.5-coder:7b low`를 실행하고 `holding provider list`로 확인하세요. LM Studio(`http://localhost:1234/v1`)와 vLLM(`http://host:8000/v1`)도 같습니다.

**Secrets: Keychain만.** provider의 `keychain` 필드는 macOS Keychain service 이름입니다. key는 호출 때 읽히며(`security find-generic-password -s <service> -a $USER -w`), config file이나 log에는 절대 쓰지 않습니다. 저장하려면:

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Ollama 같은 local server는 key가 필요 없습니다. `keychain`을 생략하세요.

**네이티브 coding CLI가 없다면?** `openai-compatible` adapter가 자체 최소 tool loop를 돌립니다:

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stage(plan, question) | 없음 | 1 call |
| Tech plan | `read_file`과 `list_dir` | 최대 4 turns |
| Coding | `read_file`, `list_dir`, `write_file`, `run_tests` | 최대 `maxTurns` turns(default 15) |

`run_tests`는 `testCommand`를 실행하고, 없으면 `package.json`이 있을 때 `npm test`입니다. 모든 path는 repo 안이어야 합니다: repo를 나가는 path(`..`)와 `.git`은 거부됩니다. 마지막 turn에서는 tools가 꺼지므로 model이 최종 JSON answer를 내야 합니다.

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

- **Custom adapter.** 파일을 `~/.config/agents-holding/providers/my-llm.mjs`로 저장합니다. 위 object 또는 factory `(name, def) => provider`를 export할 수 있습니다(`def`는 그 provider의 `agents.json` 항목). 그다음 `holding staff set <staff> my-llm <model>`.
- **Built-in 참고.** `scripts/providers/{grok,claude,codex}.mjs`는 CLI adapter가 `ctx.spawn`을 어떻게 쓰는지 보여 줍니다.
- **모든 adapter 규칙:**
  - MCP나 server 접근 없음(runner가 스스로 server와 대화)
  - 호출마다 새 session 하나
  - `o.schema`에 맞는 JSON 반환
  - 가능하면 token usage 보고

## 언어

Output은 입력 언어를 따릅니다. `holding company set lang <code|auto>`로 company별 덮어쓰기. WHO-DECIDES 참고.

## 어느 company인가

Binding은 company별입니다. Company = `--company X` > 현재 폴더에서 가장 가까운 `.agents/company.json` > active company(`holding company use <company>`). `holding company list`가 나열하고, `holding company show`가 이 shell이 resolve한 값을 출력합니다.

## 하나의 /ceo, 두 모드

`/ceo`는 스스로 route합니다. company 하나가 resolve되면(`--company`, `@slug`, prompt의 company 이름, repo `.agents/company.json`, 또는 active company) company 모드로 답변이 `[ceo @ <slug>]`로 시작합니다. 아니면, 또는 요청이 여러 company에 걸치면 holding 모드로 `[holding]`으로 시작합니다. `/ceo`는 alias입니다.

## Staff 실행 command(간단한 방법)

staff에게 고정 command 하나를 줍니다. 그 staff가 일을 받으면 agents-holding은 company repo(projects.json의 path)에서 그 command를 그대로 실행합니다.

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

필드(`command` 제외 모두 optional). `holding staff add` / `holding project add`의 binding 단계는 **Custom**에서 같은 필드를 묻습니다. **Default**는 `agent-defaults.json`에 기억된 값입니다. 처음에는 모든 필드의 주석 예제가 `~/.config/agents-holding/staff.example.jsonc`에 쓰입니다.

| field | example | 용도 |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | 실행되는 정확한 command |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | 비움 = company repo | `{cwd}`와 process cwd |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context(아래) |
| timeout | `900`(초) | 이후 kill |
| env | `{"K":"V"}` / `--env K=V` | 추가 env(server key는 전달되지 않음) |

Placeholder:
- `{prompt}`: task 본문을 argv 하나로. shell이 안 돌아가므로 따옴표, `$`, backtick은 그대로. 200 KB 초과는 거부. 대신 `{prompt_file}`.
- `{prompt_file}`: task가 든 0600 임시 파일.
- `{model}`, `{effort}`, `{max_turns}`: 위 필드에서. 필드가 비면 앞 flag와 함께 빠집니다(예: `--model {model}` 사라짐).
- `{cwd}`: 작업 디렉터리.
- `{context}`, `{context_file}`: staff context(텍스트 또는 임시 파일).

### Task vs staff context

`{prompt}`는 **task만** 담습니다. staff context는 실행마다 별도 파일로 만들어지며 prompt에 넣지 않습니다. persona, 관련 skill 요약 2–3개, learned habits, company conventions, output 언어, stage 지시를 포함합니다. 각 CLI 고유 경로로 전달됩니다(grok 1.0.70, claude 2.1.177, codex 0.133의 `--help`로 확인):

- claude: `--append-system-prompt-file <ctx>`(built-in adapter: `--append-system-prompt`)
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- 그 외 command: `{context}` / `{context_file}`가 있으면 그것, 없으면 env `AH_CONTEXT_FILE`

Repo 파일(AGENTS.md 등)은 절대 쓰지 않습니다.

Output parse는 첫 단어로 고릅니다:
- `claude`: JSON result와 usage
- `codex`: JSONL events와 usage
- `grok`: JSON
- 그 외: plain text(끝에 `{...}` JSON이 있으면 사용)

`holding provider list`는 각 built-in의 유효 template 전체, 그다음 company default command와 staff별 command를 출력합니다. `/staff list`는 `<staff> - $ <command…>`입니다.

## Sub-agent presets(headless)

Preset은 staff가 각 task를 background에서 headless로 돌리는 sub agent를 만듭니다 — chat을 **열지 않습니다**. local LLM을 설치하고 chat하는 것은 잘못된 방법입니다. sub-agent runner로 추가하세요.

`holding staff presets`는 설치 감지와 함께 모든 preset을 나열합니다(PATH의 binary, 또는 local server가 `/models`에 응답):

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}`(prompt는 stdin) |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | 호환 endpoint | `~/.config/agents-holding/agents.json`에서 `baseURL` 설정 |

### 잘못된 방법 vs 올바른 방법

**잘못된 방법**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → chat이 열림.
3. task를 붙여넣고 답을 복사. staff가 쓸 수 없음.

**올바른 방법**
1. `ollama pull qwen2.5-coder`(또는 LM Studio / llama.cpp / vLLM server 시작).
2. `holding staff presets` → `✅ ollama` 확인.
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → headless 실행, chat 없음.
5. `/ceo KAN-12` → backend-engineer 차례에 staff가 그 runner를 스스로 호출.

## Staff run을 위한 built-in token 절약

모든 staff(sub-agent) 호출에서 default로 켜짐. `AH_SUBAGENT_OPT=0`으로 끔.
- **Slim brief:** 붙여 넣은 file 내용은 file path로 대체(staff가 필요한 것을 염). chat history는 보내지 않음.
- **Follow-up은 같은 session:** 같은 staff·company·repo로 30분 안 follow-up("continue…", "also…", 또는 `--continue`)이면 새 session 대신 그 staff session을 재개(grok CLI. 다른 CLI는 새로 시작). `--new`는 강제 새 session.
- **짧은 답:** 모든 staff가 고정 template로 답함: status, summary(≤ 3문장), changes(≤ 8항목), next. log 없음.
- **Cache 친화 prefix:** system prompt와 staff context(persona + skills, 고정 순서, 날짜·id 없음)가 항상 앞에 오고 run 간 동일. task는 마지막이라 CLI prompt caching이 적용됨.
- **Batching:** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch`는 같은 staff의 작은 task를 한 번의 call로 보내고(최대 6) task마다 짧은 결과를 출력합니다.
model 선택과 task별 token budget은 당신 몫입니다(`holding staff set`).
