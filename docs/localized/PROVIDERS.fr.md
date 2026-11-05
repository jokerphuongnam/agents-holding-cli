# Providers d'agents : quelle IA exécute chaque staff

[English](../PROVIDERS.md)

Le lean runner et `/ceo` parlent aux **providers** via une petite interface (le protocol `AgentProvider`). Ils ne sont pas liés à une CLI précise.

| Kind | Qu'est-ce que c'est | Provenance |
| --- | --- | --- |
| Built-in | `grok`, `claude`, `codex` : les coding CLI natives | `scripts/providers/*.mjs` |
| `openai-compatible` | N'importe quel endpoint `/v1/chat/completions`, comme DeepSeek, Kimi/Moonshot, OpenRouter, Ollama, LM Studio ou vLLM | config only |
| Custom | Votre propre module | `~/.config/agents-holding/providers/<name>.mjs` |

`holding provider list` liste chaque provider avec un health check : version du binary, endpoint joignable, et présence du key dans le Keychain.

## Staff mapping par company

L'exemple utilisateur envoie chaque staff vers un provider différent :
- BA → un LLM local
- le coding du developer → un model Claude peu cher
- PO (plan) → un model Codex coûteux

```bash
holding staff set ba-lead            ollama  qwen2.5-coder:7b  low
holding staff set frontend-engineer  claude  haiku
holding staff set po-lead            codex   gpt-5             high
holding staff unset po-lead          # back to the defaults
holding staff list
```

`holding staff list` place le runtime juste après le nom de chaque staff. La description est sur la ligne suivante.

```
CEO — Acme
ceo - current session
  Runs the company, routes work
├─ ba-lead - qwen2.5-coder:7b - low
│    Business analysis …
└─ frontend-engineer - haiku - default
└─ qa-lead - grok-4.7-build-fast - default ⚠ unbound (company default)
```

