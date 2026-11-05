# Tarifs agents-holding (crédits)

[English](../PRICING.md)

Formules de crédits, limites, coût de chaque action et comment passer à une formule supérieure. Pas de paiement dans l'app : pour changer de formule, contactez le propriétaire avec votre **key id**.

Voir votre formule sur votre machine: `holding billing` · `holding usage` · `holding key show` (affiche uniquement le key id, jamais le secret)

---

## Formules de crédits (mensuelles)

| Formule | Crédits / mois | Prix | Canal |
|---|---:|---:|---|
| free | 1,500 | $0 | direct |
| starter | 4,000 | $2 | direct |
| lite | 6,000 | $2.5 | direct |
| pro | 20,000 | $7.5 | direct |
| power | 80,000 | $25 | direct |
| max | 180,000 | $50 | direct |
| ultra | 300,000 | $75 | direct |
| marketplace | 20,000 | $10 | marketplace |
| enterprise | sur mesure | nous contacter | contacter le propriétaire |

- Seules les keys **mesurées** (avec une formule de crédits) consomment des crédits. Les anciennes keys sans mesure fonctionnent comme avant.
- **enterprise** : crédits, sièges et appareils selon accord. **Contactez** le propriétaire.
- Formule marketplace : achetée via la marketplace. Pour le détail de la commande, **contactez** le propriétaire.

---

## Limite de staff (par entreprise)

Nombre maximal de membres du staff dans l'effectif d'une entreprise, CEO compris. S'applique quand vous ajoutez, déplacez ou affectez du staff, migrez ou créez une entreprise. La key du propriétaire n'a pas de limite.

| Formule | Staff max / entreprise |
|---|---:|
| free | 5 |
| starter | 10 |
| lite | 15 |
| pro | 25 |
| marketplace | 25 |
| power | 40 |
| max | 60 |
| ultra | illimité |
| enterprise | illimité |

Anciennes keys **sans** formule de crédits : trial 20 · monthly 30 · yearly 50 · sinon 30.

À la limite, vous verrez : *« Vous avez atteint la limite de N membres du staff de la formule X. Licenciez d'abord un membre du staff ou passez à une formule supérieure. »*

---

## Limite d'appareils (machines)

| Élément | Valeur |
|---|---|
| Par défaut par key | **1** appareil |
| Maximum attribuable par le propriétaire | **1 à 50** appareils par key |
| Key Free créée sur une machine | **une** key Free par machine |
| enterprise | appareils par key selon accord : **contactez-nous** |

Plus de place pour un appareil ? Demandez au propriétaire d'augmenter votre limite, puis réessayez sur la nouvelle machine. `holding key show` affiche appareils utilisés/max.

---

## Coût en crédits par action

Seules les actions ci-dessous, qui créent du travail, coûtent des crédits. Tout le reste (heartbeat, synchro temps réel, status, billing, liste de l'inbox, key, admin, la plupart des commandes CLI) est **gratuit**.

| Action | Crédits |
|---|---:|
| Exécution de l'agent (`next_action`) | **2** |
| `advance` | 1 |
| `jira_ops` | 1 |
| `staff_brief` | 1 |
| `record_artifact` | 1 |
| `assign` (y compris `holding task set …`) | 1 |
| `ceo` | 1 |
| `inbox_post` / `inbox_reply` | 1 |

**Les tokens du modèle ne sont jamais facturés en crédits.**

### Envois de fichiers (pièces jointes Jira / export Figma / Confluence)

**1 crédit par fichier, plus 1 crédit par tranche de 10 Mo au-delà des 5 premiers Mo**, **plafonné à 5 crédits par fichier**.

Exemples: 0.4 MB → 1 · 25 MB → 3 · 300 MB → 5.

Les fichiers vont directement de votre machine vers Jira, Confluence ou Figma ; le serveur mesure seulement la taille pour compter les crédits.

---

## Changer de formule ou ajouter des crédits

1. Récupérez votre **key id** (n'envoyez jamais la key secrète) : `holding key show`, ou la ligne « To upgrade » de `holding billing` / `holding usage`.
2. Envoyez le key id au **propriétaire** (**phuongnamp99@gmail.com**) avec la formule souhaitée, ou le nombre de crédits supplémentaires nécessaires pour cette période.
3. **Pas encore de paiement dans l'app.** Quand il arrivera, le changement de formule suivra le même parcours ; cette grille reste la référence.

Plus de crédits ou key expirée : le Jira Listener s'arrête et vous invite à contacter le propriétaire pour renouveler ou ajouter des crédits.

---

## Consultation rapide sur votre machine

```bash
holding billing          # formule actuelle + tarifs + ligne pour changer de formule
holding usage            # barre de crédits de la période (keys mesurées)
holding credit show      # solde de crédits
holding key show         # key id, formule, appareils
```

Installation / MCP: [full/SETUP.md](../../full/SETUP.md).
