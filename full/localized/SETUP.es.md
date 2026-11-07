# Instalar agents-holding (solo MCP)

[English](../SETUP.md)

Sin `curl | bash` para empezar y sin descargar scripts. Añade el servidor MCP a tu agente, inicia sesión con OAuth en el navegador y responde **sí una vez** cuando el agente te ofrezca instalar el cliente local.

URL del MCP:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. Añadir el servidor MCP (un comando)

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Agente CLI por defecto (comando `grok`)**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

o en `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. Iniciar sesión con OAuth (navegador)

Abre tu agente → conecta / Authenticate `agents-holding`. Se abre una página: **Create key** (Free, para este equipo) o **Import key** si ya tienes una. La key nunca se guarda en el archivo de configuración del agente; la sesión OAuth se renueva sola.

## 3. Instalar el cliente local (una aprobación, primer mensaje)

En tu **primer** mensaje a agents-holding (por ejemplo `/holding key show`), las primeras líneas de la respuesta son una solicitud de instalación. El agente se detiene y pregunta una vez:

> ¿Instalar el cliente local de agents-holding en este equipo? Añade el comando `holding`, los comandos de barra /holding nativos y un hook instantáneo (sin IA). Se puede volver a ejecutar sin riesgo; el Jira Listener no se instala ahora.

Responde **sí**. El agente llama a la herramienta `install` y ejecuta **un** comando de shell. Muestra el progreso `[bootstrap 1/5]` … `[bootstrap 5/5]`:

1. Scripts del cliente en `~/.agents-holding`
2. `holding` en tu PATH (`~/.local/bin`)
3. ID de dispositivo en el Keychain (no se muestra ningún secreto)
4. Vincula este equipo con tu sesión del agente mediante un código de un solo uso (10 minutos; tu key nunca se muestra) e instala los comandos de barra y el hook instantáneo
5. Listo; el servidor ya sabe que este equipo tiene el cliente y la solicitud de instalación deja de aparecer

Si el agente no te lo pidió, escribe: `install agents-holding` (o `/holding install`). Se puede repetir sin riesgo.

Este paso **no** instala el Jira Listener.

**Abre una nueva sesión del agente** después de instalar para que cargue los comandos nuevos.


## Optional local client (zero-token)

Without the CLI, every command still works via MCP (AI tokens). The CLI only makes replies instant with zero tokens.

First time per key+device the agent asks once to install. Yes → install and re-run the command. No → mark no-cli on the server and never ask again on this device; commands keep working via MCP. You can still run `/holding install` later.

## 4. Úsalo en el chat: instantáneo, cero tokens de IA

Tras la instalación, los comandos que solo devuelven datos los responde localmente el hook o tu shell. El mensaje nunca llega al modelo:

| Agent | Cómo se ejecuta `/holding key show` |
|---|---|
| CLI `grok` | `/holding key show`: el hook UserPromptSubmit (`~/.grok/hooks/agents-holding.json`) responde al instante |
| Claude Code | `/holding key show`: el hook UserPromptSubmit de `~/.claude/settings.json` responde al instante |
| Codex CLI | `/holding key show`: el hook UserPromptSubmit de `~/.codex/hooks.json` responde al instante (Codex pide una vez confiar en el hook nuevo); `!holding key show` también funciona |
| Cualquier terminal | `holding key show` |

Cada respuesta instantánea termina con `(agents-holding: instant, no model)`.

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

Los comandos que necesitan al agente (`/ceo`, `/task add`, `/flow edit`, `/jira setup`, `/skill add`) siguen yendo al modelo a propósito.

### Enviar comentarios

```
/holding feedback "<text>"
```

Envía tus comentarios directamente desde el chat (cero tokens de IA). Solo los lee el propietario.

## 5. Jira (solo cuando hace falta)

Cuando un comando o un agente realmente necesita Jira (leer tareas, adjuntar archivos, mover columnas, iniciar el Listener):

1. El agente te pregunta y luego ejecuta `holding jira connect` (OAuth en el navegador; token en el Keychain; el chat solo muestra el nombre de la cuenta)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (proceso local), solo cuando hace falta: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

Instalar el MCP, crear una empresa y los comandos que no son de Jira **nunca** piden iniciar sesión en Jira.

## 6. Actualizar

En el chat: `/holding update` (o pide al agente que ejecute `holding update`). Se puede repetir sin riesgo.

---

## 7. Planes y precios (créditos)

Tabla de precios: **[PRICING.md](../../docs/PRICING.md)**: créditos al mes, precios, límites de staff y dispositivos, coste de las acciones y cómo mejorar tu plan.

Para mejorar tu plan, envía tu **key id** (de `holding key show`; nunca la key) al propietario: **phuongnamp99@gmail.com**. `holding billing` y `holding key show` siempre muestran el contacto actual.

En tu equipo: `holding billing` · `holding usage`.

---

## Anexo: instalar con script (no recomendado)

Solo si el agente no puede ejecutar la instalación (entornos especiales). No es el flujo habitual.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-cli.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

Los scripts antiguos `connect.sh` / `install.sh` siguen en el repositorio por compatibilidad; la documentación nueva **no** los usa.
