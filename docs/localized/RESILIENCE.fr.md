# Résilience : que se passe-t-il quand quelque chose casse

[English](../RESILIENCE.md)

Le Jira Listener gère trois types de panne sans perdre de travail. Il n’invente jamais d’événements Jira.

## 1. Compactage de l’agent / perte de contexte / arrêt en cours → point de reprise + reprise
- Chaque étape écrit un point de reprise dans `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`. Il enregistre l’étape, les pas terminés, les sous-pas de coding faits, le dernier commit et toute erreur.
- Les grands tech plans sont codés en jusqu’à 3 sous-pas. Chacun se termine par un commit `WIP(<KEY>) n/3` sur `feature/<KEY>`, et la carte reçoit une note 📌 listant le fait (✅) et le reste (⏳).
- Une relance (`holding staff run <KEY>` ou un nouveau déplacement de carte) reprend depuis le point de reprise. Plans, tech plans et sous-pas terminés ne sont pas refaits.
- Si la CLI agent signale compactage, troncature, débordement de contexte ou limite de tours, l’appel est retenté une fois dans une session neuve avec une note de reprise.

## 2. Agent expiré / indisponible → `agent-blocked` + secours
- Le code de sortie et la sortie de chaque CLI sont classés : login expiré, plus de crédits/quota, limitation de débit, CLI absente, contexte perdu ou délai dépassé.
- **Limitation de débit :** nouvel essai automatique avec backoff (30s → 60s → 120s).
- **Secours :** ajoutez une liste `fallback` par membre du personnel dans `state/<company>/agents.jsonc`. Sur erreur de login, quota, CLI absente ou débit, la commande suivante est utilisée automatiquement et la carte note le basculement.
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **Quand rien ne marche :**
  - La carte reçoit le libellé `agent-blocked` et un commentaire dans la langue de la tâche avec la cause, la commande et la correction exacte (`claude login`, `codex login`, `grok login`, installer la CLI, vérifier les crédits).
  - Vous recevez une notification macOS et `holding status` affiche le blocage.
  - Le libellé est retiré à la prochaine exécution réussie.

## 3. Problèmes du serveur MCP (panne, quota, surcharge, timeout) → avertissement + réconciliation
- Le Jira Listener détecte une connexion perdue, des réponses 5xx/surcharge, des timeouts et des erreurs de quota. Il journalise un avertissement rouge, envoie une notification et `holding status` l’affiche. Le travail se met en pause et le point de reprise est conservé.
- Au retour de la connexion (et à chaque démarrage du listener), il lit dans Jira les issues mises à jour depuis le dernier événement vu. Il rejoue chaque statut réel une fois, dédupliqué par issue + status + heure de mise à jour en local et sur le serveur MCP. La relecture ne lit que Jira et n’écrit jamais d’événements.
- Les commandes en lecture seule (`holding status`, `board`, `tasks`, `usage`, …) montrent la dernière bonne réponse marquée **STALE** avec son heure. Les écritures échouent clairement.
- Les erreurs de quota affichent : "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

Tests : `node tests/resilience_test.mjs` utilise des CLI simulées qui échouent (auth, expiration, quota, débit, compactage, absence) et un serveur MCP simulé qui renvoie 503/429.

## 4. Le Jira Listener s’arrête → avertissement immédiat, rien n’est perdu

**Le Jira Listener fait tourner toute l’automatisation Jira** (mouvements de carte, commentaires, exécutions du personnel). Quand il est éteint, rien ne se passe sur Jira jusqu’à ce que vous le relanciez, donc vous êtes prévenu aussitôt :

- **Arrêt propre / quitter / déconnexion** (SIGTERM, SIGINT, SIGHUP, `launchctl bootout`) : le listener dit « stopped » au serveur MCP avant de sortir (~1 s).
- **Crash, veille ou gel** : battement toutes les 60 s ; après 150 s sans, le serveur MCP le marque hors ligne.
- **Watchdog local** (job launchd `com.agentsholding.listener-watchdog`, installé avec `holding listener start` / `autostart on`) : vérifie toutes les 5 s et affiche une notification macOS *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"* (rappel toutes les 15 min), *"Jira Listener restarted"* après un crash relancé par launchd, et *"running again"* au retour. Journal : `~/Library/Logs/agents-holding/watchdog.log`.
- `holding status`, `holding listener status` et `/ceo` commencent par le même avertissement rouge pendant l’arrêt ; la boîte CEO reçoit un élément « Jira Listener is off ».
- **Changements Jira pendant l’arrêt** : le premier changement de chaque carte reçoit UN commentaire (dans la langue de la tâche) indiquant que le Jira Listener était éteint et comment le démarrer. Au retour, le drapeau est effacé, l’élément hors ligne se ferme, et les changements manqués sont rejoués (réconciliation) ; les exécutions inachevées reprennent depuis leur point de reprise.
- Une relecture qui dit seulement « la carte est encore dans la colonne dont l’agent la sort » est ignorée (pas de faux « vous l’avez remise »).

## 5. Qui travaille sur une carte (assignee)

Quand un membre du personnel prend une tâche (au même moment que le libellé `staff:<id>`), l’assignee Jira de la carte devient le `jira_user` du membre (optionnel, dans `agents.jsonc` : accountId ou e-mail Jira) ou sinon le compte Jira auquel le Jira Listener est connecté. Le libellé staff reste. L’assignee est conservé sur needs-hire / needs-decision / blocked et sur Done.

