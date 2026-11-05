MCP alone is enough without the local CLI (AI tokens). CLI = optional zero-token. First ask per key+device; No = no-cli, never ask again on that device.

# agents-holding

[English](../README.md)

Dirigez une petite entreprise d'IA dans votre agent de code : un CEO, du staff, des processus et Jira, le tout depuis le chat.

## Introduction

agents-holding transforme votre agent de code IA (Claude Code, Codex, Cursor ou le CLI `grok`) en holding de petites entreprises. Chaque entreprise a un CEO à qui parler, un staff aux rôles clairs (ingénieur, QC, produit…) et un workflow qui fait avancer de vraies tâches Jira de l'idée jusqu'à la pull request fusionnée. Ajoutez un serveur MCP, connectez-vous, c'est prêt.

## Ce que ça fait

- **Entreprises et staff** : créez des entreprises, recrutez ou licenciez des rôles, définissez règles, modèles et skills pour chacun.
- **Un CEO dans le chat** : `/ceo` planifie le travail, découpe les tâches et les confie aux bonnes personnes.
- **Processus** : les processus et workflows de l'entreprise décident qui fait quoi à chaque étape (humain, IA ou script).
- **Jira Listener** : un processus local qui surveille votre tableau Jira, lance le bon membre du staff quand une carte change de colonne, puis rend compte sur la carte.
- **Usage et crédits** : consultez à tout moment votre formule, la barre de crédits et l'usage par membre du staff.

## Avantages

1. **Le workflow avant tout.** Pas un énième assistant de chat : un flux complet entreprise → staff → processus → Jira Listener, pour que le travail avance seul de la carte au plan, au développement puis à la revue.
2. **Commandes sans tokens.** Les commandes qui renvoient seulement des données (`/holding key show`, `/holding staff list`, `/holding usage` …) sont traitées instantanément par un hook sur votre machine ; le message n'atteint jamais le modèle.
3. **Une seule configuration pour tous les agents.** Les mêmes commandes fonctionnent dans Claude Code, Codex et le CLI `grok`.
4. **Vos données restent chez vous.** Les outils que vous connectez (Jira, Git, fichiers) tournent sur votre machine ; les keys sont dans le Keychain, jamais dans des fichiers de configuration.
5. **Des prix justes.** Seules les actions qui créent du travail coûtent des crédits ; les tokens du modèle ne sont jamais facturés.

```
entreprise  →  staff  →  processus  →  Jira Listener  →  plan → développement → revue → terminé
```

## Installation

Ajoutez le serveur MCP, connectez-vous, c'est tout. Choisissez votre agent :

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

Ouvrez ensuite votre agent, authentifiez `agents-holding` dans le navigateur (créez une key Free ou importez la vôtre) et envoyez n'importe quel message à agents-holding. Au premier message, l'agent installe pour vous les commandes locales ; s'il vous le demande, validez une seule fois. Guide complet : [SETUP](../full/localized/SETUP.fr.md).

## Commandes courantes

| Commande | Rôle |
|---|---|
| `/holding help` | Toutes les commandes de votre key |
| `/holding key show` | Key id, formule, crédits, appareils |
| `/holding company create` | Créer une entreprise |
| `/holding staff list` | Lister votre staff |
| `/ceo …` | Parler au CEO : planifier, découper et confier le travail |
| `/holding usage` | Barre de crédits de la période |
| `/holding billing` | Formule actuelle et comment en changer |
| `/holding feedback "<text>"` | Envoyer un avis au propriétaire |
| `/holding update` | Mettre à jour le client local |

Fonctionne de la même façon dans Claude Code, Codex et le CLI `grok` (Codex demande une fois de faire confiance au hook). Liste complète : lancez `holding help`.

→ [COMMANDS.md](../docs/localized/COMMANDS.fr.md) · [SKILLS.md](../docs/localized/SKILLS.fr.md)

## Documentation

- [COMMANDS.md](../docs/localized/COMMANDS.fr.md)
- [SKILLS.md](../docs/localized/SKILLS.fr.md)
- [Guide d'installation](../full/localized/SETUP.fr.md)
- [Tarifs](../docs/localized/PRICING.fr.md)
- Référence des commandes : lancez `holding help` (ou `holding help <groupe|commande>`)
- [Entreprises](../docs/localized/COMPANIES.fr.md) · [Fournisseurs](../docs/localized/PROVIDERS.fr.md) · [Politique du personnel](../docs/localized/STAFF-POLICY.fr.md) · [Qui décide quoi](../docs/localized/WHO-DECIDES.fr.md) · [Résilience](../docs/localized/RESILIENCE.fr.md)

**Confidentialité.** Nous ne collectons pas vos informations. Nous enregistrons seulement des habitudes d'usage (vos heures de travail habituelles, chat ou commentaires, la configuration de vos outils). Tous les outils que vous connectez et les données de votre machine restent sur votre machine.
