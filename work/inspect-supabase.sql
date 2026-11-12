\pset pager off
\echo == columns of AssistantProjetConversation ==
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'AssistantProjetConversation'
order by ordinal_position;

\echo == v4 tables present ==
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('AssistantFolder','AssistantMemory','AssistantFileText','AssistantFileChunk','AiUsage','AgentJob')
order by table_name;

\echo == applied migrations (last 10) ==
select migration_name, (finished_at is not null) as ok
from _prisma_migrations
order by started_at desc
limit 10;
