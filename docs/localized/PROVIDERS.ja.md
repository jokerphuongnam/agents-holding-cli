# エージェント provider: どの AI が各 staff を動かすか

[English](../PROVIDERS.md)

Lean runner と `/ceo` は小さなインターフェース（`AgentProvider` protocol）経由で **provider** と話します。特定の CLI には縛られません。

| Kind | 何か | 出所 |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex`: ネイティブの coding CLI | `scripts/providers/*.mjs` |
| `openai-compatible` | DeepSeek、Kimi/Moonshot、OpenRouter、Ollama、LM Studio、vLLM などの任意の `/v1/chat/completions` endpoint | config only |
| Custom | 自分の module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` は health check 付きで全 provider を一覧します: binary の version、到達可能な endpoint、Keychain に key があるか。

## 会社ごとの staff mapping

ユーザーの例では staff ごとに別の provider へ送ります:
- BA → local LLM
- developer の coding → 安い Claude model
- PO (plan) → 高い Codex model

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` は各 staff の名前の直後に runtime を置きます。説明は次の行です。

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**CEO は常にいまの chat session です**（今チャットしている agent / model が何であれ）。binding はなく、`holding staff set ceo …` は拒否されます。`/ceo` が委譲するときは `holding staff run <staff> "<task>"`（default AI agent CLI: `/staff run <staff> <task>`）を実行し、その staff を **独自 binding の別 process** として起動します。Jira Listener も各 stage で同じです。

**Binding の手順。** `holding project add`（新しい company）と `holding staff add <role>` は staff ごと（CEO 以外）に尋ねます:

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter で Default（その role の記憶済み binding）を受け付けます。Custom は provider（`holding provider list` の一覧と health）→ model → effort を尋ね、新しい記憶済み default になります。agent chat では: `/staff add <role> --agent claude --model haiku --effort low`（flag なし = 記憶済み default）。`holding provider set [staff …]` で手順を再実行します。記憶済み binding は `~/.config/agents-holding/agent-defaults.json` にあり、`holding provider list` で表示、`holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` で編集します。`set-staff` もすべて記憶されます。binding のない staff は company default を使い、`/staff list` で `⚠ unbound` と出ます。

mapping は **company ごと** に `~/.config/agents-holding/state/<company>/agent.json` へ保存されます:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

グローバル default と provider 定義は `~/.config/agents-holding/agents.json` にあります。company の file で独自の `providers` も定義できます。

**Resolution order**（どこでも同じ順: lean run、`holding staff run`、`/staff run`、`/staff list`）:

- **Provider:**
  1. `AH_AGENT`
  2. company の `staff.<role>.provider`
  3. グローバル `staff.<role>.provider`
  4. company の `agent`
  5. グローバル `default.provider`
  6. `grok`
- **Model:**
  1. `AH_MODEL`（code）または `AH_TEXT_MODEL`（text）
  2. staff mapping の model
  3. flow の stage ごとの model（`/flow edit`: stage `model`、または flow `model`）
  4. company の `model` / `text_model`
  5. provider default
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. staff mapping の effort
  3. company の `effort` / `text_effort`
  4. グローバル `default.effort`

  effort が各 provider に届く方法:
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`（`supportsEffort: true` のときのみ）

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` もまだ動きます（legacy）。

## Ollama（local、無料）の例

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

その後 `holding staff set ba-lead ollama qwen2.5-coder:7b low` を実行し、`holding provider list` で確認します。LM Studio（`http://localhost:1234/v1`）と vLLM（`http://host:8000/v1`）も同じです。

**Secrets: Keychain のみ。** provider の `keychain` フィールドは macOS Keychain の service 名です。key は呼び出し時に読まれ（`security find-generic-password -s <service> -a $USER -w`）、config file や log には決して書きません。保存するには:

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Ollama のような local server に key は不要です。`keychain` を省略してください。

**ネイティブ coding CLI がない場合?** `openai-compatible` adapter が独自の最小 tool loop を回します:

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stage（plan、question） | なし | 1 call |
| Tech plan | `read_file` と `list_dir` | 最大 4 turns |
| Coding | `read_file`、`list_dir`、`write_file`、`run_tests` | 最大 `maxTurns` turns（default 15） |

`run_tests` は `testCommand` を実行し、なければ `package.json` があるとき `npm test` です。パスはすべて repo 内必須: repo を出るパス（`..`）と `.git` は拒否されます。最後の turn では tools が無効なので、model は最終 JSON answer を出す必要があります。

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

- **Custom adapter.** ファイルを `~/.config/agents-holding/providers/my-llm.mjs` として保存します。上の object、または factory `(name, def) => provider` を export できます（`def` はその provider の `agents.json` エントリ）。その後 `holding staff set <staff> my-llm <model>`。
- **Built-in の参考。** `scripts/providers/{grok,claude,codex}.mjs` は CLI adapter が `ctx.spawn` をどう使うかを示します。
- **すべての adapter のルール:**
  - MCP や server へのアクセスなし（runner が自分で server と話す）
  - 呼び出しごとに新しい session 1 つ
  - `o.schema` に合う JSON を返す
  - 可能なら token usage を報告する

## 言語

Output は入力言語に従います。`holding company set lang <code|auto>` で company ごとに上書き。WHO-DECIDES を参照。

## どの company か

Binding は company ごとです。Company = `--company X` > 現在フォルダから最も近い `.agents/company.json` > active company（`holding company use <company>`）。`holding company list` が一覧、`holding company show` がこの shell の解決結果を表示します。

## ひとつの /ceo、ふたつのモード

`/ceo` は自ら route します。1 つの company に解決できれば（`--company`、`@slug`、prompt 内の company 名、repo の `.agents/company.json`、または active company）、company モードで返信は `[ceo @ <slug>]` で始まります。そうでない、または複数 company にまたがる場合は holding モードで `[holding]` から始まります。`/ceo` は alias です。

## Staff 起動 command（簡単な方法）

staff に固定の command を 1 つ与えます。その staff が仕事を受け取ると、agents-holding は company repo（projects.json の path）でその command をそのまま実行します。

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

フィールド（`command` 以外はすべて optional）。`holding staff add` / `holding project add` の binding 手順は **Custom** で同じフィールドを尋ねます。**Default** は `agent-defaults.json` の記憶済みです。初回、全フィールドのコメント付き例が `~/.config/agents-holding/staff.example.jsonc` に書かれます。

| field | example | 用途 |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | 実行される正確な command |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | 空 = company repo | `{cwd}` と process の cwd |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context（下記） |
| timeout | `900`（秒） | この後 kill |
| env | `{"K":"V"}` / `--env K=V` | 追加 env（server key は渡されない） |

Placeholder:
- `{prompt}`: task 本文を argv 1 つとして。shell は走らないので引用符、`$`、backtick はそのまま。200 KB 超は拒否。代わりに `{prompt_file}`。
- `{prompt_file}`: task 入りの 0600 一時ファイル。
- `{model}`、`{effort}`、`{max_turns}`: 上のフィールドから。フィールドが空なら直前の flag ごと落ちます（例: `--model {model}` が消える）。
- `{cwd}`: 作業ディレクトリ。
- `{context}`、`{context_file}`: staff context（テキストまたは一時ファイル）。

### Task と staff context

`{prompt}` が運ぶのは **task だけ** です。staff context は実行ごとに別ファイルとして組み立てられ、prompt に詰め込みません。persona、関連 skill 要約 2–3、learned habits、company conventions、output 言語、stage 指示を含みます。各 CLI 独自の経路で渡します（grok 1.0.70、claude 2.1.177、codex 0.133 の `--help` で確認済み）:

- claude: `--append-system-prompt-file <ctx>`（built-in adapter: `--append-system-prompt`）
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- その他の command: `{context}` / `{context_file}` があればそれ、なければ env `AH_CONTEXT_FILE`

Repo のファイル（AGENTS.md など）は決して書きません。

Output の parse は先頭の語で選びます:
- `claude`: JSON result と usage
- `codex`: JSONL events と usage
- `grok`: JSON
- それ以外: plain text（末尾の `{...}` JSON があれば使う）

`holding provider list` は各 built-in の有効な template 全文、次いで company default command と staff ごとの command を表示します。`/staff list` は `<staff> - $ <command…>` です。

## Sub-agent presets（headless）

Preset は、staff が各 task で background の headless で動かす sub agent を作ります — chat は **開きません**。local LLM を入れて chat するのは誤りです。sub-agent runner として追加してください。

`holding staff presets` はインストール検出付きで全 preset を一覧します（PATH 上の binary、または local server が `/models` に応答）:

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}`（prompt は stdin） |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | 互換 endpoint | `~/.config/agents-holding/agents.json` で `baseURL` を設定 |

### 誤りと正しいやり方

**誤り**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → chat が開く。
3. task を貼って答えをコピー。staff は使えない。

**正しい**
1. `ollama pull qwen2.5-coder`（または LM Studio / llama.cpp / vLLM server を起動）。
2. `holding staff presets` → `✅ ollama` を確認。
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → headless 実行、chat なし。
5. `/ceo KAN-12` → backend-engineer の番で staff がその runner を自分で呼ぶ。

## Staff run 向けの built-in token 節約

すべての staff（sub-agent）呼び出しで default on。`AH_SUBAGENT_OPT=0` で off。
- **Slim brief:** 貼り付けた file 内容は file path に置換（staff が必要なものを開く）。chat history は送らない。
- **Follow-up は同一 session:** 同じ staff・company・repo への follow-up（"continue…"、"also…"、または `--continue`）を 30 分以内なら新 session ではなくその staff の session を再開（grok CLI。他 CLI は新規）。`--new` で強制的に新 session。
- **短い回答:** 全 staff が固定 template で返す: status、summary（≤ 3 文）、changes（≤ 8 項目）、next。log なし。
- **Cache 向け prefix:** system prompt と staff context（persona + skills、固定順、日付や id なし）が常に先頭で run 間も同一。task は最後なので CLI の prompt caching が効く。
- **Batching:** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` は同じ staff の小さな task を 1 回の call にまとめ（最大 6）、task ごとに短い結果を出します。
model 選択と task ごとの token budget はあなた次第です（`holding staff set`）。
