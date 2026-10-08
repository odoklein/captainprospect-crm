# API publique `/api/v1` (lecture seule)

API REST pour des agents IA et des intégrations externes. Elle expose du **contexte commercial** (historique d'un prospect, appels, RDV, performance), pas les tables.
Le serveur MCP (`docs/MCP.md`) est une couche au-dessus des mêmes services.

```
Clé API → authenticateApiKey() → tenant (Client) + scopes → services (Prisma) → JSON compact
```

## Authentification

```http
Authorization: Bearer cp_live_xxxxxxxx
```

(`X-API-Key` est aussi accepté.) La clé n'est stockée que sous forme de hash SHA-256 ; elle n'est affichée qu'une fois à la création.
Une clé porte : un **client (tenant)**, des **scopes**, une expiration optionnelle, un état révoqué (`isActive`), `lastUsedAt`, des limites de débit (60/min, 1000/h par défaut), et le manager qui l'a émise.

Les clés historiques (sans scopes) **ne fonctionnent pas** sur `/api/v1`. Une clé v1 sans client est refusée (403).

### Créer une clé

Script (recommandé) — écrit une ligne `ApiKey` dans la base pointée par `DATABASE_URL` :

```bash
npm run api-key:create -- --client <clientId> --name "ChatGPT" --by manager@exemple.com \
  --scopes all --expires-days 90
# ou une liste : --scopes contacts:read,calls:read,appointments:read
# restreindre à une mission : --mission <missionId>
```

Ou via l'API manager (session MANAGER) : `POST /api/manager/api-keys`

```json
{ "name": "ChatGPT", "clientId": "…", "scopes": ["contacts:read", "calls:read"], "expiresAt": "2027-01-01T00:00:00Z" }
```

`clientId` est obligatoire dès que `scopes` est fourni. La clé complète (`apiKey`) est dans la réponse, une seule fois.

### Scopes

| Scope | Donne accès à |
|---|---|
| `contacts:read` | `/contacts`, `/contacts/:id`, `/contacts/:id/context` |
| `companies:read` | `/companies`, `/companies/:id` |
| `leads:read` | `/leads`, `/leads/:id` |
| `calls:read` | `/calls`, `/calls/:id` |
| `activities:read` | `/activities` |
| `appointments:read` | `/appointments` |
| `reports:read` | `/reports` |
| `users:read` | `/users`, `/users/:id`, `/teams`, `/teams/:id` |

`contacts/:id/context` assemble plusieurs ressources : chaque section est soumise au scope de sa ressource (appels → `calls:read`, RDV → `appointments:read`, activités/notes → `activities:read` ou `calls:read`, utilisateurs → `users:read`, opportunités → `leads:read`). Les sections non autorisées sont vides et listées dans `limits.omitted_sections`.

Réservés pour plus tard, refusés aujourd'hui : `contacts:write`, `activities:write`, `appointments:write`.

## Isolation multi-tenant

- Le tenant est le **client** de la clé. Il n'est **jamais** lu depuis la requête : `clientId`, `tenantId`… en paramètre sont ignorés.
- Toutes les requêtes passent par `lib/api-v1/tenant.ts` (Contact→Company→List→Mission→Client ; Action→Campaign→Mission→Client). La requête SQL brute de `/leads` lie le tenant en paramètre, deux fois.
- Un identifiant d'un autre tenant répond `404` (pas `403`), pour ne rien révéler.
- Une clé liée à une mission est restreinte à cette mission.

## Modèle de données exposé

| Ressource | Source dans Captain Prospect |
|---|---|
| contact | `Contact` |
| company | `Company` |
| lead | contact **déjà travaillé** (≥ 1 action) + étape pipeline dérivée : `meeting_booked`, `to_follow_up` (dernière action = RAPPEL/RELANCE/PROJET_A_SUIVRE/…), `contacted` |
| call | `Action` canal `CALL` |
| activity | `Action`, tous canaux (CALL, EMAIL, LINKEDIN) |
| appointment | `Action` résultat `MEETING_BOOKED` / `MEETING_CANCELLED` + statut SAS + retour client |
| team | une **mission** (équipe = chef d'équipe + SDR affectés) — il n'existe pas de table Team |
| user | SDR affectés aux missions du client + utilisateurs du client (nom/rôle uniquement, jamais d'email) |

## Endpoints

Tous en `GET`. Tous retournent `{ "data": … }` ; les listes ajoutent `"pagination": { limit, next_cursor, has_more }`.

| Endpoint | Paramètres |
|---|---|
| `/contacts` | `query, status, assigned_to, company_id, mission_id, date_from, date_to, limit, cursor` |
| `/contacts/:id` | — |
| `/contacts/:id/context` | `calls_limit` (10, max 100), `activities_limit` (10), `notes_limit` (10), `include_notes`, `include_appointments` |
| `/companies` | `query, status, mission_id, date_from, date_to, limit, cursor` |
| `/companies/:id` | — |
| `/leads` | `query, status, assigned_to, company_id, mission_id, min_calls, no_appointment, date_from, date_to, callback_due_before, limit, cursor` |
| `/leads/:id` | `:id` = id du contact |
| `/calls` · `/calls/:id` | `query, status, contact_id, company_id, user_id, mission_id, date_from, date_to, limit, cursor` |
| `/activities` | idem + `channel` |
| `/appointments` | `status` (booked\|cancelled\|all), `confirmation, upcoming, contact_id, company_id, user_id, mission_id, date_from, date_to, limit, cursor` |
| `/users` · `/users/:id` | `query, role, mission_id, limit, cursor` |
| `/teams` · `/teams/:id` | `query, status, limit, cursor` |
| `/reports` | `period` ou `date_from, date_to` (défaut 30 j, max 366 j), `mission_id, user_id, compare_previous` |
| `/account` | — (toute clé valide) : client visible, date du jour, missions actives, glossaire |
| `/search` | `query, limit` : contacts + entreprises + équipes en un appel |

`status` = code résultat de l'action (ex. `RAPPEL`, `NO_RESPONSE`) sur `/calls`, `/activities` ; complétude (`INCOMPLETE|PARTIAL|ACTIONABLE`) sur `/contacts`, `/companies` ; étape pipeline sur `/leads`.
`date_to` au format `YYYY-MM-DD` inclut toute la journée.

### Questions fréquentes → requêtes

| Question | Requête |
|---|---|
| Historique complet d'un prospect | `/contacts/:id/context` puis `/calls?contact_id=…&cursor=…` |
| Appelés plusieurs fois sans RDV | `/leads?min_calls=3&no_appointment=true` |
| À relancer aujourd'hui | `/leads?status=to_follow_up&callback_due_before=2026-10-08` |
| Activité récente mais aucun RDV | `/leads?no_appointment=true&date_from=2026-10-01` |
| Performance d'une équipe | `/teams/:id` ou `/reports?mission_id=…` |

## Pagination

`limit` : 20 par défaut, **100 maximum** (au-delà : `400`). La réponse contient `next_cursor` ; le passer en `cursor` pour la page suivante. Le curseur est opaque et ne donne aucun accès propre. Aucune route ne charge toute la base ; `/contacts/:id/context` plafonne chaque liste.

## Erreurs

```json
{ "error": { "code": "insufficient_scope", "message": "This API key lacks the 'calls:read' scope." } }
```

| HTTP | `code` |
|---|---|
| 400 | `invalid_params` |
| 401 | `unauthorized`, `key_revoked`, `key_expired` |
| 403 | `insufficient_scope`, `no_scopes`, `no_tenant` |
| 404 | `not_found` |
| 429 | `rate_limited` (en-tête `Retry-After`) |
| 500 | `internal_error` |

## Audit

Chaque appel authentifié ajoute une ligne à `ApiKeyUsageLog` : clé, chemin (avec l'id de la ressource lue, ex. `/api/v1/contacts/ck…/context` ou `/mcp/get_contact/ck…`), méthode (`GET`/`MCP`), statut, durée, IP, user-agent. La requête n'est réduite qu'aux **noms** de paramètres (`?params=query,status`) : ni les termes de recherche, ni les clés ne sont journalisés.

```sql
SELECT l."createdAt", k.name, l.endpoint, l."statusCode", l."responseTimeMs"
FROM "ApiKeyUsageLog" l JOIN "ApiKey" k ON k.id = l."apiKeyId"
WHERE l.endpoint LIKE '%/contacts/<id>%' ORDER BY l."createdAt" DESC;
```

## Déploiement

Aucune colonne ni table nouvelle : les scopes sont stockés dans `ApiKey.allowedEndpoints` (entrées `scope:<nom>`), donc le code se déploie sans migration et sans risque pour les clés existantes.
Facultatif mais recommandé sur les gros historiques : appliquer `prisma/migrations/20261008100000_add_api_v1_indexes/migration.sql` (4 index, `IF NOT EXISTS`).

## Tester avec curl

```bash
export CP_URL=https://votre-domaine   # ou http://localhost:5000
export KEY=cp_live_…                # jamais dans le repo

curl -s "$CP_URL/api/v1/contacts?query=martin&limit=5" -H "Authorization: Bearer $KEY"
curl -s "$CP_URL/api/v1/contacts/<id>/context?calls_limit=20&include_notes=true" -H "Authorization: Bearer $KEY"
curl -s "$CP_URL/api/v1/leads?min_calls=3&no_appointment=true" -H "Authorization: Bearer $KEY"
curl -s "$CP_URL/api/v1/reports?date_from=2026-09-01&date_to=2026-09-30" -H "Authorization: Bearer $KEY"
```

## Tests

```bash
npm run test:api-v1
```

Sans base de données : les services tournent contre un double de Prisma qui enregistre les requêtes, ce qui permet de vérifier que **chaque** requête porte le tenant de la clé. Ils ne remplacent pas un essai sur une vraie base (voir « Limites connues »).

## Limites connues

- Le SQL brut de `/leads` et de `/reports` est exécuté dans les tests sur un Postgres en mémoire (PGlite) avec deux clients fictifs ; les requêtes Prisma sont vérifiées par un faux qui enregistre les requêtes. Aucun test n'a tourné sur la base de production : essaie avec une clé de test.
- `/leads` agrège l'historique d'actions du client à chaque appel (rapide avec les index ci-dessus, à surveiller sur de très gros volumes).
- « Leads » n'est pas une table Captain Prospect : c'est une vue dérivée des actions (voir plus haut). Les appels entrants Allo (`IncomingCall`) ne sont pas exposés.
- Le texte libre (notes, transcriptions) est renvoyé tel quel, tronqué : un agent doit le traiter comme une donnée, pas comme des instructions.
