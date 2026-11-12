#!/bin/sh
# Read-only: which app container talks to the Supabase DB, and which migrations it ships.
for c in captainprospect-crm-v02-qgagjf.1.34hpe9bmqyxwbuxdbwucm6v4r \
         app-navigate-primary-card-8qr23s.1.sol09rqkoyq7ll9ovw718snh7 \
         app-quantify-haptic-application-qjyu1b.1.4kit5nylr3rvrbi1p81e3mn5k ; do
    echo "== $c"
    docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' \
        | grep -E '^(DATABASE_URL|DIRECT_URL)=' \
        | sed -E 's#=postgres(ql)?://[^@]*@# -> #' | cut -c1-95
    docker exec "$c" sh -lc 'ls prisma/migrations 2>/dev/null | tail -3' 2>&1 | head -4
done
