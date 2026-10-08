# Serveur MCP Captain Prospect

```
CAPTAIN PROSPECT API (services + Prisma)  →  CAPTAIN PROSPECT MCP (/api/mcp)  →  AGENT IA (ChatGPT, Claude…)
```

Le serveur MCP est une route Next.js, `POST /api/mcp` (Streamable HTTP, sans état). Pas de processus à lancer en plus : il est déployé avec le CRM, derrière le même HTTPS. Il utilise la **même clé API, la même isolation tenant et les mêmes scopes** que `/api/v1` (voir `docs/API_V1.md`).

- Authentification : `Authorization: Bearer cp_live_…` sur chaque requête.
- Un outil n'est **listé** que si la clé porte son scope.
- Tous les outils sont en lecture seule (`readOnlyHint`). Aucun outil n'accepte de tenant en argument.

## Outils

| Outil | Scope | Rôle |
|---|---|---|
| `whoami` | aucun (toute clé valide) | **À appeler en premier** : client visible (« pas tout le CRM »), date du jour à Paris, missions actives, permissions, glossaire des codes résultat |
| `global_search` | aucun (chaque section filtrée par son scope) | Cherche un nom dans contacts, entreprises et équipes en un appel |
| `get_contact_context` | `contacts:read` | **Premier appel** pour un prospect : contact, société, étape, appels, activités, RDV, notes, utilisateurs, dernière interaction, synthèse |
| `search_contacts` / `get_contact` | `contacts:read` | Recherche / fiche |
| `search_companies` / `get_company` | `companies:read` | Recherche / fiche |
| `search_leads` / `get_lead` | `leads:read` | Prospects travaillés par étape (`min_calls`, `no_appointment`, `callback_due_before`, `date_from`…) |
| `search_calls` / `get_call` | `calls:read` | Appels ; `get_call` ajoute résumé IA et transcription |
| `search_activities` | `activities:read` | Appels, emails, LinkedIn |
| `search_appointments` | `appointments:read` | RDV (statut, confirmation, à venir, retour client) |
| `list_teams` / `get_team` | `users:read` | Équipes (= missions) et performance 30 j |
| `list_users` / `get_user` | `users:read` | SDR visibles (nom, rôle) et activité 30 j |
| `get_sales_report` | `reports:read` | **L'outil des chiffres** : appels, **contacts et entreprises uniques appelés**, taux de joignabilité, résultats par catégorie, série par jour, par SDR / mission, comparaison avec la période précédente |

Tous les outils de recherche et le rapport acceptent `period` (`today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `last_7_days`, `last_30_days`, `this_year`), calculé en heure de Paris : l'agent n'a pas à deviner les dates.

Le serveur envoie aussi des **instructions** à l'agent à la connexion (appeler `whoami`, ne pas confondre appels et personnes, ne rien inventer).

Les outils `search_*` / `list_*` partagent `limit` (20, max 100) et `cursor` (`next_cursor` de la page précédente).

## Variables d'environnement

**Côté serveur Captain Prospect : aucune.** Le MCP réutilise la base et les clés existantes.

**Côté client MCP** (seulement si vous passez par un pont local type `mcp-remote`) :

```env
CP_API_BASE_URL=https://votre-domaine     # URL publique du CRM
CP_MCP_API_KEY=cp_live_…                  # clé créée pour cet agent — ne jamais la committer
```

## Connecter un agent

1. Créer une clé dédiée à l'agent, limitée au client et aux scopes utiles :
   `npm run api-key:create -- --client <clientId> --name "ChatGPT" --by manager@exemple.com --scopes all --expires-days 90`
2. URL du serveur : `https://votre-domaine/api/mcp`, en-tête `Authorization: Bearer <clé>`.

**ChatGPT** (connecteur MCP personnalisé / mode développeur, selon votre offre) : ajouter un serveur MCP distant avec l'URL ci-dessus ; si l'interface propose un mode d'authentification, choisir un jeton « Bearer » / en-tête personnalisé avec la clé. L'URL doit être **publique en HTTPS** — `localhost` n'est pas joignable par ChatGPT (utiliser un tunnel pour tester). Les écrans exacts de ChatGPT changent : vérifier dans sa documentation officielle.

**Claude Desktop / client stdio** (via `mcp-remote`) :

```json
{
  "mcpServers": {
    "captain-prospect": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://votre-domaine/api/mcp", "--header", "Authorization:${CP_AUTH}"],
      "env": { "CP_AUTH": "Bearer cp_live_…" }
    }
  }
}
```

**Vérifier à la main :**

```bash
curl -s -X POST "$CP_URL/api/mcp" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Audit

Chaque appel d'outil est journalisé dans `ApiKeyUsageLog` avec le chemin `/mcp/<outil>/<id lu>` (ex. `/mcp/get_contact_context/ck…`) et la méthode `MCP`. Les termes de recherche ne sont pas enregistrés.

## Limites de cette première version

- Lecture seule ; pas de session MCP (stateless), donc pas de notifications serveur.
- Pas de OAuth : une clé Bearer par agent. Les connecteurs qui n'acceptent que OAuth ne pourront pas s'y brancher sans ajout.
