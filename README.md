# JobScout

Trouvez des offres d'emploi grâce à un scan multi-plateformes, triez-les avec un score calculé sur votre vrai profil, et générez pour chacune un CV et une lettre de motivation d'une page (compatibles ATS), sans jamais inventer une compétence que vous n'avez pas.

Tout tourne sur votre machine : base SQLite locale, serveur limité à `127.0.0.1`, aucun compte à créer.

> Site et guide de démarrage : **https://latenightsbeats1208-pixel.github.io/jobscout/** — une version Pro (installeur Windows, crédits IA inclus) est en préparation.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind**
- **IA au choix** — Anthropic Claude (référence : Opus 4.8 pour la rédaction, Sonnet 5 pour la relecture), OpenAI, Google Gemini, Mistral, DeepSeek, Groq, OpenRouter, Ollama et LM Studio en local, ou tout serveur compatible OpenAI. Deux modèles par fournisseur : un de **rédaction** (extraction du CV, CV, lettre, message V.I.E) et un de **relecture** (relecture, traduction anglaise, réparation ciblée de la lettre). Couche commune : `lib/ai/llm.ts` ; catalogue : `lib/ai/providers.ts`.
- **Tests** : Vitest (`npm test`) et intégration continue GitHub Actions (types, tests, build sur Windows et Linux, Node 22 et 24)
- **SQLite** intégré (`node:sqlite`, WAL) + fichiers locaux
- **Scraping** : `fetch` + parsing DOM (`jsdom`) + JSON-LD `JobPosting` ; Playwright uniquement pour LinkedIn
- **@react-pdf/renderer** + **docx** pour les documents générés ; **xlsx** pour l'import/export des candidatures

## Installation

> **Première installation ? Suivez le [guide pas à pas](INSTALL.md)** : prérequis, durée de chaque étape (mesurée), messages normaux, ordinateur à laisser allumé ou non, problèmes fréquents.
>
> En résumé : **20 à 35 minutes au total, dont 10 à 15 devant l'écran**. `npm ci` prend environ 1 minute et le premier scan 10 à 20 minutes, pendant lesquels l'ordinateur doit rester allumé (hors veille), le terminal ouvert.

Requiert **Node ≥ 22.13** (module `node:sqlite` sans drapeau expérimental ; Node 24 convient). Au démarrage, Node affiche `ExperimentalWarning: SQLite is an experimental feature` : c'est normal et sans effet.

```bash
git clone https://github.com/latenightsbeats1208-pixel/jobscout.git
cd jobscout
npm ci
npm run dev
```

L'app démarre sur http://127.0.0.1:3000 (écoute limitée à la machine locale, rien n'est exposé au réseau). Sous Windows, `scripts/Start-JobScout.ps1` lance le serveur de développement et ouvre le navigateur.

**IA à configurer dès l'inscription** : l'onboarding lit votre CV avec un modèle d'IA pour créer le profil. Dans l'écran « Génération IA », choisissez votre fournisseur et collez votre clé :

| Fournisseur | Clé | Remarque |
|---|---|---|
| Anthropic (Claude) | https://platform.claude.com | référence de JobScout, meilleure fidélité au profil ; les modèles récents qui refusent l'appel d'outil forcé (Opus 5.5, Sonnet 5.5) passent d'eux-mêmes en mode « auto » |
| OpenAI | https://platform.openai.com/api-keys | GPT-6 Sol / Luna, raisonnement coupé (requis pour les réponses structurées en Chat Completions) |
| Google Gemini | https://aistudio.google.com/apikey | offre gratuite limitée |
| Mistral | https://console.mistral.ai/api-keys | fournisseur européen |
| DeepSeek | https://platform.deepseek.com/api_keys | très économique ; mode « thinking » coupé (requis pour l'appel d'outil forcé) |
| Groq, OpenRouter | console du fournisseur | Groq : offre gratuite très limitée (≈ 8 000 jetons/min) ; OpenRouter : une clé pour des centaines de modèles |
| Ollama, LM Studio | aucune clé | 100 % local et gratuit ; qualité selon le modèle (par exemple `gemma4:12b`, `qwen3.5:9b`, `ministral-3:14b`) ; réponse contrainte par le schéma JSON, ces serveurs ne sachant pas forcer un appel d'outil |
| Autre | selon le serveur | tout serveur au format OpenAI Chat Completions (URL de base à indiquer) |

