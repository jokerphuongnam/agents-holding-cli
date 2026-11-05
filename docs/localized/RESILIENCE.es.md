# Resiliencia: qué ocurre cuando algo falla

[English](../RESILIENCE.md)

El Jira Listener gestiona tres tipos de fallo sin perder trabajo. Nunca inventa eventos de Jira.

## 1. Compactación del agente / pérdida de contexto / muerte a mitad → checkpoint + reanudación
- Cada etapa escribe un checkpoint en `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`. Registra la etapa, los pasos terminados, los subpasos de coding hechos, el último commit y cualquier error.
- Los tech plans grandes se codifican en hasta 3 subpasos. Cada uno termina en un commit `WIP(<KEY>) n/3` en `feature/<KEY>`, y la tarjeta recibe una nota 📌 con lo hecho (✅) y lo pendiente (⏳).
- Una nueva ejecución (`holding staff run <KEY>` o volver a mover la tarjeta) reanuda desde el checkpoint. Planes, tech plans y subpasos terminados no se repiten.
- Si la CLI del agente reporta compactación, truncado, desbordamiento de contexto o límite de turnos, se reintenta una vez en una sesión nueva con una nota de reanudación.

## 2. Agente caducado / no disponible → `agent-blocked` + reserva
- El código de salida y la salida de cada CLI se clasifican como: login caducado, sin créditos/cuota, límite de tasa, CLI ausente, contexto perdido o tiempo agotado.
- **Límite de tasa:** reintento automático con backoff (30s → 60s → 120s).
- **Reserva:** añade una lista `fallback` por miembro del personal en `state/<company>/agents.jsonc`. Ante error de login, cuota, CLI ausente o límite de tasa se usa el siguiente comando automáticamente y la tarjeta anota el cambio.
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **Cuando nada funciona:**
  - La tarjeta recibe la etiqueta `agent-blocked` y un comentario en el idioma de la tarea con la causa, el comando y la corrección exacta (`claude login`, `codex login`, `grok login`, instalar la CLI, comprobar créditos).
  - Recibes una notificación macOS y `holding status` muestra el bloqueo.
  - La etiqueta se quita en la siguiente ejecución correcta.

## 3. Problemas del servidor MCP (caída, cuota, sobrecarga, timeout) → aviso + reconciliación
- El Jira Listener detecta pérdida de conexión, respuestas 5xx/sobrecarga, timeouts y errores de cuota. Registra un aviso rojo, envía una notificación y `holding status` lo muestra. El trabajo se pausa y se conserva el checkpoint.
- Al volver la conexión (y cada vez que arranca el listener), lee en Jira los issues actualizados desde el último evento visto. Reproduce cada estado real una vez, deduplicado por issue + status + hora de actualización en local y en el servidor MCP. La reproducción solo lee Jira y nunca escribe eventos.
- Los comandos de solo lectura (`holding status`, `board`, `tasks`, `usage`, …) muestran la última buena respuesta marcada **STALE** con su hora. Los de escritura fallan con claridad.
- Los errores de cuota imprimen: "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

Pruebas: `node tests/resilience_test.mjs` usa CLIs simuladas que fallan con auth, caducidad, cuota, límite de tasa, compactación y ausencia, más un servidor MCP simulado que devuelve 503/429.

## 4. El Jira Listener se detiene → aviso inmediato, no se pierde nada

**El Jira Listener mantiene toda la automatización de Jira** (movimientos de tarjeta, comentarios, ejecuciones de personal). Si está apagado no ocurre nada en Jira hasta que lo arranques de nuevo, así que se te avisa al momento:

- **Parada limpia / salida / cierre de sesión** (SIGTERM, SIGINT, SIGHUP, `launchctl bootout`): el listener dice al servidor MCP "stopped" antes de salir (~1 s).
- **Crash, suspensión o congelación**: latido cada 60 s; tras 150 s sin uno el servidor MCP lo marca offline.
- **Watchdog local** (job launchd `com.agentsholding.listener-watchdog`, instalado con `holding listener start` / `autostart on`): comprueba cada 5 s y muestra una notificación macOS *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"* (recordatorio cada 15 min), *"Jira Listener restarted"* cuando crashó y launchd lo reinició, y *"running again"* al volver. Log: `~/Library/Logs/agents-holding/watchdog.log`.
- `holding status`, `holding listener status` y `/ceo` empiezan con el mismo aviso rojo mientras está apagado; la bandeja del CEO recibe un ítem "Jira Listener is off".
- **Cambios de Jira mientras está apagado**: el primer cambio de cada tarjeta recibe UN comentario (en el idioma de la tarea) diciendo que el Jira Listener estaba apagado y cómo arrancarlo. Al volver, se limpia la bandera, se cierra el ítem offline y se reproducen los cambios perdidos (reconciliación); las ejecuciones incompletas reanudan desde su checkpoint.
- Una reproducción que solo diga "la tarjeta sigue en la columna de la que el agente la está sacando" se ignora (sin falso "la moviste atrás").

## 5. Quién trabaja en una tarjeta (assignee)

Cuando un miembro del personal toma una tarea (al mismo tiempo que la etiqueta `staff:<id>`) el assignee de Jira de la tarjeta se pone al `jira_user` del personal (opcional, en `agents.jsonc`: accountId o email de Jira) o, si no, a la cuenta de Jira con la que está conectado el Jira Listener. La etiqueta de personal permanece. El assignee se conserva en needs-hire / needs-decision / blocked y en Done.

