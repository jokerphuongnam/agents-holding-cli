# Entreprises

[English](../COMPANIES.md)

Un holding, plusieurs entreprises. Chaque entreprise a son propre personnel, tableau Jira, Jira Listener et réglages ; ce qu’elle ne redéfinit pas suit les valeurs par défaut du holding.

Chat : `/ceo companies` (liste) · `/ceo company <verb> ...` (mêmes verbes qu’ci-dessous). Terminal : `holding company <verb>`.

| Commande | Rôle |
|---|---|
| `holding company list` / `count` / `overview` | Entreprises liées au holding (enfants sous leur parent), statut, personnel, Jira, Jira Listener. `overview` ajoute la santé : tâches ouvertes/bloquées, éléments qui vous attendent, crédits (30 jours). |
| `holding company show [name]` | Produit, statut, parent/enfants, personnel, Jira, Jira Listener, colonnes du tableau, comptes de tâches, crédits, config. |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | Nouvelle entreprise avec le personnel et le tableau par défaut (dont Reopened et Blocked). |
| `holding company rename <c> <new name>` | Nom affiché seulement ; l’id reste, donc dépôts et Jira continuent. |
| `holding company pause / resume / archive <c>` | Les entreprises en pause/archivées ne démarrent pas de nouveau travail et ne dépensent rien. |
| `holding company delete <c> --confirm <c>` | Seulement après `archive`, et sans entreprises enfants. Le dépôt, les fichiers locaux et le tableau Jira ne sont pas touchés. |
| `holding company move <c> --parent <P|none>` | Changer le parent. |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | Déplacer ou ajouter un rôle de personnel entre entreprises (limites du plan). |
| `holding company link <c> <KEY>` / `unlink <c>` | Lier ou délier le tableau Jira. |
| `holding company config [c] [set|unset <key> <value>]` | Surcharges par entreprise : `communication`, `auto-pr`, `flow`, `share-skills`. `unset` = revenir au défaut du holding. `config defaults [set ...]` édite les défauts du holding. |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | Importer une ancienne entreprise locale (`.agents/*-company`) dans le holding. Voir ci-dessous. |

Seules les entreprises liées au holding sont listées. Les anciennes locales-seulement restent cachées (et ne sont jamais supprimées) jusqu’à migration.

## Migrer une ancienne entreprise locale

`holding company migrate <repo or .agents/x-company folder>`
1. Sauvegarde le dossier vers `~/.config/agents-holding/backups/<name>-<time>.tgz` (originaux inchangés sur le disque).
2. N’envoie que noms et comptes : ids de rôles, nombre de plans, parent, date de création. Pas de contenu de fichiers.
3. Le personnel dont le rôle est dans le catalogue holding devient du vrai personnel (jusqu’à la limite du plan, voir ci-dessous). Les rôles personnalisés (hors catalogue) ne sont enregistrés que par nom dans l’historique de l’entreprise ; holding ne lit pas leurs fichiers de persona. Pour en réutiliser un, faites-en une skill privée du dépôt dans `.agents/custom-skills/<id>/SKILL.md`.
4. Écrit `.agents/company.json` dans le dépôt et enregistre le dépôt. Relancer est sûr (met à jour la même entreprise).
Migrez d’abord le parent, puis les enfants avec `--parent <parent>`.

Après migration, seul `.agents/company.json` est lu. L’ancien dossier `.agents/<x>-company` peut être retiré une fois la sauvegarde complète faite (la sauvegarde migrate ignore `cache/`) : `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`.
Disposition suggérée de ce que vous gardez : `.agents/cache/` et `.agents/plans/` (personnel, non suivi) et `.agents/custom-skills/<id>/` (skills privées du dépôt, jamais publiées). Holding n’impose pas d’emplacement pour cache ou plans.
Migrez les entreprises enfants (`children/<child>` vers un autre dépôt) séparément avant de supprimer l’ancien dossier du parent.

## Limites de personnel par plan

L’effectif de chaque entreprise peut contenir au plus ce nombre de personnes (CEO inclus). S’applique à `/staff add`, `holding company staff move|assign`, `holding company migrate` et aux nouvelles entreprises. Tarifs complets (crédits, appareils, coûts d’action) : [PRICING.md](../PRICING.md).

| Plan | Max. personnel par entreprise |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | Illimité |
| Enterprise | Illimité |
| Anciennes clés sans plan crédits : trial / monthly / yearly | 20 / 30 / 50 |

À la limite : « Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan. » Migrate conserve les N premiers et signale combien ont été ignorés.

## Colonnes du tableau

Les nouvelles entreprises reçoivent : To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done.
- **Reopened** : déplacez une carte ici quand un test échoue ; l’agent reprend Coding.
- **Blocked** : la carte vous attend ; les agents ne déplacent jamais une carte vers ou hors de cette colonne seuls.

Les entreprises existantes gardent leur tableau. Pour ajouter Reopened/Blocked à un tableau existant :
1. En chat : `/flow edit` et demandez d’ajouter Reopened (avant Coding) et Blocked (avant Done) ; confirmez le flux dessiné.
2. Dans le dépôt : `holding jira setup-workflow <site> <email> <KEY>` avec `AH_FLOW_JSON` pointant vers le flux enregistré (l’agent le fait pour vous), puis glissez les colonnes dans l’ordre imprimé (Jira n’a pas d’API pour réordonner les colonnes).

### Colonnes personnalisées par entreprise
Toute entreprise peut avoir des colonnes supplémentaires (`/flow edit`). Exemple (promotion de tests), après In Review :
Ready Testing on Develop → Verified on Develop (ouvre une PR vers `develop`) → Ready Testing on Integration → Verified on Integration (ouvre une PR de la branche feature vers `main`) → Blocked → Done.
Les PR ne s’ouvrent que si auto-PR est activé pour cette entreprise (`holding company config <c> set auto-pr on`).
Note : passer la carte à Done quand la PR `main` est fusionnée n’est pas encore automatique ; déplacez-la vous-même après le merge.
