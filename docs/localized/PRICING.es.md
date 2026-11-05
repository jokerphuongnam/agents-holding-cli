# Precios de agents-holding (créditos)

[English](../PRICING.md)

Planes de créditos, límites, cuánto cuesta cada acción y cómo mejorar tu plan. No hay pagos dentro de la app: para mejorar, escribe al propietario con tu **key id**.

Consulta tu plan en tu equipo: `holding billing` · `holding usage` · `holding key show` (solo muestra el key id, nunca el secreto)

---

## Planes de créditos (mensuales)

| Plan | Créditos / mes | Precio | Canal |
|---|---:|---:|---|
| free | 1,500 | $0 | directo |
| starter | 4,000 | $2 | directo |
| lite | 6,000 | $2.5 | directo |
| pro | 20,000 | $7.5 | directo |
| power | 80,000 | $25 | directo |
| max | 180,000 | $50 | directo |
| ultra | 300,000 | $75 | directo |
| marketplace | 20,000 | $10 | marketplace |
| enterprise | a medida | consultar | contactar al propietario |

- Solo las keys **medidas** (con plan de créditos) consumen créditos. Las keys antiguas sin medición siguen funcionando como antes.
- **enterprise**: créditos, puestos y dispositivos según acuerdo. **Contacta** al propietario.
- Plan marketplace: se compra en el marketplace. Para detalles del pedido, **contacta** al propietario.

---

## Límite de staff (por empresa)

Número máximo de miembros del staff en la plantilla de una empresa, CEO incluido. Se aplica al añadir, mover o asignar staff, al migrar y al crear una empresa nueva. La key del propietario no tiene límite.

| Plan | Máx. staff / empresa |
|---|---:|
| free | 5 |
| starter | 10 |
| lite | 15 |
| pro | 25 |
| marketplace | 25 |
| power | 40 |
| max | 60 |
| ultra | ilimitado |
| enterprise | ilimitado |

Keys antiguas **sin** plan de créditos: trial 20 · monthly 30 · yearly 50 · en otro caso 30.

Al llegar al límite verás: *"Has alcanzado el límite de N miembros del plan X. Despide primero a alguien del staff o mejora tu plan."*

---

## Límite de dispositivos (equipos)

| Concepto | Valor |
|---|---|
| Por defecto por key | **1** dispositivo |
| Máximo que puede asignar el propietario | **1 a 50** dispositivos por key |
| Key Free creada en un equipo | **una** key Free por equipo |
| enterprise | dispositivos por key según acuerdo: **contáctanos** |

¿Sin plazas de dispositivo? Pide al propietario que suba tu límite y vuelve a intentarlo en el equipo nuevo. `holding key show` muestra dispositivos usados/máximo.

---

## Coste en créditos por acción

Solo las acciones de abajo, que generan trabajo, cuestan créditos. Todo lo demás (heartbeat, sincronización en tiempo real, status, billing, lista del inbox, key, admin, la mayoría de comandos CLI) es **gratis**.

| Acción | Créditos |
|---|---:|
| Ejecución del agente (`next_action`) | **2** |
| `advance` | 1 |
| `jira_ops` | 1 |
| `staff_brief` | 1 |
| `record_artifact` | 1 |
| `assign` (incluye `holding task set …`) | 1 |
| `ceo` | 1 |
| `inbox_post` / `inbox_reply` | 1 |

**Los tokens del modelo nunca se cobran en créditos.**

### Subidas (adjuntos de Jira / exportación de Figma / Confluence)

**1 crédito por archivo, más 1 crédito por cada 10 MB por encima de los primeros 5 MB**, **con un máximo de 5 créditos por archivo**.

Ejemplos: 0.4 MB → 1 · 25 MB → 3 · 300 MB → 5.

Los archivos van directamente de tu equipo a Jira, Confluence o Figma; el servidor solo mide el tamaño para contar créditos.

---

## Comprar créditos extra (sin cambiar de plan)

Recarga créditos sin cambiar de plan. Hay tres tipos:

| Tipo | Cómo funciona |
|---|---|
| `expire` | caducan al terminar el periodo actual de tu plan |
| `next` | se pueden usar al momento; lo que sobre al final del periodo se bloquea y se desbloquea y suma cuando empieza el siguiente |
| `keep` | se mantienen hasta que los gastes |

Precio: contacta al propietario (phuongnamp99@gmail.com) con tu key id.

---

## Mejorar el plan o añadir créditos

1. Consigue tu **key id** (nunca envíes la key secreta): `holding key show`, o la línea "To upgrade" de `holding billing` / `holding usage`.
2. Envía el key id al **propietario** (**phuongnamp99@gmail.com**) con el plan que quieres o los créditos extra que necesitas este periodo.
3. **Todavía no hay pagos en la app.** Cuando lleguen, la mejora seguirá el mismo flujo; esta tabla de precios seguirá siendo la referencia.

Sin créditos o con la key caducada: el Jira Listener se detiene y te indica que contactes al propietario para renovar o añadir créditos.

---

## Consulta rápida en tu equipo

```bash
holding billing          # plan actual + precios + línea para mejorar
holding usage            # barra de créditos de este periodo (keys medidas)
holding credit show      # saldo de créditos
holding key show         # key id, plan, dispositivos
```

Instalación / MCP: [full/SETUP.md](../../full/SETUP.md).
