# Compétences

[English](../SKILLS.md)

Une compétence est un ensemble réutilisable d'instructions (avec références, modèles ou scripts en option) que suit un rôle, par exemple *code-review* ou *release-notes*. Attachez-la à un rôle et toutes ses tâches l'utiliseront.

## Ajouter une compétence personnelle

Créez un dossier nommé en minuscules, chiffres et tirets, avec un `SKILL.md` dont l'en-tête contient `name`, `description` et `version`. `holding skill where` affiche les dossiers.

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

## Attacher une compétence à un rôle

`holding skill add <staff> <skill>` (exemple : `holding skill add dev code-review`). Les tâches qui l'attendaient revérifient et reprennent. `holding skill browse <staff>` liste celles que vous pouvez attacher.

## Lister, vérifier, synchroniser

- `holding skill list --custom` : vos compétences
- `holding skill check` : celles qui se chargent, celles ignorées et le bon chemin
- `holding skill sync [--dry-run]` : envoie les publiques tout de suite (aussi automatique)

## Publiques et privées

Les nouvelles compétences sont **publiques** par défaut. Changez avec `holding skill private <name>` ou `holding skill public <name>`, ou en déplaçant le dossier. Pour une publique, `SKILL.md` et `references/`, `scripts/`, `templates/` sont partagés ; jamais `history/` ni `assets/`. Un fichier qui semble contenir un secret bloque toute la compétence. Les privées ne quittent pas votre machine ; seul leur nombre est noté.

## Compétences de bibliothèque

Ce sont des compétences partagées prêtes à l'emploi, avec une signature valide obligatoire ; les copies non signées sont ignorées. Attachez-les avec `holding skill add`.

## Autorisation des scripts

Les scripts ne s'exécutent jamais seuls. Autorisez-les une fois avec `holding skill consent <name>` ; retirez avec `holding skill consent <name> --revoke`. Ils tournent dans un bac à sable.

## Dépannage

- Compétence introuvable : lancez `holding skill check` et déplacez-la au chemin indiqué.
- "frontmatter missing" : ajoutez `name`, `description` et `version` à l'en-tête de `SKILL.md`.
- Les dossiers non standard sont ignorés.
- "no consent" : lancez `holding skill consent <name>`.
- Une publique n'a pas été partagée : cherchez un secret, puis `holding skill sync --dry-run`.

Voir aussi : [Référence des commandes](../COMMANDS.md)

## Dependency (skill-pack)

Ajoutez un dépôt git entier avec `holding dependency add <git-url>`. Le pack est hors projet ; `holding dependency consent` est requis avant d’exécuter des scripts. Voir COMMANDS.md → dependency.
