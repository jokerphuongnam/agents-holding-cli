# Règles, permissions et processus du personnel

[English](../STAFF-POLICY.md)

Chaque entreprise a **une configuration partagée**. Elle contient les valeurs par défaut de l’entreprise, et chaque membre du personnel peut avoir une section supplémentaire. holding en fait la config propre de chaque agent à chaque exécution. Seul le propriétaire ou un admin de l’entreprise peut la modifier, et le personnel ne peut pas assouplir ses propres permissions.

## Règles et permissions
```
holding staff policy show <staff|*>                      afficher la config (* = toute l’entreprise)
holding staff policy set <staff|*> <permission> on|off   ex. mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         règles en texte que l’IA lit en travaillant
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Les règles git (nom de branche, format de commit, titre de PR, cases obligatoires du PR) sont vérifiées par le serveur. Les violations sont refusées avec une raison claire.

À l’ajout de personnel (`holding staff add <role>`), un menu à flèches montre les défauts du rôle : acceptez-les ou modifiez-les. Mettez `AH_NONINTERACTIVE=1` pour prendre les défauts sans demander.

## Liste d’interdiction de fichiers
```
holding company deny add <path> [--replace <file>]     bloquer un fichier pour tout le personnel
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
Quand l’IA lit un fichier bloqué, elle ne reçoit qu’une note indiquant le blocage — jamais le vrai contenu. Avec `--replace` (par ex. `.env` → `.env.example`), elle reçoit le contenu du fichier de remplacement. Le remplacement est d’abord scanné pour ne pas fuiter un vrai secret. Les listes entreprise et personnel sont combinées, et le personnel ne peut pas retirer une entrée déjà bloquée par l’entreprise.

## Processus d’entreprise (Jira Listener)
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
Exemple : quand une tâche du projet X passe à l’état S, le Jira Listener fait le travail configuré (changer d’état, commenter, assigner, prévenir le CEO) sur les tâches liées des projets Y et Z. Le Listener n’utilise que de vrais liens Jira, fait chaque action une seule fois et ne boucle jamais.

## Mise à jour
`holding update`, ou tapez `/holding update` dans le chat. Cela met à jour le client, régénère la config agent, resynchronise les commandes de chat et redémarre le Jira Listener. Le relancer est sûr. Quand le client est obsolète, l’IA le signale et peut lancer cette commande pour vous.

## Pièces jointes, Figma, Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         joindre des fichiers locaux à une issue
holding figma connect                                        enregistrer un jeton Figma dans le Keychain (saisie masquée, vérifié via /v1/me)
holding figma export "<Figma link with node-id>" --attach NAIL-12   exporter une frame en PNG et la joindre
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
Ces commandes utilisent le jeton Atlassian déjà dans le Keychain et n’impriment jamais le jeton. Le personnel a besoin de `jira_attach` (activé par défaut), `figma_export` (activé par défaut) et `confluence_write` (CEO, lead et manager seulement par défaut). Ajoutez `--dry` pour prévisualiser sans rien envoyer.
