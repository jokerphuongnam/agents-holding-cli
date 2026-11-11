# Etiquetas Jira de Agents Holding

Las etiquetas son señales de visualización y routing; mandan el estado Jira,
el checkpoint y la evidencia autenticada.

| Etiqueta | Significado | Se añade cuando |
|---|---|---|
| `ah-flow:<name>` | Plantilla de workflow | Se crea o cambia el flujo |
| `staff:<role>` | Staff del stage actual | Comienza un stage |
| `ah-agent-owned` | Holding coordina la tarea | Comienza el procesamiento automático |
| `agent-working` | Hay un worker ejecutándose | Antes de dispatch |
| `ah-awaiting-user` | Falta una acción del usuario | Se requiere login, permiso, terminal o aprobación |
| `ah-blocked` | No hay remediation automática | Existe un bloqueo real del usuario |
| `ah-registration-required` | Routing inválido | No se puede enrutar repo/proyecto |
| `terminal-<slug>` | Comando de terminal de QC | Se selecciona un terminal registrado |

Las etiquetas temporales se limpian en el siguiente reconcile. Un terminal
ocupado es una cola, no un bloqueo ni un fallo de QC.
