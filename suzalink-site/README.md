# Suzalink — site marketing

Site vitrine de **Suzalink**, le CRM d'exécution outbound (appels, emails, séquences et IA
dans une instance dédiée). Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Framer Motion.
Tout le site est en français, les prix sont en euros HT.

Ce dossier est un projet autonome : il a son propre `package.json` et ne dépend pas du CRM
qui l'entoure dans ce dépôt (il est exclu du `tsconfig.json` et de l'ESLint racine).

## Lancer le projet

Node.js 20.9 ou plus récent (22 recommandé).

```bash
cd suzalink-site
npm install
npm run dev          # http://localhost:3000
```

Production :

```bash
npm run build
npm run start
```

Contrôles :

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint (règles Next.js + Core Web Vitals)
```

### Variables d'environnement (toutes optionnelles)

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL publique (SEO, sitemap, image de partage). Défaut : `https://suzalink.com` |
| `DEMO_WEBHOOK_URL` | Reçoit chaque demande de démo en JSON (CRM, Make, Zapier, Slack…). Sans elle, la demande est seulement journalisée côté serveur. |
| `LOGO_DEV_TOKEN` | Clé gratuite [logo.dev](https://logo.dev) pour `npm run logos` (logos plus nets). Sans elle, le script utilise le service public de favicons de Google. |

## Modifier le contenu (sans toucher au code)

Tout le texte, les prix et les visuels sont dans `/content` :

| Fichier | Contenu |
|---|---|
| `content/site.ts` | Nom, URL, SEO, barre d'annonce, menu, pied de page, liens « Se connecter » / réseaux sociaux |
| `content/home.ts` | Textes de chaque section de l'accueil, dans l'ordre de la page |
| `content/pricing.ts` | **Tous les prix** : les 3 offres, mensuel / annuel, sièges, frais de mise en service, comparatif du « stack morcelé » |
| `content/brands.ts` | Clients affichés (« Ils prospectent avec Suzalink ») et outils cités (HubSpot, Aircall, Allo…) |
| `content/images.ts` | Photos : fichier local, texte alternatif, photo Unsplash de secours |
| `content/demo.ts` | Page `/demo` et formulaire (libellés, messages d'erreur, tailles d'équipe) |

Règles éditoriales : chaque section a un eyebrow, un titre de 8 mots maximum, 1 à 2 lignes de
texte et une seule action. Aucun chiffre, logo ou témoignage inventé : les emplacements marqués
**Placeholder** ou **TODO** attendent du contenu réel.

### Photos

Déposez vos visuels dans `public/photos/` avec les noms listés dans
[`IMAGE_PROMPTS.md`](./IMAGE_PROMPTS.md) (`hero-nature.jpg`, `sdr-headset.jpg`…) : ils remplacent
automatiquement les photos Unsplash au prochain build. Pensez à mettre à jour le texte
alternatif (`alt`) dans `content/images.ts`. Les photos passent par `next/image`
(AVIF/WebP, tailles adaptées, chargement différé sauf le hero).

### Logos

```bash
npm run logos              # télécharge les logos manquants de content/brands.ts
npm run logos -- --force   # les retélécharge tous
```

Le script interroge une API publique de logos **une seule fois** et enregistre les fichiers dans
`public/logos/`. Le site les sert ensuite lui-même : le navigateur des visiteurs n'appelle
jamais de service tiers (pas de transfert d'adresse IP, cohérent avec le RGPD). Pour un logo
précis, déposez votre fichier et renseignez `logo` dans `content/brands.ts`.

La lecture de `content/brands.ts` par le script demande Node 22.18 ou plus récent. Derrière
un proxy d'entreprise, lancez `NODE_USE_ENV_PROXY=1 npm run logos`.

> Le comparatif de coûts cite des marques concurrentes avec leurs logos. La publicité
> comparative est autorisée en France si elle reste objective et vérifiable : revérifiez les
> fourchettes de prix de `content/pricing.ts` avant chaque mise en ligne.

## Structure

```
app/
  layout.tsx            polices (Bricolage Grotesque, Geist, Geist Mono), métadonnées, lien d'évitement
  page.tsx              accueil : les 14 sections + données structurées schema.org SoftwareApplication
  demo/page.tsx         page de demande de démo
  demo/actions.ts       server action : validation (Zod) + envoi au webhook
  sitemap.ts, robots.ts SEO
  opengraph-image.png   image de partage (1200×630), twitter-image.png, icon.svg, apple-icon.png
components/
  sections/             un composant par section (AnnouncementBar, SiteHeader, Hero, LogoStrip,
                        AiSplit, Engines, Roles, StackCost, CaseStudies, Testimonial, Pricing,
                        Security, FinalCta, Footer)
  mockups/              maquettes produit en HTML/CSS (file d'appels SDR, fiche de RDV IA,
                        tableau de bord manager, portail client, moteurs)
  ui/                   boutons, eyebrow, cadre photo avec grain, animations, icônes
  brand/Logo.tsx        logo Suzalink en SVG (tracés, sans dépendance de police)
  DemoForm.tsx          formulaire de démo (nom, email, entreprise, taille d'équipe)
content/                textes, prix, marques, images (voir plus haut)
lib/demo-schema.ts      schéma Zod partagé navigateur / serveur
lib/resolve-image.ts    choisit la photo locale ou celle de secours
scripts/fetch-logos.mjs récupère les logos via l'API
public/brand/           logo.svg, logo-inverse.svg
```

## Design system

| Jeton | Valeur | Usage |
|---|---|---|
| `navy` | `#263460` | couleur principale, boutons, bandes sombres |
| `rose` | `#C64B8B` | accent : points, flèches des CTA, surlignages, anneau de focus |
| `paper` | `#F7F5F0` | fond de page |
| `ink` | `#0F1222` | texte |
| `muted` | `#6B6F80` | texte secondaire |
| `line` | `#E4E1DA` | filets |

Les jetons sont dans `app/globals.css` (`@theme`). Titres en Bricolage Grotesque 300–400
(interlettrage −0,03 em), texte en Geist, eyebrows en Geist Mono 11 px majuscules.

Le rose n'est jamais utilisé comme fond de texte : du texte blanc sur `#C64B8B` n'atteint pas le
contraste AA (4,4:1). Les CTA sont donc des pilules navy, avec une pastille rose pour la flèche.

## Accessibilité et performance

- Contrastes AA vérifiés pour tous les couples texte / fond du design system.
- Navigation au clavier : lien « Aller au contenu », anneau de focus visible (blanc sur les
  bandes sombres), onglets « Pensé pour chaque rôle » au motif ARIA Tabs (flèches, Début / Fin).
- Maquettes produit exposées comme une seule image décrite (`role="img"` + `aria-label`).
- Formulaire : libellés explicites, erreurs reliées aux champs (`aria-describedby`), focus sur
  le premier champ en erreur, fonctionne aussi sans JavaScript (server action).
- `prefers-reduced-motion` : animations de défilement et de flottement désactivées.
- Framer Motion chargé en mode `LazyMotion` (fonctionnalités DOM seulement). Polices
  auto-hébergées par `next/font`. La page d'accueil est entièrement statique.

## Déploiement (Dokploy, suzalink.com)

Le dossier contient un `Dockerfile` (build Next.js `standalone`, Node 22, port **3000**).

Dans Dokploy : nouvelle application → source Git (ce dépôt, branche à déployer) →
**Build type : Dockerfile**, **Build path / context : `suzalink-site`**, Dockerfile : `Dockerfile`.
Variables : `NEXT_PUBLIC_SITE_URL=https://suzalink.com` (aussi en *build arg*), `DEMO_WEBHOOK_URL` si les
demandes de démo doivent partir vers un outil. Domaine : `suzalink.com` (et `www.suzalink.com`), port 3000,
HTTPS Let's Encrypt. Le DNS de `suzalink.com` doit pointer vers l'IP du VPS.

Logos : `public/brand/` (`logo.png` fond clair, `logo-inverse.png` fond foncé, `mark*.png` le « S »),
favicon `app/icon.png`, icône iOS `app/apple-icon.png`, images de partage `app/opengraph-image.png` / `twitter-image.png`.
