# VPS security audit: 173.212.225.37 (mail.suzaliconseil.com), 2026-10-27

This was a read-only audit. Nothing was changed on the server.

## 1. Is anyone in right now?

**No active compromise found.**

| Check | Result |
|---|---|
| Miners / reverse shells (host and all 79 containers) | None. No processes running from /tmp, /dev/shm or deleted binaries. No connections to mining pools. |
| Host persistence | Clean. No `ld.so.preload`, crontabs and systemd units are legitimate, `dpkg --verify` passes on core packages, no rogue kernel modules, no hidden PIDs. |
| SSH keys | 3 keys, all known (coolify, the tunnel-only key, claude-ops). |
| Accounts | Only `root` has a shell. passwd/shadow unchanged since 2026-09-06. |
| Successful SSH logins (14 days) | All from Algerian ISP ranges (105.10x / 41.200 / 154.24x) or internal Docker (10.0.1.x). The China IP seen (180.123.184.17) never got past pre-auth. |
| WordPress sites | No rogue admins (each site has one `admin`), no PHP in uploads, Bières Georges is on 7.1.3 and clean after the earlier cleanup. |
| Postgres brute force | 0 failed auths on db-suzalink since its restart and 0 on supabase-db in the last 24 h. |
| Adminer logins | Successful logins only on 20 Jun and 23–24 Jul (from the team). Since then only scanner probes (`/sdk`, `/mcp`), and none logged in. |

The earlier incident (miner via db-suzalink plus the Bières Georges webshell) looks fully contained.

## 2. Vulnerabilities, worst first

### CRITICAL

1. **Next.js / React RCE, GHSA-xqc2-xf4c-x3h3 (published 14 Oct 2026, unauthenticated).** Affects React 19.2.0–19.2.8. All 13 Next apps run react 19.2.3, including prod CRM (`captainprospect-crm-v02`, next 16.1.1), call-vault, suzalink-web, prospecto, mobiservice and the suzali website. Fix: next ≥ 16.4.1 / react ≥ 19.2.9. These versions also have the Jan and Apr 2026 RSC DoS CVEs.
2. **Coolify 4.0.0-beta.472.** CVE-2026-42204 (command injection) is fixed in beta.474. The panel is public on `:8000` over plain HTTP.
3. **Dokploy v0.29.8.** Several CVSS 9.9 command injections (CVE-2026-72901, -93425, …) are fixed in 0.29.13. The panel is public on `:3000` over plain HTTP.

### HIGH

4. **SSH: root login with password is on**, with ~8,000 failed attempts per day. fail2ban is running (2,052 bans total), but the team still logs in as root with a password. Move to keys only (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`) once everyone has a key.
5. **Docker bypasses UFW.** UFW only allows 22, but these ports are reachable from the internet (verified from outside): 3000 (Dokploy), 8000 (Coolify), 8090 (Dokploy Traefik), 6001/6002 (Coolify realtime), 9000/9002 (MinIO), 32768 (Adminer).
6. **Adminer is public** on `:32768` and on a Coolify domain. Scanners have found it. It sits on `dokploy-network` and can reach every database there, including **supabase-db (prod)** and **db-suzalink**. Remove it, or bind it to 127.0.0.1 and use an SSH tunnel.
7. **db-suzalink password is still 8 characters**: the same database that was brute-forced on 26 Oct. Rotation is still pending (and needs the `db-suzalink-frevpk` env updated).
8. **MinIO (Coolify service `minio-oj9…`) is public** on 9000/9002 with user `minioadmin` and an 11-character password. Anonymous access is denied, but the console is open to brute force.

### MEDIUM

9. **`dokploy-redis` has no password** and sits on `dokploy-network` with 28 containers (every app, plus Adminer). Any compromised app can reach Dokploy's job queue. `plane-redis` also has no auth (it is on its own network, so lower risk).
10. **WordPress `wordpress-h12…`**: WP 6.9.4 with `wp-file-manager` 8.0.4 (a common attack target), elementor-pro and a 9-character DB password. It is currently not publicly routed (it falls through to the Coolify login). Update or delete it.
11. **WordPress `suzali-wordpress-hownb3`**: WP 7.0 (the vulnerable wp2shell version), **never installed**. Anyone who reaches `install.php` gets admin and then RCE. It is not routed today. Delete it.
12. **Weak DB passwords**: scola-plus Postgres (`Admin`, 12 characters), scola-plus Redis (12) and mariadb-h12 (9).
13. **docker.sock is mounted** in `console-agences` (our app), as well as in the Coolify/Dokploy/Traefik/Sentinel/vector containers. An RCE in console-agences means root on the host.
14. **No forensics.** Traefik access logs are off and Postgres `log_connections` is off, which is why the incident left no attacker IPs.

### LOW

15. 3 security apt updates pending. SSH `X11Forwarding yes`. avahi is listening (blocked by UFW).

## 3. Recommended fix order

1. Bump next/react in all Next apps (CRM repo first: `package.json` has next 16.1.1 / react 19.2.3) and redeploy.
2. Upgrade Coolify (≥ beta.474) and Dokploy (≥ 0.29.13).
3. Close the public Docker ports: DOCKER-USER iptables rules, or rebind 3000/8000/8090/6001/6002/9000/9002/32768 to 127.0.0.1 and reach panels through a domain with HTTPS or an SSH tunnel.
4. Remove or lock down Adminer, and rotate the db-suzalink password.
5. Switch SSH to keys only (after the team has keys).
6. Add a Redis password to dokploy-redis. Delete the two unused WordPress sites and rotate the weak DB passwords.
7. Turn on Traefik access logs and Postgres `log_connections`.
