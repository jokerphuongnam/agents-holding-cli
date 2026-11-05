# Installer agents-holding (MCP uniquement)

[English](../SETUP.md)

Pas de `curl | bash` pour commencer, aucun script à télécharger. Ajoutez le serveur MCP à votre agent, connectez-vous avec OAuth dans le navigateur, puis répondez **oui une seule fois** quand votre agent propose d'installer le client local.

URL du MCP:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. Ajouter le serveur MCP (une commande)

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Agent CLI par défaut (commande `grok`)**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

ou dans `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. Connexion OAuth (navigateur)

Ouvrez votre agent → connectez / Authenticate `agents-holding`. Une page s'ouvre : **Create key** (Free, pour cette machine) ou **Import key** si vous en avez déjà une. La key n'est jamais stockée dans le fichier de configuration de l'agent ; la session OAuth se renouvelle automatiquement.

## 3. Installer le client local (une validation, au premier message)

Lors de votre **premier** message à agents-holding (par exemple `/holding key show`), les premières lignes de la réponse sont une demande d'installation. Votre agent s'arrête et demande une seule fois :

> Installer le client local agents-holding sur cette machine ? Il ajoute la commande `holding`, les commandes slash /holding natives et un hook instantané (sans IA). Peut être relancé sans risque ; le Jira Listener n'est pas installé maintenant.

Répondez **oui**. L'agent appelle l'outil `install` et exécute **une** commande shell, avec la progression `[bootstrap 1/5]` … `[bootstrap 5/5]` :

1. Scripts du client dans `~/.agents-holding`
2. `holding` dans votre PATH (`~/.local/bin`)
3. Identifiant d'appareil dans le Keychain (aucun secret affiché)
4. Associe cette machine à votre session d'agent avec un code à usage unique (10 minutes ; votre key n'est jamais affichée), puis installe les commandes slash et le hook instantané
5. Terminé ; le serveur sait que cette machine a le client, la demande d'installation disparaît

Si l'agent ne vous a rien demandé, tapez : `install agents-holding` (ou `/holding install`). Peut être relancé sans risque.

Cette étape n'installe **pas** le Jira Listener.

**Ouvrez une nouvelle session d'agent** après l'installation pour charger les nouvelles commandes.

## 4. Dans le chat : instantané, zéro token d'IA

Après l'installation, les commandes qui renvoient seulement des données sont traitées localement par le hook ou votre shell. Le message n'atteint jamais le modèle :

| Agent | Comment `/holding key show` s'exécute |
|---|---|
| CLI `grok` | `/holding key show`: le hook UserPromptSubmit (`~/.grok/hooks/agents-holding.json`) répond instantanément |
| Claude Code | `/holding key show`: le hook UserPromptSubmit de `~/.claude/settings.json` répond instantanément |
| Codex CLI | `/holding key show` : le hook UserPromptSubmit de `~/.codex/hooks.json` répond instantanément (Codex demande une fois de faire confiance au nouveau hook) ; `!holding key show` fonctionne aussi |
| N'importe quel terminal | `holding key show` |

Chaque réponse instantanée se termine par `(agents-holding: instant, no model)`.

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

Les commandes qui ont besoin de l'agent (`/ceo`, `/task add`, `/flow edit`, `/jira setup`, `/skill add`) passent volontairement par le modèle.

### Envoyer un avis

```
/holding feedback "<text>"
```

Envoyez votre avis directement depuis le chat (zéro token d'IA). Seul le propriétaire le lit.

## 5. Jira (seulement si nécessaire)

Quand une commande ou un agent a vraiment besoin de Jira (lire des tâches, joindre des fichiers, déplacer des colonnes, démarrer le Listener) :

1. L'agent vous demande, puis lance `holding jira connect` (OAuth dans le navigateur ; token dans le Keychain ; le chat affiche seulement le nom du compte)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (processus local), seulement si nécessaire: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

Installer le MCP, créer une entreprise et les commandes hors Jira ne demandent **jamais** de connexion à Jira.

## 6. Mettre à jour

Dans le chat : `/holding update` (ou demandez à l'agent de lancer `holding update`). Peut être relancé sans risque.

---

## 7. Formules et tarifs (crédits)

Grille tarifaire : **[PRICING.md](../../docs/PRICING.md)** : crédits par mois, prix, limites de staff et d'appareils, coût des actions, comment changer de formule.

Pour changer de formule, envoyez votre **key id** (via `holding key show` ; jamais la key elle-même) au propriétaire : **phuongnamp99@gmail.com**. `holding billing` et `holding key show` affichent toujours le contact actuel.

Sur votre machine: `holding billing` · `holding usage`.

---

## Annexe : installation par script (déconseillée)

Uniquement si l'agent ne peut pas lancer l'installation (environnements particuliers). Ce n'est pas le parcours habituel.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

Les anciens scripts `connect.sh` / `install.sh` restent dans le dépôt pour compatibilité ; la nouvelle documentation ne les utilise **pas**.