« Charger la liste » propose les modèles disponibles chez le fournisseur, « Vérifier » teste la connexion. Les clés restent dans la base locale. Une adresse de serveur doit être en `https://`, sauf serveur sur la machine même (`http://127.0.0.1…`). Mode développement : une `ANTHROPIC_API_KEY` dans `.env` sert de repli si rien n'est configuré.

**LinkedIn (optionnel)** : c'est la seule source qui a besoin d'un navigateur Chromium. Activez-la dans Profil › Sources, puis cliquez « Installer le moteur LinkedIn » (~100 Mo à télécharger, ~265 Mo sur le disque). En ligne de commande : `npm run playwright:install`.

**Mises à jour** : `git pull` puis `npm ci`.

**Messages npm normaux** : `npm warn deprecated node-domexception`, « packages are looking for funding », et, avec npm récent, le script d'installation de `tesseract.js` ignoré (il n'affiche qu'un appel aux dons). `npm audit` doit afficher `found 0 vulnerabilities` (le PostCSS embarqué par Next.js est forcé en version corrigée via `overrides`). **Ne lancez jamais `npm audit fix --force`** : il installerait Next.js 16, incompatible.

## Paquet Windows

`npm run package` produit `installer/output/JobScout_Setup_<version>.exe` : un installeur autonome (Node 22 LTS embarqué, aucune dépendance sur la machine cible), avec launcher natif, données sous `%LOCALAPPDATA%\JobScout` et contrôle anti-fuite de données personnelles bloquant. Voir [`installer/README.md`](installer/README.md).

## Sources de scan (7 actives)

| Source | Méthode | Périmètre |
|--------|---------|-----------|
| Welcome to the Jungle | Index de recherche public Algolia du site (lecture seule, aucune page HTML) | International (filtré par pays cibles) |
| LinkedIn | Playwright (pages publiques « guest ») | International (tous pays cibles) |
| APEC | API `rechercheOffre` + page de détail | France (cadres) |
| HelloWork | HTML SSR + JSON-LD | France |
| France Travail | API officielle si `FT_CLIENT_ID` / `FT_CLIENT_SECRET` sont définis (https://francetravail.io), sinon HTML SSR | France |
| Talent.com | HTML SSR multi-domaines + JSON-LD | France, Belgique, Suisse, Luxembourg, Canada, USA, Maroc, Tunisie, Sénégal |
| Free-Work | API publique de recherche et de détail | Offres et missions IT, filtrées par pays cibles |
| Civiweb (V.I.E) | API Business France — **suspendue** : elle exige désormais une authentification que JobScout ne gère pas | International |

Chaque source s'active ou se désactive dans Profil › Sources (ou à l'étape Préférences de l'onboarding). Une source hors périmètre géographique (ex. APEC quand le profil ne cible pas la France) est automatiquement sautée. La disponibilité des sources dépend des sites tiers (anti-bot, changements d'API) ; une source en échec est signalée dans le journal du scan.

Pour un profil existant, activez Free-Work dans Profil › Sources. « Postuler » ouvre l'annonce sur Free-Work : la candidature est ensuite à finaliser sur ce site.

WTTJ est interrogée avec la clé de recherche publique (lecture seule) du site ; si elle change, fournissez `WTTJ_ALGOLIA_APP` / `WTTJ_ALGOLIA_KEY`.

## Scoring des offres (local, déterministe, gratuit)

`lib/scoring/local.ts` — critères exposés dans le détail de chaque offre :

