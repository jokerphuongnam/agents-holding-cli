# Agent-Provider: welche KI führt welches staff aus

[English](../PROVIDERS.md)

Der lean runner und `/ceo` sprechen mit **providers** über eine kleine interface (das `AgentProvider` protocol). Sie sind an keine bestimmte CLI gebunden.

| Kind | Was das ist | Herkunft |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex`: die nativen coding CLI | `scripts/providers/*.mjs` |
| `openai-compatible` | Beliebiger `/v1/chat/completions` endpoint, z. B. DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio oder vLLM | config only |
| Custom | Ihr eigenes module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` listet jeden provider mit einem health check: binary version, erreichbarer endpoint und ob der key im Keychain liegt.

## Staff mapping pro company

Das Nutzerbeispiel schickt jedes staff an einen anderen provider:
- BA → ein lokales LLM
- coding des developers → ein günstiges Claude model
- PO (plan) → ein teures Codex model

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` setzt die runtime direkt hinter den Namen jedes staff. Die Beschreibung steht in der nächsten Zeile.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**Der CEO ist immer Ihre aktuelle chat session** (egal, mit welchem agent / model Sie chatten). Er hat kein binding, und `holding staff set ceo …` wird abgelehnt. Wenn `/ceo` delegiert, führt es `holding staff run <staff> "<task>"` aus (default AI agent CLI: `/staff run <staff> <task>`) und startet dieses staff als **eigenen process mit eigenem binding**. Der Jira Listener macht das bei jedem stage genauso.

**Binding-Schritt.** `holding project add` (neue company) und `holding staff add <role>` fragen pro staff (nie den CEO):

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Enter nimmt Default (das gemerkte binding dieser role). Custom fragt provider (die Liste von `holding provider list`, mit health) → model → effort und wird das neue gemerkte default. Im agent chat: `/staff add <role> --agent claude --model haiku --effort low` (keine flags = gemerktes default). `holding provider set [staff …]` führt den Schritt erneut aus. Gemerkte binding liegen in `~/.config/agents-holding/agent-defaults.json`; `holding provider list` zeigt sie, `holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` bearbeitet sie. Jedes `set-staff` wird ebenfalls gemerkt. Ein staff ohne binding nutzt das company default und erscheint in `/staff list` als `⚠ unbound`.

Das mapping wird **pro company** in `~/.config/agents-holding/state/<company>/agent.json` gespeichert:

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

Globale default und provider-Definitionen liegen in `~/.config/agents-holding/agents.json`. Die company-Datei kann auch eigene `providers` definieren.

**Resolution order** (überall gleich: lean runs, `holding staff run`, `/staff run`, `/staff list`):

- **Provider:**
  1. `AH_AGENT`
  2. `staff.<role>.provider` der company
  3. globales `staff.<role>.provider`
  4. `agent` der company
  5. globales `default.provider`
  6. `grok`
- **Model:**
  1. `AH_MODEL` (code) oder `AH_TEXT_MODEL` (text)
  2. model aus dem staff mapping
  3. stage-model des flow (`/flow edit`: stage `model`, oder flow `model`)
  4. `model` / `text_model` der company
  5. provider default
- **Effort** (`low|medium|high`):
  1. `AH_EFFORT`
  2. effort aus dem staff mapping
  3. `effort` / `text_effort` der company
  4. globales `default.effort`

  Wie effort bei jedem provider ankommt:
  - grok: `--reasoning-effort`
  - claude: `--effort`
  - codex: `model_reasoning_effort`
  - openai-compatible: `reasoning_effort`, nur wenn `supportsEffort: true`

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` funktioniert weiterhin (legacy).

## Ollama-Beispiel (local, kostenlos)

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

Dann `holding staff set ba-lead ollama qwen2.5-coder:7b low` ausführen und mit `holding provider list` prüfen. LM Studio (`http://localhost:1234/v1`) und vLLM (`http://host:8000/v1`) funktionieren genauso.

**Secrets: nur Keychain.** Das Feld `keychain` eines providers benennt einen macOS-Keychain-Service. Der key wird beim Aufruf gelesen (`security find-generic-password -s <service> -a $USER -w`) und nie in eine config file oder ein log geschrieben. Zum Speichern:

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Lokale server wie Ollama brauchen keinen key; `keychain` weglassen.

**Keine native coding CLI?** Der `openai-compatible` adapter führt eine eigene minimale tool loop aus:

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stages (plan, question) | keine | 1 call |
| Tech plan | `read_file` und `list_dir` | bis zu 4 turns |
| Coding | `read_file`, `list_dir`, `write_file` und `run_tests` | bis zu `maxTurns` turns (default 15) |

`run_tests` führt `testCommand` aus, oder `npm test` wenn es ein `package.json` gibt. Jeder path muss im repo bleiben: paths die das repo verlassen (`..`) und `.git` werden abgelehnt. Im letzten turn werden tools abgeschaltet, daher muss das model seine finale JSON answer liefern.

## Die `AgentProvider` interface

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

- **Custom adapter.** Datei speichern als `~/.config/agents-holding/providers/my-llm.mjs`. Sie kann das object oben exportieren oder ein factory `(name, def) => provider`, wobei `def` der Eintrag dieses providers in `agents.json` ist. Dann `holding staff set <staff> my-llm <model>` ausführen.
- **Built-in-Referenz.** `scripts/providers/{grok,claude,codex}.mjs` zeigen, wie CLI-adapter `ctx.spawn` nutzen.
- **Regeln für jeden adapter:**
  - kein MCP- oder server-Zugriff (der runner spricht selbst mit dem server)
  - eine neue session pro call
  - JSON zurückgeben, das `o.schema` erfüllt
  - token usage melden, wenn möglich

## Sprache

Output folgt der Eingabesprache. `holding company set lang <code|auto>` überschreibt das pro company. Siehe WHO-DECIDES.

## Welche company

Binding sind pro company. Company = `--company X` > nächstes `.agents/company.json` vom aktuellen Ordner aus > active company (`holding company use <company>`). `holding company list` listet sie; `holding company show` zeigt, was diese shell auflöst.

## Ein /ceo, zwei Modi

`/ceo` routet selbst. Wenn eine company aufgelöst wird (`--company`, `@slug`, company-Name im prompt, `.agents/company.json` des repo oder die active company), läuft es im company-Modus und die Antwort beginnt mit `[ceo @ <slug>]`. Sonst, oder wenn die Anfrage mehrere company betrifft, läuft es im holding-Modus und beginnt mit `[holding]`. `/ceo` ist ein alias.

## Staff-Start-command (der einfache Weg)

Geben Sie einem staff einen festen command. Wenn dieses staff Arbeit bekommt, führt agents-holding genau diesen command im company-repo aus (der path in projects.json).

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

Felder (alle optional außer `command`). Der Binding-Schritt in `holding staff add` / `holding project add` fragt unter **Custom** dieselben Felder. **Default** ist der in `agent-defaults.json` gemerkte Wert. Beim ersten Mal wird ein kommentiertes Beispiel jedes Feldes nach `~/.config/agents-holding/staff.example.jsonc` geschrieben.

| field | example | verwendet für |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | der exakte ausgeführte command |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | leer = company repo | `{cwd}` und cwd des process |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context (siehe unten) |
| timeout | `900` (Sekunden) | danach kill |
| env | `{"K":"V"}` / `--env K=V` | zusätzliches env (server key wird nie übergeben) |

Placeholder:
- `{prompt}`: der task-Text als einzelner argv. Kein shell, daher bleiben Anführungszeichen, `$` und backticks wörtlich. Über 200 KB wird abgelehnt; `{prompt_file}` nutzen.
- `{prompt_file}`: eine 0600-Tempdatei mit dem task.
- `{model}`, `{effort}`, `{max_turns}`: aus den Feldern oben. Ist ein Feld leer, entfällt es zusammen mit dem Flag davor (z. B. verschwindet `--model {model}`).
- `{cwd}`: das Arbeitsverzeichnis.
- `{context}`, `{context_file}`: der staff context als Text oder Tempdatei.

### Task vs staff context

`{prompt}` trägt **nur den task**. Der staff context wird pro Lauf als eigene Datei gebaut und nie in den prompt gesteckt. Er enthält persona, 2–3 relevante skill-Zusammenfassungen, learned habits, company conventions und die output-Sprache sowie stage-Anweisungen. Er wird über den eigenen Kanal jeder CLI geliefert (geprüft gegen `--help` von grok 1.0.70, claude 2.1.177 und codex 0.133):

- claude: `--append-system-prompt-file <ctx>` (built-in adapter: `--append-system-prompt`)
- codex: `-c developer_instructions="<ctx>"`
- grok: `--rules <ctx>`
- openai-compatible / Ollama HTTP: system message
- jeder andere command: `{context}` / `{context_file}`, falls vorhanden, sonst env `AH_CONTEXT_FILE`

Repo-Dateien (AGENTS.md usw.) werden nie geschrieben.

Output-Parse nach dem ersten Wort:
- `claude`: JSON result und usage
- `codex`: JSONL events und usage
- `grok`: JSON
- alles andere: plain text (ein abschließendes `{...}` JSON wird genutzt, falls vorhanden)

`holding provider list` druckt das vollständige effektive template jedes built-in, dann den company-default-command und die commands pro staff. `/staff list` zeigt `<staff> - $ <command…>`.

## Sub-agent presets (headless)

Ein preset erzeugt ein sub agent, das das staff für jedes task headless im Hintergrund ausführt — es öffnet **keinen** chat. Bei einem lokalen LLM ist Installieren und Chatten der falsche Weg; fügen Sie es als sub-agent runner hinzu.

`holding staff presets` listet jedes preset mit Installationserkennung (binary auf dem PATH, oder lokaler server antwortet auf `/models`):

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}` (prompt über stdin) |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | beliebiger kompatibler endpoint | `baseURL` in `~/.config/agents-holding/agents.json` setzen |

### Falsch vs richtig

**Falsch**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → ein chat öffnet sich.
3. Task einfügen, Antwort kopieren. Das staff kann es nicht nutzen.

**Richtig**
1. `ollama pull qwen2.5-coder` (oder LM Studio / llama.cpp / vLLM server starten).
2. `holding staff presets` → Sie sehen `✅ ollama`.
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → läuft headless, kein chat.
5. `/ceo KAN-12` → wenn backend-engineer an der Reihe ist, ruft das staff diesen runner selbst auf.

## Built-in Token-Einsparung bei staff runs

Standardmäßig bei jedem staff-(sub-agent)-call aktiv; `AH_SUBAGENT_OPT=0` schaltet ab.
- **Slim brief:** eingefügter Dateiinhalt wird durch die file path ersetzt (das staff öffnet selbst, was es braucht); chat history wird nie gesendet.
- **Follow-ups dieselbe session:** ein Follow-up („continue…“, „also…“ oder `--continue`) an dasselbe staff, company und repo innerhalb von 30 Minuten setzt diese staff-session fort statt eine neue zu öffnen (grok CLI; andere CLI starten neu). `--new` erzwingt eine neue session.
- **Kurze Antworten:** jedes staff antwortet mit festem template: status, summary (≤ 3 Sätze), changes (≤ 8 Punkte), next. Keine logs.
- **Cache-freundliches prefix:** system prompt und staff context (persona + skills, feste Reihenfolge, keine Daten oder ids) stehen immer zuerst und sind zwischen runs identisch; der task kommt zuletzt, damit das prompt caching der CLI greift.
- **Batching:** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` sendet kleine tasks desselben staff in einem call (bis zu 6) und druckt ein kurzes Ergebnis pro task.
Model-Wahl und token budget pro task bleiben Ihre Sache (`holding staff set`).
