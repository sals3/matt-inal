# 🌅 Le Matt'inal

Le quiz du standup de l'équipe de Matt. Matt prépare ses questions, les partage dans Teams, et **tout le monde répond en même temps sur son écran** : plus besoin de lever la main, et la bonne réponse compte plus que la vitesse.

## Ce qu'il y a dedans

- **Joueurs** : code d'équipe + nom + avatar la première fois, puis la page suit la partie en direct (WebSocket).
- **7 types de questions** : choix multiple, zoom mystère (l'image dézoome avec le chrono), le plus proche, majorité l'emporte, rébus emoji, vrai ou faux, et le **Mercredi musical** (titre + artiste, orthographe approximative acceptée, indices qui se débloquent).
- **Pointage** : 1 000 pts pour la bonne réponse, bonus vitesse plafonné à 200, points doubles au besoin.
- **Espace Matt** (`#/matt`, protégé par NIP) : planning des 10 prochains jours, éditeur avec image de fond collée au Ctrl+V, aperçu téléphone, extrait audio pour le Mercredi musical.
- **Écran d'animation** (`#/animer`) : à partager dans Teams. Lobby, questions, révélation avec les votes de chacun, podium avec confettis, réactions emoji de l'équipe, bonus arbitraire « +100, c'était drôle ».
- **Classement** (`#/classement`) : saison en cours, mouvements, séries 🔥, % cerveau, Matt contre l'équipe.
- **La Coupe** : une plaque gravée par saison. Les saisons 1 et 2 (avant l'app) sont prêtes à graver dans `#/equipe`. Quand Matt termine une saison, le premier du classement est gravé et la suivante commence.
- **Champion en titre** : anneau doré animé et couronne autour de sa photo, partout dans l'app.
- **Caricatures** : chaque joueur téléverse sa photo dans son profil, ou Matt le fait pour toute l'équipe dans `#/equipe`.
- **Stickers de l'équipe** : tout le monde ajoute ses stickers (PNG détourés) et les lance à tout le monde ou sur quelqu'un (« Julie → Kevin »). Matt fait le ménage dans `#/equipe`.
- **Mode 100 % cerveau** : l'IA est permise, mais quitter le quiz pendant une question, avant d'avoir répondu, s'affiche en direct (🤖) et coûte le bonus vitesse et la prime cerveau (+100). En « cerveau strict » (case dans l'éditeur), ça donne 0.
  - Compte : changer d'onglet ou réduire le navigateur pendant 2 s, ou passer à une autre fenêtre (ChatGPT, Copilot…) pendant 4 s.
  - Ne compte pas : sortir la souris de la page, ou un clic rapide dans Teams pour se démuter. Si la question arrive pendant qu'on regarde Teams, on a 8 s pour revenir.
  - Limite : un cell ou un 2e ordinateur à côté reste invisible pour l'app.
- **Power-ups « Mario Kart »** : chaque lundi, une boîte à items selon le classement. Plus t'es bas, plus elle est garnie :
  | Rang | Boîte |
  |---|---|
  | 1er | 👑 Couronne lourde : bonus vitesse divisé par deux toute la semaine |
  | Tiers du haut | 🎯 50/50 |
  | Milieu | 🎯 50/50, ⏸️ Gel du chrono (le bonus vitesse ne baisse pas pendant 10 s) |
  | Tiers du bas | + 🍄 Double ou rien (×2 si bonne réponse, −300 sinon) |
  | Dernier | + 💙 Carapace bleue : le premier perd son bonus vitesse pour la question |

  Un seul power-up par question, annoncé en direct à toute l'équipe. Matt peut redistribuer les boîtes dans `#/equipe` (après une fin de saison, par exemple).
- **Boîte à questions** : n'importe qui propose une question ; Matt l'ajoute à un quiz depuis l'éditeur. L'auteur ne peut pas y répondre, mais gagne 300 pts si 30 à 70 % de l'équipe trouve.
- **Trophées de la semaine** : ⚡ Le Flash, 🥈 Le Roi du presque, 🎯 Le Métronome, 🧠 Le Cerveau, 🚀 La Remontée, 💙 Le Saboteur, 🏮 La Lanterne rouge.
- **Applaudimètre** : après chaque Mercredi musical, l'équipe note Matt sur 5 étoiles ; ses meilleures performances entrent dans son palmarès.
- **Code de récupération** : trois mots et un nombre (« tuque-bleuet-castor-42 ») dans le profil, pour se reconnecter sur un autre appareil. Matt peut le retrouver dans `#/equipe`.

## Pile technique (légère et un brin expérimentale)

| Morceau | Choix |
|---|---|
| Serveur, WebSocket, bundling du front | [Bun](https://bun.sh) tout seul (`Bun.serve` + import HTML), pas d'Express ni de Vite |
| Interface | React 19 |
| Base de données | SQLite intégré à Bun (`bun:sqlite`), un seul fichier |
| Sauvegarde | [Litestream](https://litestream.io) réplique SQLite vers Azure Blob en continu |
| Hébergement | Azure Container Apps, 0 à 1 réplique (s'éteint quand personne ne joue) |

## En local (WSL)

```bash
bun install
cp .env.example .env        # change TEAM_CODE et ADMIN_PIN
bun run dev                 # http://localhost:3000
```

- Tests du pointage : `bun test`
- Vérification des types : `bun run typecheck`
- Partie complète automatisée contre un serveur qui roule : `ADMIN_PIN=… bun scripts/smoke.ts`
- Répéter un quiz sans l'équipe (joueurs robots) : `bun scripts/bots.ts 6`

## Déployer sur Azure

```bash
SUBSCRIPTION="Visual Studio Professional - SALS3" ADMIN_PIN=xxxx TEAM_CODE=XXXX ./infra/deploy.sh
```

Le script crée tout dans le groupe `rg-matt-inal` (Canada Central), construit l'image dans Azure et affiche l'URL. Relance la même commande pour déployer une nouvelle version.

**Coût estimé : environ 7 à 8 $ CA par mois**, presque entièrement pour le registre d'images. Container Apps reste dans le crédit gratuit mensuel pour une équipe de 11 personnes.

**Démarrage à froid** : l'app s'éteint quand personne ne l'utilise. La première visite du matin prend 10 à 20 secondes. Matt n'a qu'à ouvrir l'écran d'animation une minute avant le standup.

Tout supprimer : `az group delete -n rg-matt-inal --subscription "Visual Studio Professional - SALS3"`.

## Pour la suite (V2)

- Idées de questions générées par l'IA selon un thème
- Connexion avec le compte Microsoft (demande une inscription d'app par l'IT)

> Le test de bout en bout (`scripts/smoke.ts`) termine la saison en cours : il refuse de tourner ailleurs qu'en local.
