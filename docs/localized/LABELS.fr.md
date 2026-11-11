# Libellés Jira d’Agents Holding

Les libellés servent à l’affichage et au routage. L’état Jira, le checkpoint
et les preuves authentifiées restent la source de vérité.

| Libellé | Signification | Ajouté quand |
|---|---|---|
| `ah-flow:<name>` | Modèle de workflow | Création ou changement du flux |
| `staff:<role>` | Staff du stage courant | Début d’un stage |
| `ah-agent-owned` | Holding coordonne la tâche | Début du traitement automatique |
| `agent-working` | Un worker est actif | Avant le dispatch |
| `ah-awaiting-user` | Action utilisateur requise | Login, permission, terminal ou approbation nécessaire |
| `ah-blocked` | Remediation automatique impossible | Blocage réel retourné à l’utilisateur |
| `ah-registration-required` | Routage invalide | Repo/projet impossible à router |
| `terminal-<slug>` | Commande terminal de QC | Terminal enregistré sélectionné |

Les libellés temporaires sont nettoyés au prochain reconcile. Un terminal
occupé est une file d’attente, pas un blocage ni un échec QC.
