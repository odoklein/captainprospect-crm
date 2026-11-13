#!/bin/sh
# Applies the three pending assistant migrations to the instance Supabase DB.
# The files are idempotent (IF NOT EXISTS / duplicate_object guards).
set -e

DB=supabase-db-y13csb6kbkl12w8ti5pk4ujo
STAMP=$(date -u +%Y%m%d-%H%M%S)

echo "== schema backup =="
docker exec "$DB" pg_dump -U postgres -d postgres --schema-only > "/root/supabase-schema-$STAMP.sql"
ls -l "/root/supabase-schema-$STAMP.sql"

for f in \
    20261030100000_add_assistant_folders_memory_files \
    20261030120000_add_ai_usage \
    20261101120000_add_agent_jobs ; do
    echo "== $f =="
    docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "/root/mig/$f.sql" && echo "ok"
done
