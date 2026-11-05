# Reglas, permisos y procesos del personal

[English](../STAFF-POLICY.md)

Cada empresa tiene **una configuración compartida**. Incluye valores predeterminados de toda la empresa, y cada miembro del personal puede tener una sección extra propia. holding convierte esto en la configuración de cada agente en cada ejecución. Solo el propietario o un admin de la empresa puede cambiarla, y el personal no puede aflojar sus propios permisos.

## Reglas y permisos
```
holding staff policy show <staff|*>                      ver configuración (* = toda la empresa)
holding staff policy set <staff|*> <permission> on|off   p. ej. mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         reglas en texto plano que la IA lee al trabajar
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Las reglas de git (nombre de rama, formato de commit, título de PR, ítems obligatorios del PR) las comprueba el servidor. Las infracciones se rechazan con un motivo claro.

Al añadir personal (`holding staff add <role>`), un menú con teclas de flecha muestra los valores del rol: acéptalos o edítalos. Pon `AH_NONINTERACTIVE=1` para usar los valores sin preguntar.

## Lista de denegación de archivos
```
holding company deny add <path> [--replace <file>]     bloquear un archivo para todo el personal
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
Cuando la IA lee un archivo bloqueado, solo recibe una nota de que está bloqueado — nunca el contenido real. Con `--replace` (por ejemplo `.env` → `.env.example`), recibe el contenido del archivo de reemplazo. El reemplazo se escanea primero para que no filtre un secreto real. Las listas de la empresa y del personal se combinan, y el personal no puede quitar una entrada que la empresa ya bloqueó.

## Procesos de la empresa (Jira Listener)
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
Ejemplo: cuando una tarea del proyecto X pasa al estado S, el Jira Listener hace el trabajo configurado (cambiar estado, comentar, asignar, avisar al CEO) en las tareas vinculadas de los proyectos Y y Z. El Listener solo usa enlaces reales de Jira, hace cada acción una vez y nunca entra en bucle.

## Actualización
`holding update`, o escribe `/holding update` en el chat. Actualiza el cliente, regenera la configuración del agente, vuelve a sincronizar los comandos de chat y reinicia el Jira Listener. Ejecutarlo de nuevo es seguro. Cuando el cliente esté desfasado, la IA te lo indica y puede ejecutar este comando por ti.

## Adjuntos, Figma, Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         adjuntar archivos locales a un issue
holding figma connect                                        guardar un token de Figma en el Keychain (entrada oculta, comprobado con /v1/me)
holding figma export "<Figma link with node-id>" --attach NAIL-12   exportar un frame como PNG y adjuntarlo
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
Estos comandos usan el token de Atlassian ya en el Keychain y nunca imprimen el token. El personal necesita `jira_attach` (activado por defecto), `figma_export` (activado por defecto) y `confluence_write` (solo CEO, lead y manager por defecto). Añade `--dry` para previsualizar sin enviar nada.
