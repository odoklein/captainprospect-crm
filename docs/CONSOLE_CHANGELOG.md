# « Nouveautés » — Console → CRM contract

The Console publishes release notes and announcements to each agency CRM. The CRM stores them,
shows them to the agency's team (top-bar « Nouveautés » button, side panel, warning banner) and
counts who saw them. The Console owns the content: the CRM never edits it.

All routes are HMAC-signed like the rest of `/api/instance/*` (`lib/instance/auth.ts`,
`X-Instance-Timestamp` + `X-Instance-Signature: v1=…`), rate-limited to 30 requests per minute
per route. No `INSTANCE_ADMIN_SECRET` → 503 `instance_api_not_configured`.
An image without these routes answers **404**: the Console marks the delivery `unsupported` and
tries again after the agency's next upgrade.

## PUT /api/instance/changelog

Upsert on `externalId` (the Console's id: `release:<tag>` or `announcement:<uuid>`). Sending the
same entry again replaces it; who saw it is kept.

```json
{
  "externalId": "release:9be5e12",
  "kind": "release",
  "title": "Tutoriels vidéo et connexion Onoff",
  "summary": "Deux nouveautés pour les managers.",
  "version": "9be5e12",
  "items": [
    { "type": "new", "title": "Tutoriels vidéo sur 8 pages", "body": "Bouton « Voir le tutoriel » en haut à droite.", "module": "Accueil" },
    { "type": "fixed", "title": "Lecture des enregistrements", "body": null, "module": null }
  ],
  "audience": "managers",
  "publishedAt": "2026-11-16T10:00:00Z"
}
```

```json
{
  "externalId": "announcement:5d0c…",
  "kind": "announcement",
  "title": "Maintenance du CRM",
  "summary": "Le CRM sera indisponible quelques minutes.",
  "category": "maintenance",
  "severity": "warning",
  "audience": "everyone",
  "cta": { "label": "Page de statut", "url": "https://status.example.fr" },
  "startsAt": "2026-11-18T20:00:00Z",
  "endsAt": "2026-11-18T21:00:00Z",
  "publishedAt": "2026-11-16T10:00:00Z"
}
```

| Field | Rules |
|---|---|
| `externalId` | `[A-Za-z0-9_.:-]{1,100}` |
| `kind` | `release` \| `announcement` |
| `title` | 1–140 characters |
| `summary` | ≤ 4000, shown with its line breaks |
| `version` | release only, ≤ 64 |
| `items` | release only, ≤ 80 of `{ type: new\|improved\|fixed, title ≤ 140, body? ≤ 1000, module? ≤ 60 }`; a release needs items or a summary |
| `category` | announcement: `feature` \| `maintenance` \| `info` \| `billing` (default `info`) |
| `severity` | `info` (default) \| `warning`: a warning also shows a dismissable banner, from 48 h before its window |
| `audience` | `managers` (default) \| `everyone` (every internal role). Clients and commercials never see Nouveautés |
| `cta` | `{ label ≤ 40, url }`, url `https://…` or an internal path `/…` |
| `startsAt`, `endsAt` | ISO 8601. Start + end = a window (maintenance), shown ahead of time, hidden once it ends. Start alone = scheduled publication, hidden until then |
| `publishedAt` | ISO 8601 |

→ `200 { ok: true, id, created }` · `422 { ok: false, error: "validation_failed", errors: [{ path, message }] }`

## DELETE /api/instance/changelog/:externalId

Retracts the entry and its "seen" records. Idempotent → `200 { ok: true, removed }`.

## GET /api/instance/changelog

The latest 200 entries with their reach, for the Console's delivery page:
`{ ok, entries: [{ externalId, kind, title, publishedAt, seen, audienceSize }], serverTime }`,
where `audienceSize` is the number of active users the entry's audience covers today.

## In the CRM

- `GET /api/changelog` (session): the signed-in user's live entries (≤ 40) and `unread`.
- `POST /api/changelog/seen { ids, banner? }`: opening the panel marks what it shows as seen;
  `banner: true` records that the banner was dismissed.
- Code: `lib/changelog/` (contract, service), `components/changelog/`, tables `ChangelogEntry`,
  `ChangelogSeen` (migration `20261116120000_add_changelog`).
