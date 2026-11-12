# Site Suzalink — guide pour Claude

Ce dossier est le **site marketing de Suzalink** (suzalink.com), le CRM d'exécution outbound de
Suzali Conseil. Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Framer Motion. Tout le site
est en **français**, les prix en euros HT. Le README détaille la structure ; ce fichier fixe les
règles à respecter à chaque modification.

La personne qui travaille ici est l'équipe marketing (SEO, contenus, intégration de la marque,
UI). Explique ce que tu fais en français simple, sans jargon technique, et montre le résultat
(capture de la page) plutôt que le code.

## Où changer quoi

| Besoin | Fichier |
|---|---|
| Textes de l'accueil, section par section | `content/home.ts` |
| Nom, SEO (titre, description), pied de page, réseaux sociaux | `content/site.ts` |
| Menu principal (panneaux Produit, Solutions, Ressources) | `content/menu.ts` |
| Guides /guides/<sujet> (réponse directe en tête de section, liens [texte](/url)) | `content/pages/guides.ts` |
| Pages /guides, /secteurs, /a-propos | `content/pages/hubs.ts` |
| Visuels produit (PNG/WebP sans fond) | `public/visuals/` |
| Prix et offres du CRM | `content/pricing.ts` |
| Offres de prospection (sprint, mission, 100 % résultat) et garanties | `content/offers.ts` |
| Pages d'offre : /prospection-externalisee, /crm-agence-prospection, /tarifs | `content/pages/<page>.ts` |
| Pages secteur /secteurs/<cible> (une entrée = une page, sitemap inclus) | `content/pages/secteurs.ts` |
| Logos clients et outils cités | `content/brands.ts` (+ fichiers dans `public/logos/`) |
| Photos et leur texte alternatif | `content/images.ts` (+ fichiers dans `public/photos/`) |
| Page et formulaire de démo | `content/demo.ts` |
| Mise en page d'une section | `components/sections/<Section>.tsx` |
| Couleurs, typographie | `app/globals.css` (bloc `@theme`) |

Commence toujours par `content/` : la plupart des demandes (textes, SEO, offres) ne demandent
aucune modification de composant.

## Marque Suzalink (à respecter)

- **Logo** : uniquement les fichiers de `public/brand/` — `logo.png` sur fond clair,
  `logo-inverse.png` sur fond foncé, `mark.png` / `mark-inverse.png` (le « S ») pour les petits
  formats. Ne jamais redessiner, recolorer, étirer ou recadrer le logo. Toujours via le
  composant `components/brand/Logo.tsx`.
- **Couleurs** (jetons dans `app/globals.css`) :
  - teal foncé `#112F35` (jeton `navy`) : couleur principale, boutons, bandes sombres ;
  - menthe `#B9EDD6` (jeton `mint`) : accents sur fond foncé ;
  - jaune « étincelle » `#F6C227` (jeton `rose`, nom historique) : petits accents (points,
    pastilles de flèche, surlignages). **Jamais** de texte sur le jaune ni sur la menthe en fond
    clair : contraste insuffisant ;
  - papier `#F7F5F0` (fond), encre `#0C1F23` (texte), `muted` `#5B6B6E` (texte secondaire).
- Utilise les classes de jetons (`bg-navy`, `text-ink`, `bg-rose`…), jamais une couleur en dur
  (`bg-[#…]`) dans un composant.
- **Typographie** : titres en Bricolage Grotesque (léger, interlettrage serré), texte en Geist,
  eyebrows en Geist Mono majuscules. Ne pas ajouter d'autre police.
- **Ton** : français, direct, concret, vouvoiement. Chaque section : un eyebrow, un titre de
  8 mots maximum, 1 à 2 lignes de texte, une seule action.

## Règles de contenu

- **Rien d'inventé** : pas de chiffre, de client, de logo, de témoignage ou de certification qui
  n'existe pas. Un contenu manquant reste marqué `TODO` / `Placeholder` et tu le signales.
- Les prix de `content/pricing.ts` et les prix concurrents du comparatif sont des engagements
  commerciaux : ne les change que sur demande explicite, et rappelle de les vérifier.
- La publicité comparative (marques concurrentes) doit rester objective et vérifiable.

## SEO

- Titre et description de la page : `content/site.ts` (`seo`). Titre ≤ 60 caractères,
  description ≤ 155, avec les mots-clés principaux (CRM outbound, prospection, SDR, téléphonie,
  prise de RDV…) écrits naturellement.
- Un seul `h1` par page ; les sections utilisent `h2`, puis `h3`.
- Chaque image a un `alt` descriptif en français (`content/images.ts`) ; les images décoratives
  ont `alt=""`.
- Nouvelle page : la créer dans `app/<chemin>/page.tsx` avec son `metadata` (titre, description,
  `alternates.canonical`), puis l'ajouter à `app/sitemap.ts` et au menu si besoin.
- Données structurées schema.org dans `app/page.tsx` : les tenir à jour si le nom, les offres ou
  les prix changent.
- Images de partage : `app/opengraph-image.png` et `app/twitter-image.png` (1200×630).
- Liens internes avec `next/link`, images avec `next/image`.

## Qualité avant chaque envoi

```bash
npm install          # la première fois
npm run dev          # aperçu sur http://localhost:3000
npm run typecheck
npm run lint
npm run build
```

Les trois dernières commandes doivent passer. Vérifie la page en largeur ordinateur **et**
téléphone (pas de défilement horizontal), et l'accessibilité : contrastes AA, focus clavier
visible, textes alternatifs, `prefers-reduced-motion` respecté.

## Mise en ligne

- Travaille sur une **branche** et ouvre une **pull request** : jamais de modification directe
  de la branche déployée. Une personne de l'équipe tech relit et fusionne.
- Le site est déployé par Dokploy (Dockerfile de ce dossier, port 3000) sur suzalink.com.
  Ne modifie pas le `Dockerfile`, `next.config.ts` ou `package.json` sans en parler à l'équipe
  tech.
- Ne mets jamais de clé, mot de passe ou adresse de webhook dans le code : ce sont des
  variables d'environnement (`NEXT_PUBLIC_SITE_URL`, `DEMO_WEBHOOK_URL`) réglées dans Dokploy.
