# Empresas

[English](../COMPANIES.md)

Un holding, muchas empresas. Cada empresa tiene su propio personal, tablero Jira, Jira Listener y ajustes; lo que no sobrescribe sigue los valores predeterminados del holding.

Chat: `/ceo companies` (lista) · `/ceo company <verb> ...` (mismos verbos que abajo). Terminal: `holding company <verb>`.

| Comando | Qué hace |
|---|---|
| `holding company list` / `count` / `overview` | Empresas conectadas al holding (hijas bajo su padre), estado, personal, Jira, Jira Listener. `overview` añade salud: tareas abiertas/bloqueadas, elementos que te esperan, créditos (30 días). |
| `holding company show [name]` | Producto, estado, padre/hijos, personal, Jira, Jira Listener, columnas del tablero, conteos de tareas, créditos, configuración. |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | Nueva empresa con el personal y el tablero predeterminados (incl. Reopened y Blocked). |
| `holding company rename <c> <new name>` | Solo el nombre visible; el id no cambia, así que repos y Jira siguen funcionando. |
| `holding company pause / resume / archive <c>` | Las empresas pausadas/archivadas no inician trabajo nuevo ni gastan. |
| `holding company delete <c> --confirm <c>` | Solo después de `archive`, y solo sin empresas hijas. No toca el repo, archivos locales ni el tablero Jira. |
| `holding company move <c> --parent <P|none>` | Cambiar el padre. |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | Mover o añadir un rol de personal entre empresas (aplican límites del plan). |
| `holding company link <c> <KEY>` / `unlink <c>` | Vincular o desvincular el tablero Jira. |
| `holding company config [c] [set|unset <key> <value>]` | Sobrescrituras por empresa: `communication`, `auto-pr`, `flow`, `share-skills`. `unset` = volver al predeterminado del holding. `config defaults [set ...]` edita los predeterminados del holding. |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | Traer una empresa local antigua (`.agents/*-company`) al holding. Ver abajo. |

Solo se listan las empresas conectadas al holding. Las antiguas solo locales no se muestran (ni se borran) hasta que las migres.

## Migrar una empresa local antigua

`holding company migrate <repo or .agents/x-company folder>`
1. Copia de seguridad de la carpeta en `~/.config/agents-holding/backups/<name>-<time>.tgz` (los originales permanecen en disco).
2. Envía solo nombres y conteos: ids de roles de personal, número de planes, padre, hora de creación. Sin contenido de archivos.
3. El personal cuyo rol existe en el catálogo del holding pasa a ser personal real (hasta el límite del plan, ver abajo). Los roles personalizados (fuera del catálogo) se registran solo por nombre en el historial de la empresa; holding no lee sus archivos de persona. Para reutilizar uno, conviértelo en una skill privada del repo en `.agents/custom-skills/<id>/SKILL.md`.
4. Escribe `.agents/company.json` en el repo y registra el repo. Volver a ejecutar es seguro (actualiza la misma empresa).
Migra primero el padre, luego las hijas con `--parent <parent>`.

Tras migrar, solo se lee `.agents/company.json`. La carpeta antigua `.agents/<x>-company` se puede eliminar cuando tengas una copia completa (la copia de migrate omite `cache/`): `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`.
Diseño sugerido de lo que conservas: `.agents/cache/` y `.agents/plans/` (personal, sin seguimiento) y `.agents/custom-skills/<id>/` (skills privadas del repo, nunca publicadas). Holding no exige una ubicación concreta para cache o plans.
Migra las empresas hijas (`children/<child>` hacia otro repo) por separado antes de quitar la carpeta antigua del padre.

## Límites de personal por plan

La plantilla de cada empresa admite como máximo este número de personal (CEO incluido). Aplica a `/staff add`, `holding company staff move|assign`, `holding company migrate` y empresas nuevas. Precios completos (créditos, dispositivos, costes de acción): [PRICING.md](../PRICING.md).

| Plan | Máx. personal por empresa |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | Ilimitado |
| Enterprise | Ilimitado |
| Claves antiguas sin plan de créditos: trial / monthly / yearly | 20 / 30 / 50 |

Al límite: "Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan." Migrate conserva los primeros N y reporta cuántos se omitieron.

## Columnas del tablero

Las empresas nuevas reciben: To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done.
- **Reopened**: mueve una tarjeta aquí cuando falle un test; el agente reanuda Coding.
- **Blocked**: la tarjeta te espera; los agentes nunca mueven una tarjeta hacia o desde esta columna por sí solos.

Las empresas existentes conservan su tablero. Para añadir Reopened/Blocked a un tablero existente:
1. En el chat: `/flow edit` y pide añadir Reopened (antes de Coding) y Blocked (antes de Done); confirma el flujo dibujado.
2. En el repo: `holding jira setup-workflow <site> <email> <KEY>` con `AH_FLOW_JSON` apuntando al flujo guardado (el agente lo hace por ti), luego arrastra las columnas al orden impreso (Jira no tiene API para reordenar columnas).

### Columnas personalizadas por empresa
Cualquier empresa puede tener columnas extra (`/flow edit`). Ejemplo (promoción de tests), insertado después de In Review:
Ready Testing on Develop → Verified on Develop (abre un PR a `develop`) → Ready Testing on Integration → Verified on Integration (abre un PR de la rama feature a `main`) → Blocked → Done.
Los PR solo se abren si auto-PR está activado para esa empresa (`holding company config <c> set auto-pr on`).
Nota: mover la tarjeta a Done cuando se fusiona el PR de `main` aún no es automático; muévela a Done tú después del merge.