## 6. Dónde van las preguntas: bandeja del CEO, nunca una ejecución bloqueada

Todo lo que te necesita (pregunta del personal, decisión 1/2/3, contratación, agente bloqueado p. ej. por login, puerta de aprobación, parada de QC, ejecución fallida, "¿qué repo?", Jira Listener apagado) se convierte en UN ítem pendiente en la **bandeja del CEO** y una notificación macOS titulada **Agents Holding** con la clave de la tarea, qué se necesita y cómo responder. Las ejecuciones de personal nunca esperan entrada: publican el ítem y salen; tu respuesta reanuda la tarea desde su checkpoint.

- `holding inbox [--all] [KEY]`: ítems pendientes, agrupados por empresa.
- `holding inbox reply KAN-12 2`: respuesta rápida sin abrir sesión (mismo efecto que responder en la tarjeta; no se escribe en Jira).
- `holding inbox dismiss <id|KEY>`: cerrar un ítem que no necesitas responder (no se envía nada al personal ni a Jira).
- `holding status` muestra cuántos ítems de la bandeja del CEO están pendientes.
- Botón **Open CEO** en la notificación, o `holding ceo --item <id>`: abre una sesión CEO (nueva ventana de Terminal) centrada en ese ítem.
- `/ceo` muestra primero los pendientes. Dentro del repo de una empresa: solo esa empresa. Fuera de cualquier empresa: modo holding, pendientes y progreso de todas, agrupados; resuelve desde ahí. Aprueba con `/approve`, mueve/marca hecho con `holding jira move KAN-12 "Done"`.

**Ajuste de comunicación** (por empresa, `holding company set communication jira+chat|chat`, por defecto `jira+chat`):
- `jira+chat`: preguntas/decisiones/progreso se comentan en la tarjeta Y van a la bandeja del CEO; responde en cualquiera.
- `chat`: sin comentarios de pregunta/decisión/progreso en las tarjetas; responde con `/ceo` o `holding inbox reply`. Etiquetas, estado y assignee siguen actualizándose en Jira.

## Claves y créditos

1. **Obtener una clave.** Setup ofrece dos opciones: **Generate key** (una clave Free nueva para este Mac, 1.500 créditos al mes, una Free por máquina, para siempre) o **Import key** (una que ya tengas). La clave se pide en un prompt oculto y solo vive en el Keychain de macOS.
2. **¿Perdiste la clave en este Mac?** Vuelve a ejecutar Generate key: se recupera la Free de esta máquina (mismos créditos e historial, secreto nuevo; la antigua deja de funcionar). Claves de pago: Import key.
3. **Comprobarla.** `holding key show` (id de clave, plan, créditos, máquinas), `holding credit show`, `holding billing`. Para subir de plan o añadir créditos, envía tu id de clave (nunca la clave) al propietario. Tarifa completa: [PRICING.md](../PRICING.md) (también enlazada desde `holding billing`).
4. **Planes (créditos al mes).** Free 1.500 · Starter 4.000 · Lite 6.000 · Pro 20.000 · Power 80.000 · Max 180.000 · Ultra 300.000 · Marketplace 20.000 por $10 · Enterprise a medida — detalles en [PRICING.md](../PRICING.md).
5. **Qué cuesta.** next action 2; advance, actualizaciones de Jira, staff brief, record artifact, assign, CEO, inbox post / reply 1 cada uno. Todo lo demás es gratis; los tokens del modelo nunca se cuentan.
6. **Créditos extra** del propietario: del periodo, hasta renovar la clave (como máximo 90 días), o hasta agotarlos (sobreviven a la caducidad pero solo funcionan con la clave activa).
7. **Sin créditos o caducada.** El Jira Listener se detiene con "Key is no longer valid or out of credits; contact the owner to renew or add credits". Los cambios de Jira de entretanto no se reproducen; tras la renovación el Jira Listener reconcilia el estado actual de cada tarjeta abierta.

## Plan Enterprise (previsto; siguiente fase)

**Las claves y créditos están activos** (ver la sección anterior); las funciones de equipo aquí son la siguiente fase. Cómo funciona la versión de equipo:

- **Solo la clave que introduces decide tu plan y rol**; no hay login ni selector de rol aparte. Roles:
  - **admin**: propietario de la plataforma.
  - **personal user**: plan personal.
  - **enterprise owner**: clave emitida por el admin; genera, revoca, renueva y gestiona claves solo dentro de su propia enterprise, nunca el pool compartido/personal ni otras enterprises.
  - **enterprise employee**: clave generada por su enterprise owner.
- **Un tablero compartido por empresa**; un servidor CLI compartido puede ejecutar la automatización de Jira de toda la empresa.
- **Personal mapeado a usuarios reales de Jira** (`jira_user`) con roles/permisos, y auditoría de quién tomó / cambió qué.
- **Impulsado por assignee**: cada persona ejecuta su propio Jira Listener; cuando el assignee de una tarjeta pasa a su usuario de Jira, su listener la recoge con su personal.
- **Chat primero**: se habla por `/ceo` o chat de personal; los comentarios de Jira son opcionales (ajuste de comunicación). La vía principal es `/ceo KAN-12`: el CEO carga la tarea y coordina al personal.

