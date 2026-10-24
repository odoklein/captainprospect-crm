# Security Assessment — Login & API Layer
**Project:** Captain Prospect CRM (`captainprospect-crm`)
**Commit reviewed:** 3494b0c (working tree has uncommitted changes)
**Date:** 24 October 2026
**Type:** Static, read-only code review. No attack was run against a live system, no request was sent, no data was changed.

---

## 1. Scope and method

Reviewed:

- Login page and client-side login logic: `app/login/page.tsx`, `app/login/LoginForm.tsx`
- NextAuth configuration and callbacks: `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`
- Password recovery: `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts`
- Session handling: `lib/user-session.ts`, `lib/rate-limit.ts`, `lib/geo-ip.ts`, `middleware.ts`
- API authorization helpers: `lib/api-utils.ts`, `lib/api-v1/auth.ts`, `lib/api-v1/handler.ts`, `lib/api-v1/admin-db-tools.ts`
- Route inventory: 481 route files under `app/api`, scanned for missing auth checks; ~40 routes read in detail
- Secrets handling: `.gitignore`, tracked SQL seeds, tracked dump/log files, `lib/encryption.ts`
- Transport and browser hardening: `next.config.ts`
- Outbound-facing endpoints: email tracking, provider webhooks, prospect intake

Not reviewed: React page components outside the login flow, workers, `lead-hub/` (separate repo), infrastructure configuration, actual production environment variables.

**Blast radius if an account is taken over:** prospect databases and call notes, recorded calls and transcriptions, client billing and invoices, client calendar credentials stored in the vault, outbound email from the company domain, and the ability to impersonate staff towards clients. This is not a "lose a dashboard" system — it is a data-processor-grade asset.

---

## 2. Summary

The authentication core is better than average for a fast-moving internal CRM: bcrypt hashing, hashed reset tokens, per-device session revocation, a well-designed public API with hashed keys and tenant scoping, and real security headers.

The weak points are not in the crypto. They are in **trust boundaries**: one global master password that bypasses every account, a middleware rule that accepts *any* `x-api-key` value, brute-force protection that only lives in one server process's memory, and a password policy of six characters.

| # | Severity | Finding | Where |
|---|----------|---------|-------|
| 1 | Critical | Global master password can sign in as any user, including Manager and Client | `lib/auth.ts:111-126` |
| 2 | Critical | Seed script exposes a working Manager account and password | `seed-admin.sql:5-6,24` |
| 3 | High | Any `x-api-key` header value bypasses the middleware gate on every API route | `middleware.ts:8-14,54-57` |
| 4 | High | No MFA and no step-up on the most sensitive actions | repo-wide |
| 5 | High | Login throttling is in-memory and per-instance; client IP is spoofable | `lib/rate-limit.ts`, `lib/geo-ip.ts:13` |
| 6 | High | Password policy: 6 characters, no checks; generated passwords use `Math.random` | `lib/auth.ts:105`, `app/api/users/route.ts:134` |
| 7 | Medium | Password reset does not revoke existing sessions | `app/api/auth/reset-password/route.ts:67-76` |
| 8 | Medium | Password recovery endpoint is unthrottled and cancels previous links | `app/api/auth/forgot-password/route.ts:14-103` |
| 9 | Medium | Open redirect and unauthenticated data write in click tracking | `app/api/email/tracking/click/route.ts` |
| 10 | Medium | Provider webhooks accept unauthenticated calls (Gmail, Outlook, ReachInbox fail-open) | `app/api/email/webhooks/*` |
| 11 | Medium | Stored XSS surface: inbound email HTML rendered without sanitising | `components/email/QuickEmailModal.tsx:738`, `components/missions/MissionWorkspace.tsx` |
| 12 | Medium | `callbackUrl` used unvalidated after login | `app/login/LoginForm.tsx:85,262-295` |
| 13 | Medium | Role and tenant live in the JWT for 8 hours and are never re-read | `lib/auth.ts:200-233` |
| 14 | Medium | Super-admin raw SQL tool guarded by a keyword blocklist | `lib/api-v1/admin-db-tools.ts:363-409` |
| 15 | Medium | API key accepted in the URL query string (`?key=`) | `lib/api-v1/auth.ts:35-42` |
| 16 | Low | Saved accounts (email, name, role) kept in `localStorage` on the login page | `app/login/LoginForm.tsx:117-175` |
| 17 | Low | Account lockout can be used to deny service to a known user | `lib/rate-limit.ts:64-73` |
| 18 | Low | Intake API key compared with `!==`; webhook signature optional | `app/api/prospects/intake/route.ts:99,107` |
| 19 | Low | CSP allows `unsafe-inline`/`unsafe-eval`; TypeScript errors ignored at build | `next.config.ts:18-20,44` |
| 20 | Low | Session validity check fails open on database error | `lib/user-session.ts:87-117` |