- **Secteur** (30 %) — titre et description comparés aux secteurs cibles du profil
- **Compétences** (50 %) — une compétence ancrée dans une expérience pèse davantage qu'une compétence simplement listée
- **Pays** (20 %) — 100 si le pays de l'offre fait partie des pays cibles, 0 sinon ; neutre si l'offre n'a pas de pays ou si aucun pays cible n'est déclaré
- **Contrat** (±10) — selon les contrats recherchés du profil (`preferred_contracts`, par défaut CDI et CDD) : +10 si le contrat de l'offre en fait partie, neutre s'il est inconnu, −6 s'il est identifié mais non recherché
- **Bonus Langue** (jusqu'à +8) — +8 si l'offre est rédigée dans une langue maîtrisée (B2+) ; +2,4 si elle n'est pas en anglais mais que l'utilisateur maîtrise l'anglais
- **Bonus Durée V.I.E** (jusqu'à +5, V.I.E uniquement) — +5 pour 12–24 mois, +3 pour 6–11 mois

Aucun appel IA : instantané et illimité. Re-scoring global : `POST /api/offres/rescore` (après modification du profil).

## Extraction du CV

Cascade selon le type de fichier : PDF (`pdf-parse` ou `pdfjs-dist` multi-colonnes, meilleur retenu), DOCX (`mammoth`), image (`tesseract.js` FR+EN), TXT. Puis extraction structurée par Claude (tool use forcé), validation Zod, score de confiance et **garde-fou anti-hallucination** (suppression des entreprises et compétences non ancrées dans le profil).

## Génération de documents

`data/documents/…` — CV et lettre en PDF **et** DOCX, avec une boucle de rétrécissement qui garantit une page A4. Langue détectée par offre (français, ou anglais si l'annonce est en anglais). Relecture automatique : orthographe, affirmations non étayées par le profil. Message court (V.I.E) réservé aux offres V.I.E.

Coût : avec Claude (Anthropic), environ 0,12 à 0,20 $ par dossier (CV + lettre, relecture comprise) aux tarifs actuels, selon la longueur du profil et de l'offre. Avec un autre fournisseur, le coût suit ses tarifs ; en local (Ollama, LM Studio), il est nul. Le nombre de jetons de chaque appel est écrit dans le journal du serveur (`[llm] …`).

**Qualité selon le modèle** : les garde-fous anti-invention (validation contre le profil, limites de mise en page) s'appliquent quel que soit le modèle. Mais JobScout a été mis au point avec Claude : avec un autre modèle, relisez vos premiers documents. Si un modèle renvoie une réponse mal formée, JobScout tente un repli (mode JSON, extraction tolérante) avant d'afficher une erreur qui invite à choisir un modèle plus capable.

## Sécurité

- Serveur limité à `127.0.0.1` ; l'API refuse les requêtes venant d'un autre site ou d'un hôte non local (`middleware.ts`)
- Clés IA stockées dans la base locale, jamais renvoyées au navigateur (seuls les 4 derniers caractères sont affichés)
- Whitelist de colonnes sur la mise à jour des candidatures (anti mass-assignment)
- Bornage des chemins d'écriture du dossier documents ; ouverture de dossier restreinte au dossier configuré
- Descriptions d'offres assainies (DOMPurify) ; `rel="noopener noreferrer"` sur tous les liens sortants

## Gratuit ou Pro

| | Gratuit (ce dépôt) | Pro (en préparation) |
|---|---|---|
| Scan 7 sources + scoring local | illimité | illimité |
| CV / lettre / message IA | avec **votre** clé (fournisseur au choix) ou un modèle local | crédits inclus via le relais JobScout, sans clé |
| Installation | Node ≥ 22.13 + `npm ci` | installeur Windows autonome |
| Mises à jour | `git pull` | notification dans l'application |

Le code est identique : la version Pro n'aura aucune fonction cachée. Modes IA (`lib/ai/client.ts`) : `byok` (votre clé ou votre modèle local, fournisseur au choix) ; `pack` (licence → relais), proposé uniquement quand un relais est configuré par `JOBSCOUT_PROXY_URL` ; `unset` (rien de configuré : l'onboarding reste bloqué à l'import du CV).

## Tests

```bash
npm test            # tests automatiques (Vitest) : couche IA, fournisseurs, configuration, génération de bout en bout
npm run typecheck   # vérification des types
```

Les tests n'utilisent ni clé ni réseau : un faux serveur compatible OpenAI rejoue la génération complète (prompts, validation anti-invention, relecture). GitHub Actions les lance à chaque push et pull request (`.github/workflows/ci.yml`).

Test réel optionnel avec votre propre fournisseur (appels facturés par lui, quelques centimes) :

```bash
JOBSCOUT_LIVE=1 JOBSCOUT_LIVE_PROVIDER=openai JOBSCOUT_LIVE_KEY=sk-... npx vitest run tests/live
```

## Licence

MIT — voir [`LICENSE`](LICENSE). Les marques des sites scannés appartiennent à leurs propriétaires ; JobScout n'est affilié à aucun d'eux.