**Le CEO est toujours votre chat session actuelle** (quel que soit l'agent / model avec lequel vous discutez). Il n'a pas de binding, et `holding staff set ceo …` est refusé. Quand `/ceo` délègue, il exécute `holding staff run <staff> "<task>"` (default AI agent CLI : `/staff run <staff> <task>`), ce qui démarre ce staff comme un **process séparé avec son propre binding**. Le Jira Listener fait de même à chaque stage.

**Étape de binding.** `holding project add` (nouvelle company) et `holding staff add <role>` demandent, pour chaque staff (jamais le CEO) :

```
ba-lead:
  1) Default  ba-lead - ollama/qwen2.5-coder:7b - low
  2) Custom
  choice [1]:
```

Entrée accepte Default (le binding mémorisé de ce role). Custom demande provider (la liste de `holding provider list`, avec health) → model → effort, et devient le nouveau default mémorisé. En agent chat : `/staff add <role> --agent claude --model haiku --effort low` (pas de flag = default mémorisé). `holding provider set [staff …]` relance l'étape. Les binding mémorisés vivent dans `~/.config/agents-holding/agent-defaults.json` ; `holding provider list` les affiche, `holding provider set --default <role> <provider> [model] [effort]` / `unset <role>` les modifie. Chaque `set-staff` est aussi mémorisé. Un staff sans binding utilise le default de la company et apparaît comme `⚠ unbound` dans `/staff list`.

Le mapping est stocké **par company** dans `~/.config/agents-holding/state/<company>/agent.json` :

```json
{ "staff": { "ba-lead": { "provider": "ollama", "model": "qwen2.5-coder:7b", "effort": "low" } }, "lang": "auto" }
```

Les default globaux et les définitions de provider vivent dans `~/.config/agents-holding/agents.json`. Le file d'une company peut aussi définir ses propres `providers`.

**Resolution order** (le même partout : lean runs, `holding staff run`, `/staff run`, `/staff list`) :

- **Provider :**
  1. `AH_AGENT`
  2. le `staff.<role>.provider` de la company
  3. le `staff.<role>.provider` global
  4. l'`agent` de la company
  5. le `default.provider` global
  6. `grok`
- **Model :**
  1. `AH_MODEL` (code) ou `AH_TEXT_MODEL` (text)
  2. le model du staff mapping
  3. le model par stage du flow (`/flow edit` : stage `model`, ou le flow `model`)
  4. le `model` / `text_model` de la company
  5. le default du provider
- **Effort** (`low|medium|high`) :
  1. `AH_EFFORT`
  2. l'effort du staff mapping
  3. l'`effort` / `text_effort` de la company
  4. le `default.effort` global

  Comment l'effort arrive à chaque provider :
  - grok : `--reasoning-effort`
  - claude : `--effort`
  - codex : `model_reasoning_effort`
  - openai-compatible : `reasoning_effort`, seulement si `supportsEffort: true`

`holding company set agent <provider> [--model M] [--effort E] [--staff ROLE]` fonctionne encore (legacy).

## Exemple Ollama (local, gratuit)

```bash
ollama pull qwen2.5-coder:7b && ollama serve   # http://localhost:11434
```

`~/.config/agents-holding/agents.json` :

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

Puis exécutez `holding staff set ba-lead ollama qwen2.5-coder:7b low` et vérifiez avec `holding provider list`. LM Studio (`http://localhost:1234/v1`) et vLLM (`http://host:8000/v1`) fonctionnent de la même façon.

**Secrets : Keychain uniquement.** Le champ `keychain` d'un provider nomme un service du macOS Keychain. Le key est lu au moment de l'appel (`security find-generic-password -s <service> -a $USER -w`) et n'est jamais écrit dans un config file ni un log. Pour le stocker :

```bash
security add-generic-password -U -s agents-holding-deepseek -a "$USER" -w   # hidden prompt
```

Les server locaux comme Ollama n'ont pas besoin de key ; omettez `keychain`.

**Pas de coding CLI native ?** L'adapter `openai-compatible` exécute sa propre tool loop minimale :

| Stage | Tools | Turns |
| --- | --- | --- |
| Text stages (plan, question) | aucun | 1 call |
| Tech plan | `read_file` et `list_dir` | jusqu'à 4 turns |
| Coding | `read_file`, `list_dir`, `write_file` et `run_tests` | jusqu'à `maxTurns` turns (default 15) |

`run_tests` exécute `testCommand`, ou `npm test` s'il y a un `package.json`. Toute path doit rester dans le repo : les path qui quittent le repo (`..`) et `.git` sont refusées. Au dernier turn, les tools sont coupés, donc le model doit fournir sa JSON answer finale.

## L'interface `AgentProvider`

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

- **Custom adapter.** Enregistrez le file sous `~/.config/agents-holding/providers/my-llm.mjs`. Il peut exporter l'object ci-dessus, ou un factory `(name, def) => provider`, où `def` est l'entrée de ce provider dans `agents.json`. Puis exécutez `holding staff set <staff> my-llm <model>`.
- **Référence built-in.** `scripts/providers/{grok,claude,codex}.mjs` montrent comment les adapter CLI utilisent `ctx.spawn`.
- **Règles pour tout adapter :**
  - pas d'accès MCP ni server (le runner parle au server lui-même)
  - une nouvelle session par call
  - renvoyer du JSON conforme à `o.schema`
  - rapporter le token usage quand c'est possible

## Langue

L'output suit la langue d'entrée. `holding company set lang <code|auto>` le remplace par company. Voir WHO-DECIDES.

## Quelle company

Les binding sont par company. Company = `--company X` > le `.agents/company.json` le plus proche depuis le dossier courant > company active (`holding company use <company>`). `holding company list` les liste ; `holding company show` affiche ce que ce shell résout.

## Un /ceo, deux modes

`/ceo` route tout seul. Si une company est résolue (`--company`, `@slug`, le nom de company dans le prompt, le `.agents/company.json` du repo, ou la company active), il tourne en mode company et la réponse commence par `[ceo @ <slug>]`. Sinon, ou quand la demande traverse plusieurs company, il tourne en mode holding et commence par `[holding]`. `/ceo` est un alias.

## Command de lancement du staff (la façon simple)

Donnez à un staff un command fixe. Quand ce staff reçoit du travail, agents-holding exécute exactement ce command dans le repo de la company (la path dans projects.json).

```sh
holding staff set developer 'claude -p --model {model} --effort {effort} --output-format json "{prompt}"' --model sonnet --effort low --timeout 900
holding staff set ba-lead   'grok --single "{prompt}" --model grok-4.7-build-fast --reasoning-effort low --max-turns 1 --output-format json --no-subagents'
holding staff set tech-lead 'codex exec --json --skip-git-repo-check -s read-only -m {model} "{prompt}"' --model gpt-5 --effort medium
holding staff set qa        'ollama run qwen2.5-coder'        # no {prompt}: the task goes to stdin
holding staff set default   'claude -p --output-format json "{prompt}"'   # company default for staff without a command
holding staff test developer     # dry run: argv, cwd, how prompt and context are passed, no model call
holding staff unset developer
```

Champs (tous optional sauf `command`). L'étape de binding dans `holding staff add` / `holding project add` demande les mêmes champs sous **Custom**. **Default** est la valeur mémorisée dans `agent-defaults.json`. La première fois, un exemple commenté de chaque champ est écrit dans `~/.config/agents-holding/staff.example.jsonc`.

| field | example | utilisé pour |
|---|---|---|
| command | `claude -p --model {model} "{prompt}"` | le command exact exécuté |
| model | `sonnet` | `{model}` |
| effort | `low` | `{effort}` |
| max_turns | `25` | `{max_turns}` |
| cwd | vide = repo de la company | `{cwd}` et le cwd du process |
| context | `auto` \| `none` \| `/path/ctx.md` | staff context (voir ci-dessous) |
| timeout | `900` (secondes) | tuer après |
| env | `{"K":"V"}` / `--env K=V` | env supplémentaire (le server key n'est jamais passé) |

Placeholder :
- `{prompt}` : le texte du task, en un seul argv. Pas de shell, donc guillemets, `$` et backticks restent littéraux. Plus de 200 KB est refusé ; utilisez `{prompt_file}`.
- `{prompt_file}` : un file temporaire 0600 contenant le task.
- `{model}`, `{effort}`, `{max_turns}` : issus des champs ci-dessus. Si un champ est vide, il est retiré avec le flag devant (ex. `--model {model}` disparaît).
- `{cwd}` : le répertoire de travail.
- `{context}`, `{context_file}` : le staff context, en texte ou en file temporaire.

### Task vs staff context

`{prompt}` ne porte **que le task**. Le staff context est construit à chaque exécution dans un file séparé et n'est jamais injecté dans le prompt. Il contient la persona, 2–3 résumés de skill pertinents, learned habits, company conventions et la langue d'output, plus les consignes du stage. Il est transmis via le canal propre à chaque CLI (vérifié avec `--help` de grok 1.0.70, claude 2.1.177 et codex 0.133) :

- claude : `--append-system-prompt-file <ctx>` (built-in adapter : `--append-system-prompt`)
- codex : `-c developer_instructions="<ctx>"`
- grok : `--rules <ctx>`
- openai-compatible / Ollama HTTP : system message
- tout autre command : `{context}` / `{context_file}` s'ils sont présents, sinon env `AH_CONTEXT_FILE`

Les file du repo (AGENTS.md etc.) ne sont jamais écrits.

Le parse de l'output se choisit d'après le premier mot :
- `claude` : JSON result et usage
- `codex` : JSONL events et usage
- `grok` : JSON
- tout autre : plain text (un `{...}` JSON en fin est utilisé s'il existe)

`holding provider list` affiche le template effectif complet de chaque built-in, puis le command default de la company et les command par staff. `/staff list` affiche `<staff> - $ <command…>`.

## Sub-agent presets (headless)

Un preset crée un sub agent que le staff exécute headless en arrière-plan pour chaque task — il **n'ouvre pas** de chat. Pour un LLM local, l'installer puis chatter est la mauvaise façon ; ajoutez-le comme sub-agent runner.

`holding staff presets` liste chaque preset avec détection d'installation (binary sur le PATH, ou le server local qui répond à `/models`) :

| id | runner | headless call |
|---|---|---|
| claude | Claude Code | `claude -p --output-format json … "{prompt}"` |
| codex | Codex | `codex exec --json --ephemeral … "{prompt}"` |
| ollama | Ollama CLI | `ollama run {model}` (prompt sur stdin) |
| ollama-api | Ollama server | OpenAI-compatible `http://localhost:11434/v1` |
| lmstudio | LM Studio server | `http://localhost:1234/v1` |
| llamacpp | llama.cpp `llama-server` | `http://localhost:8080/v1` |
| vllm | vLLM server | `http://localhost:8000/v1` |
| openai-compatible | tout endpoint compatible | définissez `baseURL` dans `~/.config/agents-holding/agents.json` |

### Mauvaise vs bonne façon

**Mauvaise**
1. `ollama pull qwen2.5-coder`
2. `ollama run qwen2.5-coder` → un chat s'ouvre.
3. Collez le task, copiez la réponse. Le staff ne peut pas l'utiliser.

**Bonne**
1. `ollama pull qwen2.5-coder` (ou démarrez le server LM Studio / llama.cpp / vLLM).
2. `holding staff presets` → vous voyez `✅ ollama`.
3. `holding staff add backend-engineer --preset ollama --model qwen2.5-coder`
4. `holding staff test backend-engineer` → exécution headless, pas de chat.
5. `/ceo KAN-12` → quand c'est le tour de backend-engineer, le staff appelle ce runner tout seul.

## Économie de token built-in pour les staff runs

Activée par default sur chaque call de staff (sub-agent) ; `AH_SUBAGENT_OPT=0` la coupe.
- **Slim brief :** le contenu collé des files est remplacé par la file path (le staff ouvre ce dont il a besoin) ; le chat history n'est jamais envoyé.
- **Même session pour les follow-up :** un follow-up (« continue… », « also… » ou `--continue`) vers le même staff, company et repo dans les 30 minutes reprend cette session du staff au lieu d'en ouvrir une nouvelle (grok CLI ; les autres CLI recommencent). `--new` force une nouvelle session.
- **Réponses courtes :** chaque staff répond avec un template fixe : status, summary (≤ 3 phrases), changes (≤ 8 items), next. Pas de logs.
- **Prefix amicable au cache :** system prompt et staff context (persona + skills, ordre fixe, sans dates ni ids) viennent toujours en premier et sont identiques d'un run à l'autre ; le task est à la fin, pour que le prompt caching de la CLI s'applique.
- **Batching :** `holding staff run <staff> "task 1 ;; task 2 ;; task 3" --batch` envoie de petits task du même staff en un seul call (jusqu'à 6) et imprime un résultat court par task.
Le choix de model et les token budget par task restent les vôtres (`holding staff set`).
