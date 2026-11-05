# Referencia de comandos

[English](../COMMANDS.md)

Todos los comandos que puedes usar con tu clave. En el chat escribe `/holding <comando>` (por ejemplo `/holding key show`); en una terminal, `holding <comando>`. Responden al instante sin usar IA. `/ceo` y `/approve` son comandos del agente.

## Configuración y ayuda

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding help [group\|command]` | Todos los comandos de tu clave | `holding help staff` |
| `holding setup sync [--claude]` | Instala los comandos / en tu agente | `holding setup sync` |
| `holding doctor [--server]` | Revisa cada paso de configuración | `holding doctor` |
| `holding status` | Estado de la configuración y avisos | `holding status` |

## Clave de licencia

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding key show` | Id de clave, plan, créditos, equipos | `holding key show` |
| `holding key generate` | Crea una clave gratuita para este equipo | `holding key generate` |
| `holding key import` | Usa una clave existente (entrada oculta) | `holding key import` |

## Empresas

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | Lista, muestra o elige una empresa | `holding company use acme` |
| `holding company create [name] [--parent P]` | Crea una empresa (sin nombre = esta carpeta) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | Gestiona una empresa | `holding company pause acme` |
| `holding company migrate <folder>` | Importa una empresa local antigua | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | Ajustes de la empresa | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | Bloquea un archivo para todo el personal | `holding company deny add .env` |

## Personal

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding staff list` | Tu personal | `holding staff list` |
| `holding staff add <role> \| remove <role>` | Contrata o quita un rol | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | Reglas y permisos (una config para todos los agentes) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | Bloquea un archivo para un rol | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | Elige la IA y el modelo de un rol | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | Ejecuta o prueba un rol | `holding staff test qa` |

## Procesos y flujos

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Procesos que ejecuta el Jira Listener | `holding company process list` |
| `holding flow show \| list` | Tus flujos | `holding flow show` |
| `holding project add\|remove\|list` | Repos vinculados a proyectos de Jira | `holding project list` |
| `holding habit list\|edit\|clear` | Hábitos aprendidos | `holding habit list` |

## Tareas

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding task list [all] \| history [n]` | Tareas e historial | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | Planifica o asigna una tarea | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | Aprueba un plan (en tu agente) | `/approve KAN-12` |

## IA por rol

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding provider list \| set \| unset` | Qué IA usa cada rol | `holding provider list` |

## Habilidades

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding skill add <staff> <skill>` | Asigna una habilidad a un rol | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | Tus habilidades propias o las de un rol | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | Carpetas, validación y sincronización | `holding skill check` |
| `holding skill private\|public <name>` | Haz una habilidad privada o pública | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | Permite ejecutar sus scripts | `holding skill consent my-tool` |

## Jira y Jira Listener

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding jira connect <site> <email>` | Guarda tu token de Jira en el llavero | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Consulta Jira | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Cambia tarjetas de Jira | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | Adjunta archivos a una incidencia | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | El Jira Listener | `holding listener status` |

## Figma

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Inicia sesión en Figma (llavero) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | Exporta un marco como PNG | `holding figma export <url> --attach KAN-12` |

## Atlassian y Confluence

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | Inicia sesión en Atlassian solo si hace falta | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Crea o actualiza una página de Confluence | `holding confluence page create ENG "Release" --file notes.md` |

## Bandeja del CEO

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding inbox list [--all] [KEY]` | Preguntas y decisiones pendientes | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | Responde; el rol sigue donde paró | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | Cierra sin responder | `holding inbox dismiss KAN-12` |

## Hablar con el CEO

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `/ceo <request>` | Planifica, divide y asigna trabajo | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | Abre una sesión del CEO sobre un elemento | `holding ceo KAN-12` |

## Uso e informes

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding usage [--by day\|staff]` | Barra de créditos del periodo | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | Informes de tu uso (solo recuentos) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | Avisos de tu clave | `holding notify list` |

## Plan y créditos

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding credit show` | Tus créditos | `holding credit show` |
| `holding billing \| billing usage [days]` | Planes, tu plan y cómo mejorar | `holding billing` |

## Comentarios

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding feedback "<text>"` | Envía comentarios | `holding feedback "the inbox is great"` |

## Actualizar

| Comando | Qué hace | Ejemplo |
|---|---|---|
| `holding update` | Actualiza el cliente, los comandos y el Jira Listener | `holding update` |

Ver también: [Habilidades](../SKILLS.md). Ejecuta `holding help` para ver lo que tu clave puede usar.