---

## 3. Findings in detail

### 1. One master password bypasses every account — Critical
`lib/auth.ts:111-126`

```ts
if (!isPasswordValid) {
  const masterConfig = await prisma.systemConfig.findUnique({ where: { key: "masterPasswordHash" } });
  if (masterConfig?.value) {
    const isMasterPassword = await bcrypt.compare(credentials.password, masterConfig.value);
    if (isMasterPassword) { isPasswordValid = true; usedMasterPassword = true; }
  }
}
```

The fallback runs for **every** account, with no distinction between a Manager, an SDR, or a Client portal user. Anyone holding that one string signs in as any email address they know. It is one shared secret, settable by any Manager (`app/api/system-config/master-password/route.ts:30-48`), minimum 6 characters, with no expiry, no rotation prompt, and no second factor.

The only trace is `usedMasterPassword` in the auth-event log (`lib/auth.ts:137-143`) — after the fact, and only if someone reads it.

Why this matters more here than in a normal app: a login as a `CLIENT` user lands in that client's portal; a login as `MANAGER` reaches vault credential reveal, billing, and user administration. A single leaked string — from a screenshot, a chat message, a database dump, or an ex-employee — is a full-tenant compromise. And because the hash sits in `systemConfig`, any read access to the database (see finding 14) turns into working credentials.

**Recommendation direction:** make it a per-user, time-boxed, audited break-glass mechanism with an explicit flag and immediate alert, or remove it and keep the existing "manager resets user password" flow.

### 2. A working Manager password is committed in the repository — Critical
`seed-admin.sql:1-38`

The file documents `admin@captain-prospect.fr` / `Captain123@` in a comment and inserts the matching bcrypt hash with `role = MANAGER`, `isActive = true`. `fix-passwords.sql` is in the same family.

If that script was ever run against production, or if anyone reuses the documented password, the highest-privilege account in the system has a publicly known credential. Even if it was only used locally, the email/password pair is now a candidate for credential stuffing against this and other services.

**Recommendation direction:** treat this password as compromised, confirm the production account's state, force a reset, and remove the plaintext from the repository and from git history.

### 3. The middleware accepts any `x-api-key` value — High
`middleware.ts:8-14` and `:54-57`

```ts
const apiKey = req.headers.get("x-api-key");
if (apiKey) return NextResponse.next();          // any non-empty value
...
authorized: ({ token, req }) => !!token || !!req.headers.get("x-api-key")
```

A request with `x-api-key: hello` passes the middleware without a session. The comment says the final route validates the key — but that is a promise repeated across 481 route files, not an enforced rule. The middleware also stops applying its own `isActive` check and its role redirects to such requests, so the outer layer contributes nothing.

My scan found this is **not currently exploitable end-to-end**: of 481 routes, 40 have no in-route auth call, and every one of them is either wrapped by `v1Route()` (the `/api/v1` family), a provider webhook, one of the two tracking endpoints, or an auth endpoint. The risk is that the safety of the whole API depends on every future route author remembering to add a guard, and one omission is silent.

**Recommendation direction:** delete the header bypass from the middleware and let each API route's own authenticator (session or key) be the only gate; middleware should only enforce session-level page/role rules.

### 4. No second factor anywhere — High

