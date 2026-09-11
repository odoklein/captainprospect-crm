# Guide d'Intégration & Analyse OpenReplay (Suzali Conseil)

Ce document décrit la configuration et l'exploitation d'**OpenReplay** sur votre instance auto-hébergée (`openreplay.suzaliconseil.com`) pour le CRM CaptainProspect.

---

## 1. Architecture & Fonctionnement

L'intégration a été conçue pour fonctionner avec **Next.js 16 (React 19)**, sans impact sur le rendu serveur (SSR), avec gestion de la file d'attente hors-ligne (buffering queue) et protection stricte des données sensibles.

### Éléments installés :
- `lib/openreplay/tracker.ts` : Service singleton OpenReplay (gestion du cycle de vie, chargement résilient, pont Sentry, assainissement réseau).
- `lib/openreplay/events.ts` : Dictionnaire d'événements métiers CRM typés (`CRM_ACTION_SUBMITTED`, `CRM_MEETING_BOOKED`, `CRM_LEAD_VIEWED`, `CRM_EMAIL_SENT`, etc.).
- `hooks/useOpenReplay.ts` : Hook React prêt à l'emploi pour n'importe quel composant client.
- `components/providers/OpenReplayProvider.tsx` : Fournisseur client branché dans `Providers.tsx` sous `SessionProvider` qui :
  - Démarre le tracker dans le navigateur client.
  - Identifie automatiquement l'utilisateur connecté (`setUserID(id)`).
  - Injecte les métadonnées de rôle (`role`), email, nom, et `clientId`.
  - Écoute les changements d'URL (App Router `usePathname`) pour alimenter les entonnoirs (funnels).
- `components/drawers/UnifiedActionDrawer.tsx` : Télémesure active lors de l'affichage des fiches prospects, de l'enregistrement des actions SDR (appels, résultats, notes) et de l'envoi d'emails.
- `components/sdr/BookingDrawer.tsx` : Télémesure lors de la confirmation d'un RDV (`CRM_MEETING_BOOKED`).

---

## 2. Configuration des Variables d'Environnement

Dans votre fichier `.env` (ou dans vos variables Coolify / serveur de production) :

```env
# OpenReplay (Self-Hosted Suzali)
NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=VOTRE_PROJECT_KEY
NEXT_PUBLIC_OPENREPLAY_INGEST_POINT=https://openreplay.suzaliconseil.com/ingest
NEXT_PUBLIC_OPENREPLAY_ENABLED=true
```

> **Note :** Si `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` n'est pas renseigné ou si `NEXT_PUBLIC_OPENREPLAY_ENABLED=false`, le tracker se désactive sans générer d'erreur.

---

## 3. Configuration Essentielle dans le Dashboard OpenReplay

OpenReplay requiert de **déclarer au préalable les clés de métadonnées** dans l'interface web pour qu'elles soient indexées et filtrables dans vos recherches de sessions.

