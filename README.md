# 🌅 Le Matt'inal

Le quiz du standup de l'équipe de Matt. Matt prépare ses questions, les partage dans Teams, et **tout le monde répond en même temps sur son écran** : plus besoin de lever la main, et la bonne réponse compte plus que la vitesse.

## Ce qu'il y a dedans

- **Joueurs** : code d'équipe + nom + avatar la première fois, puis la page suit la partie en direct (WebSocket).
- **7 types de questions** : choix multiple, zoom mystère (l'image dézoome avec le chrono), le plus proche, majorité l'emporte, rébus emoji, vrai ou faux, et le **Mercredi musical** (titre + artiste, orthographe approximative acceptée, indices qui se débloquent).
- **Pointage** : 1 000 pts pour la bonne réponse, bonus vitesse plafonné à 200, points doubles au besoin.
- **Espace Matt** (`#/matt`, protégé par NIP) : planning des 10 prochains jours, éditeur avec image de fond collée au Ctrl+V, aperçu téléphone, extrait audio pour le Mercredi musical.
- **Écran d'animation** (`#/animer`) : à partager dans Teams. Lobby, questions, révélation avec les votes de chacun, podium avec confettis, réactions emoji de l'équipe, bonus arbitraire « +100, c'était drôle ».
- **Classement** (`#/classement`) : saison mensuelle, mouvements, séries 🔥, Matt contre l'équipe, temple de la renommée.

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

- Power-ups « Mario Kart » (50/50, Double ou rien, Gel du chrono, carapace bleue pour le dernier)
- Boîte à questions de l'équipe
- Idées de questions générées par l'IA selon un thème
- Trophées hebdomadaires (Le Flash, La Remontée, Le Roi du presque…)
- Applaudimètre et palmarès des performances de Matt au Mercredi musical
- Connexion avec le compte Microsoft (demande une inscription d'app par l'IT)