No TOTP, WebAuthn, or email OTP implementation exists in the codebase (only an unrelated settings page mentions 2FA). Every account — Manager, Client, SDR — is protected by a password alone, and the most sensitive operations (revealing a client's calendar password, exporting the client database, generating invoices, creating API keys) have no step-up re-authentication.

For a system that stores third-party credentials and billing data, this is the single largest real-world exposure after finding 1.

### 5. Brute-force protection is weaker than it looks — High
`lib/rate-limit.ts`, `lib/auth.ts:74-88`, `lib/geo-ip.ts:13-16`

- Both counters are `LRUCache` objects in module memory. On Vercel, Netlify, or any multi-replica deployment, each instance has its own counters; a parallel attacker gets 5 attempts **per instance per 15 minutes**, and every redeploy or cold start resets them.
- The IP comes from the first value of `x-forwarded-for`, which is client-controlled unless the platform overwrites it. Rotating that header yields a fresh IP bucket each request.
- A successful login resets the IP counter too (`lib/auth.ts:135`), so one valid account can clear the limit for an attacker's address.
- There is no protection at all on `/api/auth/forgot-password` or `/api/auth/reset-password`.

The lockout message ("Compte temporairement verrouillé…") also confirms to an attacker that the email exists, which contradicts the enumeration protection elsewhere.

**Recommendation direction:** move counters to a shared store (Redis/Upstash is already a dependency) or the database, key the limit on the account rather than IP+email, trust only the platform-provided client IP, and keep a per-account exponential delay.

### 6. Password policy is too weak, and generated passwords are predictable — High
`lib/auth.ts:105`, `app/api/users/route.ts:114,133-135`, `app/api/auth/reset-password/route.ts:10`, `app/api/system-config/master-password/route.ts:15`

- Minimum length is 6 everywhere, with no complexity rule, no blocklist of common passwords, and no check against known-breached passwords.
- bcrypt cost is 10. Acceptable, but 12 is the current floor for a system holding this data.
- New users without a supplied password get `Math.random().toString(36).slice(-8)` — about 41 bits from a non-cryptographic PRNG, 8 characters, often emailed to the user. `crypto.randomBytes` should be used instead.
- There is no forced rotation or first-login change, and no password history.

### 7. Password reset leaves old sessions alive — Medium
`app/api/auth/reset-password/route.ts:67-76`

The transaction updates the password and marks the token used. It does **not** call `revokeAllUserSessions()` even though that helper exists and is used elsewhere. If an attacker has a live session (stolen cookie, shared laptop), the victim's password reset does not remove them; the attacker keeps access for up to 8 hours and can reset again.

### 8. Password recovery endpoint can be abused — Medium
`app/api/auth/forgot-password/route.ts`

- No rate limit per IP or per email. Each call sends a transactional email; this is an email-bombing vector against a known user and a way to burn SMTP reputation and credits.
- Each request marks all previous unused tokens as used (`:39-42`). An attacker can therefore keep invalidating a legitimate reset link in a loop.
- The response is correctly uniform, which is good.
- Reset tokens are bcrypt-hashed, 32 random bytes, 1-hour expiry, single-use in a transaction — this part is well done.
- `/api/auth/reset-password` verifies the token by bcrypt-comparing against **every** unexpired token for that email in a loop (`:47-55`). With no throttle, this is a cheap CPU-exhaustion path, and it also means old tokens accumulate.

### 9. Click tracking is an open redirect and an unauthenticated write — Medium
`app/api/email/tracking/click/route.ts:9-70`

`?url=` is decoded and passed straight to `NextResponse.redirect()` with no allowlist and no same-origin check. Anyone can send `https://<your-domain>/api/email/tracking/click?url=https://evil.example` and land on a phishing page behind your trusted domain — useful for phishing staff and clients, and it damages domain reputation.

The same handler writes to the database without authentication: with a guessed or observed `eid`, a third party can increment `clickCount`, set `Email.status = 'CLICKED'`, and insert `EmailAuditLog` rows with `userId: 'system'`. That corrupts campaign reporting and the audit trail.

**Recommendation direction:** sign the target URL (HMAC with a server secret) or store an allowlisted link per email id, and treat `eid` as a signed value.

### 10. Webhooks accept unauthenticated calls — Medium
`app/api/email/webhooks/gmail/route.ts:15-55`, `app/api/email/webhooks/outlook/route.ts:14-45`, `app/api/email/webhooks/reachinbox/route.ts:72-75`

- Gmail: no JWT verification of the Pub/Sub push, no shared secret. Anything that can reach the URL can trigger a mailbox sync for any `emailAddress` it names.
- Outlook: accepts any POST; `clientState` is read but not validated against a per-subscription secret.
- ReachInbox: `if (!configuredSecret) return true;` — if the environment variable is not set in an environment, the endpoint is fully open. This fail-open default is the dangerous pattern, not just the missing check.

These endpoints are excluded from the middleware by design (`middleware.ts:74`), so the route is the only gate.

### 11. Stored XSS through email and template HTML — Medium
`components/email/QuickEmailModal.tsx:738`, `components/missions/MissionWorkspace.tsx:3756,3864,4026,4136,4319`, `components/drawers/UnifiedActionDrawer.tsx:3403`

Inbound email bodies and template previews are injected with `dangerouslySetInnerHTML` without sanitising, while `ThreadView.tsx:762` and `AiEmailDraftDialog.tsx:295` do use `sanitizeHtml()`. Inbound email HTML is attacker-controlled by design (anyone can email the company), so a crafted message can run script in a Manager's session inside the CRM origin: read data from the API as that user, rewrite a bank detail, or trigger exports.

The JWT cookie is `httpOnly`, which prevents direct token theft, but it does not prevent actions performed with the session. The CSP (`next.config.ts:44`) allows `unsafe-inline` and `unsafe-eval`, so it does not stop this.

**Recommendation direction:** apply the existing `sanitizeHtml()` to every sink, and render message bodies in a sandboxed iframe with a restrictive CSP.

### 12. `callbackUrl` is used without validation after login — Medium
`app/login/LoginForm.tsx:85,262-295`

The destination is `searchParams.get("callbackUrl") || "/dashboard"`, and after a successful sign-in `router.push(destination)` is called with that raw value. NextAuth's own redirect validates the URL, but this manual navigation bypasses that check. At minimum this is an open redirect after login (`/login?callbackUrl=https://evil.example`); with a `javascript:`/`data:` value the behaviour depends on the client router and must be confirmed at runtime.

**Recommendation direction:** accept only a relative path that starts with `/` and is not `//`, otherwise fall back to the role dashboard.

### 13. Role and tenant are frozen in the token for 8 hours — Medium
`lib/auth.ts:200-233`, `session: { maxAge: 8 * 60 * 60 }`

`role`, `clientId`, and `interlocuteurId` are copied into the JWT at sign-in and never refreshed; only `isActive` and the session revocation are re-checked (`isSessionValid`). Consequences:

- A user demoted from Manager to SDR keeps Manager API access until the token expires or the account is deactivated.
- A client user moved to another client keeps the old `clientId` for the same period — a cross-tenant read path.
- Deleting or transferring a user requires deactivating the account, not just changing the role.

### 14. Raw SQL tool relies on a keyword blocklist — Medium
`lib/api-v1/admin-db-tools.ts:363-409`

`admin_db_sql` runs `db.$queryRawUnsafe(sql, ...params)` after checking that the statement starts with `SELECT`/`WITH` and contains none of twelve forbidden words. The guard is restricted to all-clients keys backed by an active Manager, which is the right gate — but the blocklist itself is not a security boundary:

- Data-modifying CTEs are caught by the `insert|update|delete` words, but side-effecting functions are not: `pg_read_file`, `pg_ls_dir`, `lo_import`, `dblink`, `pg_sleep`, `set_config`, `pg_terminate_backend`.
- Word-boundary regexes are bypassed with comments, string concatenation, or identifiers.
- `pg_sleep` alone is a denial-of-service tool against the database connection pool.

Because the same key can already read every tenant, the incremental confidentiality loss is limited, but integrity and availability are not protected by this check.

**Recommendation direction:** run this tool on a database role that only has `SELECT` on the intended views, and set `statement_timeout`.

### 15. API key accepted in the query string — Medium
`lib/api-v1/auth.ts:35-42`, `app/api/mcp/route.ts:20`

`withUrlKey()` lets `/api/mcp` authenticate with `?key=cp_live_…`. Query strings land in access logs, reverse-proxy logs, browser history, and `Referer` headers. API keys are hashed at rest and scoped correctly, but a key that leaks through logs is still a working key.

### 16. Saved accounts on the login page — Low
`app/login/LoginForm.tsx:117-136,158-198`

Email, display name, role, and last-login time for up to five accounts are stored in `localStorage` under `cp_enterprise_saved_accounts`. On a shared or kiosk machine this discloses who has access and their privilege level; it also lets the next person see which account to target. It is a convenience feature, not a vulnerability, but it should be opt-in per device and cleared on sign-out.

### 17. Lockout can be weaponised — Low
`lib/rate-limit.ts:64-73`, `lib/auth.ts:81-88`

Five failures against a known email lock that account for 15 minutes, and the message reveals the lock. Anyone who knows a colleague's address can keep them locked out during a working day. Combined with finding 5, the protection is easy to bypass for an attacker yet disruptive for a legitimate user — the worst of both.

### 18. Intake endpoint details — Low
`app/api/prospects/intake/route.ts:89-136`

- `apiKey !== expectedApiKey` is a plain string comparison (timing signal); `crypto.timingSafeEqual` is already used correctly a few lines below for the webhook signature.
- The per-source API key is stored in plaintext inside `Source.metadata`.
- The HMAC signature for `WEB_FORM` sources is optional: if no `webhookSecret` is configured, the endpoint accepts unsigned submissions. That is a per-source configuration risk rather than a code bug, but nothing forces the secret to exist.

### 19. Browser and build hardening — Low
`next.config.ts`

- CSP contains `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, which removes most of its XSS value (see finding 11).
- `typescript.ignoreBuildErrors: true` means type errors ship to production. Some classes of security bug (wrong field names, unhandled null user, wrong session shape) are exactly what the type system catches.
- Positive: `X-Frame-Options: DENY`, `nosniff`, HSTS with `preload`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors 'none'` are all present.

### 20. Session check fails open — Low
`lib/user-session.ts:87-117`

If the database query throws, `isSessionValid()` returns `true`. The comment explains this is deliberate (avoid locking everyone out during an outage). It is a reasonable trade-off for availability, but it means a database disturbance silently disables deactivation and force-logout. Worth an alert on the catch branch.

---

## 4. What is done well

These are real strengths and should not be lost in a refactor:

- **Password storage:** bcrypt with a per-user salt; no plaintext or reversible passwords.
- **Reset tokens:** 32 bytes of `crypto.randomBytes`, stored only as a bcrypt hash, one hour, single-use inside a transaction, previous tokens invalidated.
- **Enumeration:** forgot-password returns success in every branch; unknown-user logins return `null`.
- **Session design:** short 8-hour JWT, `httpOnly` + `SameSite=Lax` + `Secure` in production, `__Secure-` prefix, per-device `UserSession` rows with revocation, and a 20-second validity cache that is explicitly documented as a trade-off.
- **Public API (`/api/v1`):** SHA-256 hashed keys, prefix validation, scopes, tenant binding from the key (never from the request), all-clients keys gated on an active Manager issuer, per-key per-minute and per-hour limits, usage audit log, `Cache-Control: no-store`.
- **Vault:** AES-256-GCM with PBKDF2-SHA512 (100k iterations), a random salt and IV per record, no fallback key when `ENCRYPTION_KEY` is missing, Manager-only access, password excluded from the metadata payload, and reveal events recorded with the requesting user.
- **Tenant isolation in sampled routes:** `client/database/[companyId]` scopes the company through the client's visible missions before returning anything; `client/files/[id]` verifies ownership and mutation rights.
- **Header hygiene:** HSTS, frame denial, `nosniff`, and a referrer policy are set globally.
- **Route coverage:** the 40 routes without an in-route auth call are all wrapped by `v1Route()`, are provider webhooks, or are tracking/auth endpoints — there is no forgotten open CRUD endpoint in the current tree.

---

## 5. Priority plan (when you decide to fix)

**P0 — this week**
1. Remove or redesign the master password (finding 1); audit `AuthEvent` for `usedMasterPassword` hits.
2. Rotate the seeded Manager account (finding 2) and purge the plaintext from git history.
3. Remove the `x-api-key` bypass from the middleware (finding 3).

**P1 — this month**
4. Shared-store rate limiting, trusted client IP, throttling on the two password endpoints (finding 5).
5. Password policy: minimum 12, breach check, `crypto`-generated passwords, bcrypt cost 12 (finding 6).
6. Revoke all sessions on password reset (finding 7), plus a "signed in elsewhere" notice email.
7. MFA for Manager and Client accounts, step-up before credential reveal (finding 4).
8. Sanitise every HTML sink and sandbox message rendering (finding 11).

**P2 — next quarter**
9. Webhook signature verification with a fail-closed default (finding 10).
10. Signed tracking links; allowlist redirects (finding 9).
11. DB-role-based read-only access for the SQL tool (finding 14).
12. Refresh role/tenant from the database on each session read (finding 13).
13. Validate `callbackUrl`; clear saved accounts on sign-out (findings 12, 16).
14. Tighten CSP, remove `ignoreBuildErrors` (finding 19).

---

## 6. Limits of this review

- Everything above comes from reading code, not from testing a running instance. No login attempt, payload, or scan was sent.
- Environment values were not read, so I cannot confirm whether `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, and the webhook secrets are actually set in production — several findings (10, 20) depend on that.
- Dependency vulnerabilities were not enumerated (`npm audit` was not run), and Next.js 16.1.1 / next-auth 4.24.13 were not checked against current advisories.
- The ~40 routes read in detail are a sample; the other 441 were checked only for the presence of an auth call, not for correct tenant scoping inside the handler.
- Findings 12 (open redirect / `javascript:` behaviour) and 20 (outage behaviour) need runtime confirmation before being treated as confirmed exploits.
