#!/bin/sh
# Verifies the assistant v4 SQL: idempotent re-run, resulting columns/tables,
# and a conversation insert that mimics Prisma (rolled back).
DB=supabase-db-y13csb6kbkl12w8ti5pk4ujo

echo "== re-run for idempotency =="
docker exec -i "$DB" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 \
    < /root/mig/assistant-v4.sql > /tmp/apply.log 2>&1
echo "exit=$?"
grep -iE '^(ERROR|FATAL)' /tmp/apply.log || echo "no errors"

echo "== conversation columns =="
docker exec -i "$DB" psql -U postgres -d postgres -A -t -c \
  "select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns where table_name='AssistantProjetConversation';"

echo "== v4 tables =="
docker exec -i "$DB" psql -U postgres -d postgres -A -t -c \
  "select table_name from information_schema.tables
    where table_schema='public'
      and table_name in ('AssistantProjetRun','AssistantProjetEvidence',
                         'AssistantProjetFolder','AssistantProjetMemory',
                         'AssistantProjetFileText','AssistantProjetFileChunk',
                         'AssistantProjetPin','AiUsage','AgentJob','AgentRun','AgentStep')
    order by table_name;"

echo "== run counters =="
docker exec -i "$DB" psql -U postgres -d postgres -A -t -c \
  "select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns where table_name='AssistantProjetRun'
       and column_name in ('cachedInputTokens','reasoningTokens','tier','provider','verification');"

echo "== insert test (rolled back) =="
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO "AssistantProjetConversation"
    (id, "clientId", "missionId", "createdById", title, kind, visibility,
     "messageCount", "createdAt", "updatedAt")
VALUES
    ('qa_v4_insert', NULL, NULL, (SELECT id FROM "User" LIMIT 1), 'Vue agence',
     'CHAT', 'PRIVATE', 0, now(), now());
SELECT id, title, kind, visibility FROM "AssistantProjetConversation" WHERE id = 'qa_v4_insert';
ROLLBACK;
SQL
echo "insert_exit=$?"
