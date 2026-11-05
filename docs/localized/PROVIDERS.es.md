# Proveedores de agentes: qué IA ejecuta cada staff

[English](../PROVIDERS.md)

El lean runner y `/ceo` hablan con **providers** a través de una interface pequeña (el protocol `AgentProvider`). No están atados a una CLI concreta.

| Kind | Qué es | De dónde sale |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex`: las coding CLI nativas | `scripts/providers/*.mjs` |
| `openai-compatible` | Cualquier endpoint `/v1/chat/completions`, como DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio o vLLM | config only |
| Custom | Tu propio module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` lista cada provider con un health check: version del binary, endpoint alcanzable y si está el key en el Keychain.

## Staff mapping por company

El ejemplo del usuario envía cada staff a un provider distinto:
- BA → un LLM local
- el coding del developer → un model Claude barato
- PO (plan) → un model Codex caro

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` pone el runtime justo después del nombre de cada staff. La descripción va en la línea siguiente.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**El CEO es siempre tu chat session actual** (da igual el agent y model con el que chatees). No tiene binding y `holding staff set ceo …` se rechaza. Cuando `/ceo` delega, ejecuta `holding staff run <staff> "<task>"` (default AI agent CLI: `/staff run <staff> <task>`), que arranca ese staff como un **process aparte con su propio binding**. El Jira Listener hace lo mismo en cada stage.

**Paso de binding.** `holding project add` (nueva company) y `holding staff add <role>` preguntan, por staff (nunca el CEO):

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter acepta Default (el binding recordado de ese role). Custom pide provider (la lista de `holding provider list`, con health) → model → effort, y pasa a ser el nuevo default recordado. En agent chat: `/staff add <role> --agent claude --model haiku --effort low` (sin flags = default recordado). `holding provider set [staff …]` vuelve a ejecutar el paso. Los binding recordados viven en `~/.config/agents-holding/agent-defaults.json`; `holding provider list` los muestra, `holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` los edita. Cada `set-staff` también se recuerda. Un staff sin binding usa el default de la company y aparece como `⚠ unbound` en `/staff list`.

El mapping se guarda **por company** en `~/.config/agents-holding/state/<company>/agent.json`:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

Los default globales y las definiciones de provider viven en `~/.config/agents-holding/agents.json`. El file de una company también puede definir sus propios `providers`.

**Resolution order** (el mismo orden en todas partes: lean runs, `holding staff run`, `/staff run`, `/staff list`):

- **Provider:**
  1. `AH_AGENT`
  2. el `staff.<role>.provider` de la company
  3. el `staff.<role>.provider` global
  4. el `agent` de la company
  5. el `default.provider` global
  6. `grok`
- **Model:**
  1. `AH_MODEL` (code) o `AH_TEXT_MODEL` (text)
  2. el model del staff mapping
  3. el model por stage del flow (`/flow edit`: stage `model`, o el flow `model`)
  4. el `model` / `text_model` de la company
  5. el default del provider
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. el effort del staff mapping
  3. el `effort` / `text_effort` de la company
  4. el `default.effort` global

  Cómo llega el effort a cada provider:
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`, solo si `supportsEffort: true`

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` sigue funcionando (legacy).

## Ejemplo de Ollama (local, gratis)

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

Luego ejecuta `holding staff set ba-lead ollama qwen2.5-coder:7b low` y comprueba con `holding provider list`. LM Studio (`http://localhost:1234/v1`) y vLLM (`http://host:8000/v1`) funcionan igual.

**Secrets: solo Keychain.** El campo `keychain` de un provider nombra un service del macOS Keychain. El key se lee al hacer la llamada (`security find-generic-password -s <service> -a $USER -w`) y nunca se escribe en un config file ni en un log. Para guardarlo:

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Los server locales como Ollama no necesitan key; omite `keychain`.

**¿Sin coding CLI nativa?** El adapter `openai-compatible` ejecuta su propio tool loop mínimo:

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stages (plan, question) | ninguno | 1 call |
| Tech plan | `read_file` y `list_dir` | hasta 4 turns |
| Coding | `read_file`, `list_dir`, `write_file` y `run_tests` | hasta `maxTurns` turns (default 15) |

`run_tests` ejecuta `testCommand`, o `npm test` si hay `package.json`. Toda path debe quedar dentro del repo: las path que salen del repo (`..`) y `.git` se rechazan. En el último turn las tools se desactivan, así que el model debe dar su JSON answer final.

## La interface `AgentProvider`

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

- **Custom adapter.** Guarda el file como `~/.config/agents-holding/providers/my-llm.mjs`. Puede exportar el object de arriba, o un factory `(name, def) => provider`, donde `def` es la entrada de ese provider en `agents.json`. Luego ejecuta `holding staff set <staff> my-llm <model>`.
- **Referencia built-in.** `scripts/providers/{grok,claude,codex}.mjs` muestran cómo los adapter de CLI usan `ctx.spawn`.
- **Reglas para todo adapter:**
  - sin acceso a MCP ni al server (el runner habla con el server él mismo)
  - una session nueva por call
  - devolver JSON que cumpla `o.schema`
  - informar token usage cuando puedas

## Idioma

El output sigue el idioma de entrada. `holding company set lang <code|auto>` lo sobrescribe por company. Ver WHO-DECIDES.

## Qué company

Los binding son por company. Company = `--company X` > el `.agents/company.json` más cercano desde la carpeta actual > company activa (`holding company use <company>`). `holding company list` las lista; `holding company show` imprime lo que resuelve este shell.

## Un /ceo, dos modos

`/ceo` enruta solo. Si se resuelve una company (`--company`, `@slug`, el nombre de company en el prompt, el `.agents/company.json` del repo, o la company activa), corre en modo company y la respuesta empieza con `[ceo @ <slug>]`. Si no, o cuando la petición abarca varias company, corre en modo holding y empieza con `[holding]`. `/ceo` es un alias.

## Command de arranque del staff (la forma simple)

Dale a un staff un command fijo. Cuando ese staff recibe trabajo, agents-holding ejecuta exactamente ese command en el repo de la company (la path en projects.json).

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

Campos (todos optional salvo `command`). El paso de binding en `holding staff add` / `holding project add` pide los mismos campos bajo **Custom**. **Default** es el recordado en `agent-defaults.json`. La primera vez se escribe un ejemplo comentado de cada campo en `~/.config/agents-holding/staff.example.jsonc`.

| field | example | usado por |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | el command exacto que se ejecuta |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | vacío = repo de la company | `{cwd}` y el cwd del process |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context (ver abajo) |
| timeout | `900` (segundos) | matar después |
| env | `{"K":"V"}` / `--env K=V` | env extra (el server key nunca se pasa) |

Placeholder:
- `{prompt}`: el texto del task, como un argv. No corre shell, así que comillas, `$` y backticks quedan literales. Más de 200 KB se rechaza; usa `{prompt_file}`.
- `{prompt_file}`: un file temporal 0600 con el task.
- `{model}`, `{effort}`, `{max_turns}`: de los campos de arriba. Si un campo está vacío, se elimina junto con el flag delante (por ejemplo, desaparece `--model {model}`).
- `{cwd}`: el directorio de trabajo.
- `{context}`, `{context_file}`: el staff context, como texto o como file temporal.

### Task frente a staff context

`{prompt}` lleva **solo el task**. El staff context se construye por ejecución como file aparte y nunca se mete en el prompt. Contiene la persona, 2–3 resúmenes de skill relevantes, learned habits, company conventions y el idioma de output, más las instrucciones del stage. Se entrega por el canal propio de cada CLI (comprobado con `--help` de grok 1.0.70, claude 2.1.177 y codex 0.133):

- claude: `--append-system-prompt-file <ctx>` (built-in adapter: `--append-system-prompt`)
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- cualquier otro command: `{context}` / `{context_file}` si están, si no env `AH_CONTEXT_FILE`

Los file del repo (AGENTS.md etc.) nunca se escriben.

El parse del output se elige por la primera palabra:
- `claude`: JSON result y usage
- `codex`: JSONL events y usage
- `grok`: JSON
- cualquier otra: plain text (se usa un `{...}` JSON final si existe)

`holding provider list` imprime el template efectivo completo de cada built-in, luego el command default de la company y los command por staff. `/staff list` muestra `<staff> - $ <command…>`.

## Sub-agent presets (headless)

Un preset crea un sub agent que el staff ejecuta headless en background por cada task — **no** abre un chat. Con un LLM local, instalarlo y chatear es la forma incorrecta; añádelo como sub-agent runner.

`holding staff presets` lista cada preset con detección de instalación (binary en PATH, o el server local respondiendo `/models`):

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}` (prompt por stdin) |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | cualquier endpoint compatible | pon `baseURL` en `~/.config/agents-holding/agents.json` |

### Incorrecto frente a correcto

**Incorrecto**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → se abre un chat.
3. Pega el task, copia la respuesta. El staff no puede usarlo.

**Correcto**
1. `ollama pull qwen2.5-coder` (o arranca el server LM Studio / llama.cpp / vLLM).
2. `holding staff presets` → ves `✅ ollama`.
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → corre headless, sin chat.
5. `/ceo KAN-12` → cuando toca a backend-engineer, el staff llama a ese runner solo.

## Ahorro de token built-in en staff runs

Activado por default en cada call de staff (sub-agent); `AH_SUBAGENT_OPT=0` lo apaga.
- **Slim brief:** el contenido pegado de files se sustituye por la file path (el staff abre lo que necesita); nunca se envía el chat history.
- **Misma session en follow-ups:** un follow-up ("continue…", "also…" o `--continue`) al mismo staff, company y repo en 30 minutos reanuda esa session del staff en lugar de abrir una nueva (grok CLI; otras CLI empiezan de cero). `--new` fuerza una session nueva.
- **Respuestas cortas:** cada staff responde con un template fijo: status, summary (≤ 3 frases), changes (≤ 8 ítems), next. Sin logs.
- **Prefix amigable con cache:** system prompt y staff context (persona + skills, orden fijo, sin fechas ni ids) van siempre primero y son idénticos entre runs; el task va al final, así aplica el prompt caching de la CLI.
- **Batching:** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` envía tasks pequeños del mismo staff en una sola call (hasta 6) e imprime un resultado corto por task.
La elección de model y los token budget por task siguen siendo tuyos (`holding staff set`).
