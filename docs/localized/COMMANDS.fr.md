# Référence des commandes

[English](../COMMANDS.md)

Toutes les commandes disponibles avec votre clé. Dans le chat, tapez `/holding <commande>` (par exemple `/holding key show`) ; dans un terminal, `holding <commande>`. Elles répondent tout de suite, sans IA. `/ceo` et `/approve` sont des commandes de l'agent.

## Installation et aide

| Commande | Rôle | Exemple |
|---|---|---|
| `holding help [group\|command]` | Toutes les commandes de votre clé | `holding help staff` |
| `holding setup sync [--claude]` | Installe les commandes / dans votre agent | `holding setup sync` |
| `holding doctor [--server]` | Vérifie chaque étape | `holding doctor` |
| `holding status` | État de l'installation et des avis | `holding status` |

## Clé de licence

| Commande | Rôle | Exemple |
|---|---|---|
| `holding key show` | Id de clé, offre, crédits, appareils | `holding key show` |
| `holding key generate` | Crée une clé gratuite pour cette machine | `holding key generate` |
| `holding key import` | Utilise une clé existante (saisie masquée) | `holding key import` |

## Entreprises

| Commande | Rôle | Exemple |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | Liste, affiche ou choisit une entreprise | `holding company use acme` |
| `holding company create [name] [--parent P]` | Crée une entreprise (sans nom = ce dossier) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | Gère une entreprise | `holding company pause acme` |
| `holding company migrate <folder>` | Importe une ancienne entreprise locale | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | Réglages de l'entreprise | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | Bloque un fichier pour toute l'équipe | `holding company deny add .env` |

## Équipe

| Commande | Rôle | Exemple |
|---|---|---|
| `holding staff list` | Votre équipe | `holding staff list` |
| `holding staff add <role> \| remove <role>` | Ajoute ou retire un rôle | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | Règles et droits (une config pour tous les agents) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | Bloque un fichier pour un rôle | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | Choisit l'IA et le modèle d'un rôle | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | Lance ou teste un rôle | `holding staff test qa` |

## Processus et flux

| Commande | Rôle | Exemple |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Processus exécutés par le Jira Listener | `holding company process list` |
| `holding flow show \| list` | Vos flux | `holding flow show` |
| `holding project add\|remove\|list` | Dépôts liés aux projets Jira | `holding project list` |
| `holding habit list\|edit\|clear` | Habitudes apprises | `holding habit list` |

## Tâches

| Commande | Rôle | Exemple |
|---|---|---|
| `holding task list [all] \| history [n]` | Tâches et historique | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | Planifie ou assigne une tâche | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | Approuve un plan (dans l'agent) | `/approve KAN-12` |

## IA par rôle

| Commande | Rôle | Exemple |
|---|---|---|
| `holding provider list \| set \| unset` | Quelle IA chaque rôle utilise | `holding provider list` |

## Compétences

| Commande | Rôle | Exemple |
|---|---|---|
| `holding skill add <staff> <skill>` | Attache une compétence à un rôle | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | Vos compétences ou celles d'un rôle | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | Dossiers, vérification et synchro | `holding skill check` |
| `holding skill private\|public <name>` | Rend une compétence privée ou publique | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | Autorise ses scripts | `holding skill consent my-tool` |

## Jira et Jira Listener

| Commande | Rôle | Exemple |
|---|---|---|
| `holding jira connect <site> <email>` | Enregistre le jeton Jira dans le trousseau | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Lit Jira | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Modifie les cartes Jira | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | Joint des fichiers à un ticket | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | Le Jira Listener | `holding listener status` |

## Figma

| Commande | Rôle | Exemple |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Connexion à Figma (trousseau) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | Exporte un cadre en PNG | `holding figma export <url> --attach KAN-12` |

## Atlassian et Confluence

| Commande | Rôle | Exemple |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | Connexion Atlassian seulement si besoin | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Crée ou met à jour une page Confluence | `holding confluence page create ENG "Release" --file notes.md` |

## Boîte du CEO

| Commande | Rôle | Exemple |
|---|---|---|
| `holding inbox list [--all] [KEY]` | Questions et décisions en attente | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | Répondez ; le rôle reprend où il s'est arrêté | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | Ferme sans répondre | `holding inbox dismiss KAN-12` |

## Parler au CEO

| Commande | Rôle | Exemple |
|---|---|---|
| `/ceo <request>` | Planifie, découpe et assigne le travail | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | Ouvre une session CEO sur un élément | `holding ceo KAN-12` |

## Usage et rapports

| Commande | Rôle | Exemple |
|---|---|---|
| `holding usage [--by day\|staff]` | Barre de crédits de la période | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | Rapports sur votre usage (comptes seuls) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | Avis pour votre clé | `holding notify list` |

## Offre et crédits

| Commande | Rôle | Exemple |
|---|---|---|
| `holding credit show` | Vos crédits | `holding credit show` |
| `holding billing \| billing usage [days]` | Offres, la vôtre et comment évoluer | `holding billing` |

## Retour

| Commande | Rôle | Exemple |
|---|---|---|
| `holding feedback "<text>"` | Envoie un retour | `holding feedback "the inbox is great"` |

## Mise à jour

| Commande | Rôle | Exemple |
|---|---|---|
| `holding update` | Met à jour le client, les commandes et le Jira Listener | `holding update` |

Voir aussi : [Compétences](../SKILLS.md). Lancez `holding help` pour voir ce que votre clé permet.


## codegraph

```bash
holding codegraph list|detect|status|use <name>|clear
```

Auto-detect PATH/MCP/index; 0→prism, 1→silent, several→ask once per company.

## dependency

Ajoutez un dépôt git skill-pack pour que tous les agents puissent le lire. Le pack est cloné hors du projet (`~/.agents-holding/packs/<name>`) ; la company ne stocke qu’une référence.

```bash
holding dependency add <git-url>
holding dependency list
holding dependency update <name|url>
holding dependency remove <name|url>
holding dependency consent <name>
holding dependency run <name> <script>
```

Skills/commandes du pack adaptées pour Grok, Claude, Codex et l’IA locale. Les scripts exigent un consent.