1. Rendez-vous sur votre instance : [https://openreplay.suzaliconseil.com](https://openreplay.suzaliconseil.com)
2. Connectez-vous et allez dans **Preferences** (ou Paramètres) > **Projects** > Sélectionnez votre projet.
3. Cliquez sur l'onglet **Metadata** et ajoutez les clés suivantes :
   - `role` (ex: `SDR`, `MANAGER`, `CLIENT`, `BOOKER`, `COMMERCIAL`)
   - `email` (adresse email de l'utilisateur)
   - `name` (nom complet)
   - `clientId` (ID de l'organisation cliente)
   - `current_route` (dernière route visitée, ex: `/sdr/action`, `/client`)
   - `environment` (`production`, `development`)

---

## 4. Maximiser l'Analyse des Données : Entonnoirs & Tableaux de Bord

### A. Créer un Entonnoir de Conversion SDR (Funnel)
Dans OpenReplay > **Funnels** > **Create Funnel** :
1. **Étape 1 :** Event `CRM_PAGE_VIEW` où `path` vaut `/sdr/action`
2. **Étape 2 :** Event `CRM_LEAD_VIEWED`
3. **Étape 3 :** Event `CRM_ACTION_SUBMITTED`
4. **Étape 4 :** Event `CRM_MEETING_BOOKED`

*Bénéfice :* Vous pouvez visualiser exactement le taux de conversion entre les leads affichés et les rendez-vous pris, et cliquer sur les abandons pour voir ce qui a bloqué le commercial (ex: hésitation sur l'argumentaire, problème d'interface).

### B. Créer un Dashboard "Erreurs & Rage Clicks SDR"
Dans OpenReplay > **Dashboards** > **Add Card** :
- **Card 1 (Rage clicks) :** Type *Rage clicks*, filtre URL `contains /sdr/action`. Permet de repérer les boutons cliqués frénétiquement par les SDRs quand l'interface ne répond pas assez vite.
- **Card 2 (Requêtes API lentes) :** Type *Slowest Requests*, filtre URL `contains /api/actions` ou `/api/sdr/`.
- **Card 3 (Sessions avec RDV Pris) :** Type *Session List*, filtre Event `CRM_MEETING_BOOKED`. Permet au Manager de visionner directement les enregistrements des appels gagnants pour le coaching d'équipe.

### C. Pont Bidirectionnel Sentry <-> OpenReplay
Le CRM est déjà configuré avec `@sentry/nextjs`. Le tracker OpenReplay injecte automatiquement le tag `openReplaySession.id` et le contexte `sessionUrl` dans Sentry.
- Lorsqu'une exception se produit dans Sentry, le tag `openReplaySession.id` et le lien vers la session OpenReplay sont directement accessibles.
- Vous pouvez cliquer sur le lien pour visionner la vidéo exacte de ce que faisait l'utilisateur dans les 30 secondes avant le crash.

---

## 5. Comment Utiliser la Télémesure dans le Code

### Option 1 : Via le hook React `useOpenReplay`
```tsx
import { useOpenReplay } from "@/hooks/useOpenReplay";

export function MonComposant() {
  const { trackCustomEvent, trackError } = useOpenReplay();

  const handleCustomAction = () => {
    trackCustomEvent("BOUTON_SPECIAL_CLIQUE", { feature: "export_leads" });
  };

  return <button onClick={handleCustomAction}>Exporter</button>;
}
```

### Option 2 : Via les fonctions métier typées
```tsx
import { trackLeadView, trackActionLogged, trackMeetingBooked } from "@/lib/openreplay/events";

// Enregistrer la consultation d'un prospect
trackLeadView({
  leadId: "lead_123",
  companyName: "Acme Corp",
  status: "ACTIONABLE",
  missionId: "mission_456",
});

// Enregistrer un RDV confirmé
trackMeetingBooked({
  leadId: "lead_123",
  companyName: "Acme Corp",
  contactName: "Jean Dupont",
  scheduledAt: "2026-09-15T14:00:00.000Z",
});
```

---

## 6. Protection des Données & Confidentialité (RGPD)

1. **Masquage Réseau Automatique :**
   - Les en-têtes sensibles (`Authorization`, `Cookie`, `x-api-key`) sont automatiquement masqués `[REDACTED]`.
   - Les champs de formulaire contenant `password`, `masterPassword`, `token`, `secret`, `creditCard` sont automatiquement anonymisés.
2. **Masquage d'Éléments d'Interface Spécifiques :**
   Si vous souhaitez rendre un élément complètement invisible dans les replays vidéos (ex: données bancaires, notes ultra-confidentielles), ajoutez simplement l'attribut HTML :
   ```html
   <div data-openreplay-hidden>
     Donnée confidentielle non enregistrée
   </div>
   ```
   Ou pour flouter le texte :
   ```html
   <span data-openreplay-masked>
     Texte flouté dans la vidéo
   </span>
   ```
