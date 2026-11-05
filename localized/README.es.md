MCP alone is enough without the local CLI (AI tokens). CLI = optional zero-token. First ask per key+device; No = no-cli, never ask again on that device.

# agents-holding

[English](../README.md)

Dirige una pequeña empresa de IA dentro de tu agente de código: un CEO, staff, procesos y Jira, todo desde el chat.

## Introducción

agents-holding convierte tu agente de código con IA (Claude Code, Codex, Cursor o el CLI `grok`) en un holding de pequeñas empresas. Cada empresa tiene un CEO con quien hablar, staff con roles claros (ingeniería, QC, producto…) y un flujo de trabajo que lleva tareas reales de Jira desde la idea hasta el pull request fusionado. Añades un servidor MCP, inicias sesión y listo.

## Qué hace

- **Empresas y staff**: crea empresas, contrata o despide roles, define reglas, modelos y skills por persona.
- **CEO en el chat**: `/ceo` planifica el trabajo, divide las tareas y las asigna a quien corresponde.
- **Procesos**: los procesos y flujos de la empresa deciden quién hace qué en cada paso (persona, IA o script).
- **Jira Listener**: un proceso local que vigila tu tablero de Jira, activa al staff adecuado cuando una tarjeta cambia de columna e informa en la tarjeta.
- **Uso y créditos**: consulta tu plan, la barra de créditos y el uso por miembro del staff cuando quieras.

## Ventajas

1. **El flujo de trabajo primero.** No es otro asistente de chat: un flujo completo empresa → staff → proceso → Jira Listener, para que el trabajo avance solo de la tarjeta al plan, al desarrollo y a la revisión.
2. **Comandos sin tokens.** Los comandos de solo datos (`/holding key show`, `/holding staff list`, `/holding usage` …) los responde al instante un hook en tu equipo; el mensaje nunca llega al modelo.
3. **Una sola configuración para todos los agentes.** Los mismos comandos funcionan en Claude Code, Codex y el CLI `grok`.
4. **Tus datos se quedan en tu equipo.** Las herramientas que conectas (Jira, Git, archivos) se ejecutan en tu equipo; las keys viven en el Keychain, nunca en archivos de configuración.
5. **Precio justo.** Solo cuestan créditos las acciones que generan trabajo; los tokens del modelo nunca se cobran.

```
empresa  →  staff  →  proceso  →  Jira Listener  →  plan → desarrollo → revisión → hecho
```

## Instalación

Añade el servidor MCP, inicia sesión y listo. Elige tu agente:

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

Después abre tu agente, autentica `agents-holding` en el navegador (crea una key Free o importa la tuya) y envía cualquier mensaje a agents-holding. En el primer mensaje el agente configura los comandos locales por ti; si te lo pide, aprueba una sola vez. Guía completa: [SETUP](../full/localized/SETUP.es.md).

## Comandos habituales

| Comando | Qué hace |
|---|---|
| `/holding help` | Todos los comandos de tu key |
| `/holding key show` | Key id, plan, créditos, dispositivos |
| `/holding company create` | Crear una empresa |
| `/holding staff list` | Ver tu staff |
| `/ceo …` | Hablar con el CEO: planificar, dividir y asignar trabajo |
| `/holding usage` | Barra de créditos de este periodo |
| `/holding billing` | Plan actual y cómo mejorarlo |
| `/holding feedback "<text>"` | Enviar comentarios al propietario |
| `/holding update` | Actualizar el cliente local |

Funciona igual en Claude Code, Codex y el CLI `grok` (Codex pide una vez confiar en el hook). Lista completa: ejecuta `holding help`.

→ [COMMANDS.md](../docs/COMMANDS.md) · [SKILLS.md](../docs/SKILLS.md)

## Documentación

- [COMMANDS.md](../docs/COMMANDS.md)
- [SKILLS.md](../docs/SKILLS.md)
- [Guía de instalación](../full/localized/SETUP.es.md)
- [Precios](../docs/localized/PRICING.es.md)
- Referencia de comandos: ejecuta `holding help` (o `holding help <grupo|comando>`)
- [Empresas](../docs/COMPANIES.md) · [Quién decide qué](../docs/WHO-DECIDES.md) · [Resiliencia](../docs/RESILIENCE.md)

**Privacidad.** No recogemos tu información. Solo registramos hábitos de uso (las horas en que sueles trabajar, chat o comentarios, cómo configuras tus herramientas). Todas las herramientas que conectas y los datos de tu equipo se quedan en tu equipo.