## 6. Où vont les questions : boîte CEO, jamais une exécution bloquée

Tout ce qui a besoin de vous (question du personnel, décision 1/2/3, embauche, agent bloqué p. ex. par un login, porte d’approbation, arrêt QC, exécution échouée, « quel dépôt ? », Jira Listener éteint) devient UN élément en attente dans la **boîte CEO** et une notification macOS intitulée **Agents Holding** avec la clé de tâche, ce qu’il faut et comment répondre. Les exécutions du personnel n’attendent jamais une saisie : elles publient l’élément et sortent ; votre réponse reprend la tâche depuis son point de reprise.

- `holding inbox [--all] [KEY]` : éléments en attente, groupés par entreprise.
- `holding inbox reply KAN-12 2` : réponse rapide sans ouvrir de session (même effet qu’une réponse sur la carte ; rien n’est écrit dans Jira).
- `holding inbox dismiss <id|KEY>` : fermer un élément que vous n’avez pas besoin de traiter (rien n’est envoyé au personnel ni à Jira).
- `holding status` indique combien d’éléments de la boîte CEO sont en attente.
- Bouton **Open CEO** sur la notification, ou `holding ceo --item <id>` : ouvre une session CEO (nouvelle fenêtre Terminal) centrée sur cet élément.
- `/ceo` affiche d’abord les éléments en attente. Dans le dépôt d’une entreprise : cette entreprise seulement. Hors de toute entreprise : mode holding, attentes et progrès de toutes les entreprises, groupés ; résolvez depuis là. Approuvez avec `/approve`, déplacez/marquez terminé avec `holding jira move KAN-12 "Done"`.

**Réglage de communication** (par entreprise, `holding company set communication jira+chat|chat`, défaut `jira+chat`) :
- `jira+chat` : questions/décisions/progrès sont commentés sur la carte ET vont dans la boîte CEO ; répondez aux deux endroits.
- `chat` : pas de commentaires question/décision/progrès sur les cartes ; répondez avec `/ceo` ou `holding inbox reply`. Libellés, statut et assignee se mettent toujours à jour sur Jira.

## Clés et crédits

1. **Obtenir une clé.** Setup propose deux options : **Generate key** (une nouvelle clé Free pour ce Mac, 1 500 crédits par mois, une Free par machine, pour toujours) ou **Import key** (une clé que vous avez déjà). La clé est demandée en invite masquée et ne vit que dans le Keychain macOS.
2. **Clé perdue sur ce Mac ?** Relancez Generate key : la Free de cette machine est récupérée (mêmes crédits et historique, nouveau secret ; l’ancienne cesse de fonctionner). Clés payantes : Import key.
3. **Vérifier.** `holding key show` (id de clé, plan, crédits, machines), `holding credit show`, `holding billing`. Pour monter de plan ou ajouter des crédits, envoyez votre id de clé (jamais la clé) au propriétaire. Grille tarifaire : [PRICING.md](../PRICING.md) (aussi liée depuis `holding billing`).
4. **Plans (crédits par mois).** Free 1 500 · Starter 4 000 · Lite 6 000 · Pro 20 000 · Power 80 000 · Max 180 000 · Ultra 300 000 · Marketplace 20 000 pour $10 · Enterprise sur mesure — détails dans [PRICING.md](../PRICING.md).
5. **Ce qui coûte.** next action 2 ; advance, mises à jour Jira, staff brief, record artifact, assign, CEO, inbox post / reply 1 chacun. Tout le reste est gratuit ; les jetons modèle ne sont jamais comptés.
6. **Crédits supplémentaires** du propriétaire : pour la période, jusqu’au renouvellement de la clé (conservés 90 jours au plus), ou jusqu’à épuisement (ils survivent à l’expiration mais ne marchent que tant que la clé est active).
7. **Plus de crédits ou expirée.** Le Jira Listener s’arrête avec "Key is no longer valid or out of credits; contact the owner to renew or add credits". Les changements Jira entre-temps ne sont pas rejoués ; après renouvellement le Jira Listener réconcilie l’état actuel de chaque carte ouverte.

## Plan Enterprise (prévu ; phase suivante)

**Clés et crédits sont en production** (voir la section ci-dessus) ; les fonctions d’équipe ici sont la phase suivante. Fonctionnement de la version équipe :

- **Seule la clé saisie décide de votre plan et rôle** ; pas de connexion ni de sélecteur de rôle séparés. Rôles :
  - **admin** : propriétaire de la plateforme.
  - **personal user** : plan personnel.
  - **enterprise owner** : clé émise par l’admin ; génère, révoque, renouvelle et gère les clés uniquement dans sa propre enterprise, jamais le pool partagé/personnel ni d’autres enterprises.
  - **enterprise employee** : clé générée par son enterprise owner.
- **Un tableau partagé par entreprise** ; un serveur CLI partagé peut faire tourner l’automatisation Jira de toute l’entreprise.
- **Personnel mappé à de vrais utilisateurs Jira** (`jira_user`) avec rôles/permissions, et audit de qui a pris / changé quoi.
- **Piloté par assignee** : chacun fait tourner son propre Jira Listener ; quand l’assignee d’une carte passe à son utilisateur Jira, son listener la prend avec son personnel.
- **Chat d’abord** : on parle via `/ceo` ou le chat du personnel ; les commentaires Jira sont optionnels (réglage de communication). L’entrée principale est `/ceo KAN-12` : le CEO charge la tâche et coordonne le personnel.

