# Agent providers: which AI runs each staff

The lean runner and `/ceo` talk to **providers** through one small interface (the `AgentProvider` protocol). They are not tied to a particular CLI.

| Kind | What it is | Where it comes from |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex`: the native coding CLIs | `scripts/providers/*.mjs` |
| `openai-compatible` | Any `/v1/chat/completions` endpoint, such as DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio or vLLM | config only |
| Custom | Your own module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding providers` lists every provider with a health check: binary version, reachable endpoint, and whether the Keychain key is present.

## Per-company staff mapping

The user's example sends each staff to a different provider:
- BA → a local LLM
- the developer's coding → a cheap Claude model
- PO (plan) → an expensive Codex model

```bash
holding set-staff ba-lead            ollama  qwen2.5-coder:7b  low
holding set-staff frontend-engineer  claude  haiku
holding set-staff po-lead            codex   gpt-5             high
holding unset-staff po-lead          # back to the defaults
holding staffs
```

`holding staffs` puts the runtime right after each staff's name. The description is on the next line.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**The CEO is always your current chat session** (whatever agent and model you are chatting in). It has no binding and `holding set-staff ceo …` is refused. When `/ceo` delegates, it runs `holding run <staff> "<task>"` (Grok: `/run <staff> <task>`), which starts that staff as a **separate process on its own binding**. The Jira listener does the same for every stage.

**Binding step.** `holding add-project` (new company) and `holding hire <role>` ask, per staff (never the CEO):

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter accepts Default (your remembered binding for that role). Custom asks provider (the list from `holding providers`, with health) → model → effort, and becomes the new remembered default. In agent chat: `/hire <role> --agent claude --model haiku --effort low` (no flags = remembered default). `holding bind [staff …]` reruns the step. Remembered bindings live in `~/.config/agents-holding/agent-defaults.json`; `holding defaults` shows them, `holding defaults set <role> <provider> [model] [effort]` / `unset <role>` edits them. Every `set-staff` is remembered too. A staff without a binding uses the company default and is flagged `⚠ unbound` in `/staffs`.

The mapping is stored **per company** in `~/.config/agents-holding/state/<company>/agent.json`:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

Global defaults and provider definitions live in `~/.config/agents-holding/agents.json`. A company file can also define its own `providers`.

**Resolution order** (the same order is used everywhere: lean runs, `holding run`, `/run`, `/staffs`):

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

`holding agent <provider> [--model M] [--effort E] [--staff ROLE]` still works (legacy).

## Ollama (local, free) example

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

Then run `holding set-staff ba-lead ollama qwen2.5-coder:7b low` and check with `holding providers`. LM Studio (`http://localhost:1234/v1`) and vLLM (`http://host:8000/v1`) work the same way.

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

## The `AgentProvider` interface

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

- **Custom adapter.** Save the file as `~/.config/agents-holding/providers/my-llm.mjs`. It can export the object above, or a factory `(name, def) => provider`, where `def` is that provider's `agents.json` entry. Then run `holding set-staff <staff> my-llm <model>`.
- **Built-in reference.** `scripts/providers/{grok,claude,codex}.mjs` show how CLI adapters use `ctx.spawn`.
- **Rules for every adapter:**
  - no MCP or server access (the runner talks to the server itself)
  - one fresh session per call
  - return JSON that matches `o.schema`
  - report token usage when you can

## Language

Output follows the input language. `holding set-lang <code|auto>` overrides it per company. See WHO-DECIDES.

## Which company

Bindings are per company. Company = `--company X` > nearest `.agents/company.json` from the current folder > active company (`holding use <company>`). `holding companies` lists them; `holding current` prints what this shell resolves to.
