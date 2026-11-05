# Habilidades

[English](../SKILLS.md)

Una habilidad es un conjunto reutilizable de instrucciones (con referencias, plantillas o scripts opcionales) que sigue un rol, por ejemplo *code-review* o *release-notes*. Asígnala a un rol y todas sus tareas la usarán.

## Añadir una habilidad propia

Crea una carpeta con minúsculas, números y guiones, con un `SKILL.md` cuya cabecera tenga `name`, `description` y `version`. `holding skill where` muestra las carpetas.

```
~/.agents-holding/skills/
  public/<skill>/SKILL.md      # shared (default)
  private/<skill>/SKILL.md     # stays on this machine
  library/<skill>/SKILL.md     # shared library skills (signed)
    references/  scripts/  templates/   # optional
    history/  assets/                   # optional, never uploaded
```

```markdown
---
name: code-review
description: Review a diff for bugs and style
version: 1
---
Steps the staff should follow...
```

## Asignar una habilidad a un rol

`holding skill add <staff> <skill>` (ejemplo: `holding skill add dev code-review`). Las tareas que esperaban esa habilidad vuelven a comprobar y siguen. `holding skill browse <staff>` muestra las que puedes asignar.

## Listar, comprobar y sincronizar

- `holding skill list --custom`: tus habilidades propias
- `holding skill check`: cuáles cargan, cuáles se ignoran y la ruta correcta
- `holding skill sync [--dry-run]`: envía ya las públicas (también se hace solo)

## Públicas y privadas

Las habilidades nuevas son **públicas** por defecto. Cámbialo con `holding skill private <name>` o `holding skill public <name>`, o moviendo la carpeta. En una pública se comparten `SKILL.md` y `references/`, `scripts/`, `templates/`; nunca `history/` ni `assets/`. Si un archivo parece contener un secreto, se retiene toda la habilidad. Las privadas no salen de tu equipo; solo se cuenta cuántas hay.

## Habilidades de biblioteca

Son habilidades compartidas ya hechas y deben llevar una firma válida; las copias sin firma se ignoran. Se asignan igual con `holding skill add`.

## Permiso para scripts

Los scripts nunca se ejecutan solos. Permítelos una vez con `holding skill consent <name>` y retíralo con `holding skill consent <name> --revoke`. Se ejecutan en un entorno aislado.

## Solución de problemas

- No aparece: ejecuta `holding skill check` y muévela a la ruta indicada.
- "frontmatter missing": añade `name`, `description` y `version` a la cabecera de `SKILL.md`.
- Las carpetas no estándar se ignoran.
- "no consent": ejecuta `holding skill consent <name>`.
- Una pública no se compartió: revisa si hay secretos y luego `holding skill sync --dry-run`.

Ver también: [Referencia de comandos](../COMMANDS.md)
