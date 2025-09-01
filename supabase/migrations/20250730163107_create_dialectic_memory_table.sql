create extension if not exists vector with schema extensions;

create table public.dialectic_memory (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.dialectic_sessions on delete cascade not null,
    source_contribution_id uuid references public.dialectic_contributions on delete set null,
    content text not null,
    metadata jsonb,
    embedding extensions.vector(1536),
    fts tsvector generated always as (to_tsvector('english', content)) stored,
    created_at timestamptz not null default now()
);

-- Create a GIN index on the new fts column for faster text search
create index on public.dialectic_memory using gin (fts);

-- Enable RLS
alter table public.dialectic_memory enable row level security;

-- Policies
create policy "Users can read memory entries for their own sessions"
on public.dialectic_memory for select
using (
      auth.uid() IN (
      SELECT dp.user_id
      FROM public.dialectic_projects dp
      JOIN public.dialectic_sessions ds ON ds.project_id = dp.id
      WHERE ds.id = dialectic_memory.session_id
    )
);

-- Service roles will be used for insert/update/delete, so no policies are needed for those actions for users.

create or replace function public.match_dialectic_chunks (
  query_embedding extensions.vector(1536),
  query_text text,
  match_threshold float,
  match_count int,
  session_id_filter uuid,
  rrf_k int default 60
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  rank real
)
language plpgsql
as $$
begin
  return query
  with vector_results as (
    select
      dm.id,
      1 - (dm.embedding <=> query_embedding) as similarity,
      row_number() over (order by (dm.embedding <=> query_embedding) asc) as rank
    from public.dialectic_memory dm
    where dm.session_id = session_id_filter and 1 - (dm.embedding <=> query_embedding) > match_threshold
    order by similarity desc
    limit match_count * 2
  ),
  keyword_results as (
    select
      dm.id,
      ts_rank(dm.fts, websearch_to_tsquery('english', query_text)) as similarity,
      row_number() over (order by ts_rank(dm.fts, websearch_to_tsquery('english', query_text)) desc) as rank
    from public.dialectic_memory dm
    where dm.session_id = session_id_filter and dm.fts @@ websearch_to_tsquery('english', query_text)
    order by similarity desc
    limit match_count * 2
  ),
  combined_results as (
    select id, rank from vector_results
    union all
    select id, rank from keyword_results
  ),
  ranked_results as (
    select
      id,
      sum(1.0 / (rrf_k + rank)) as rrf_score
    from combined_results
    group by id
    order by rrf_score desc
    limit match_count
  )
  select
    dm.id,
    dm.content,
    dm.metadata,
    1 - (dm.embedding <=> query_embedding) as similarity,
    rr.rrf_score as rank
  from ranked_results rr
  join public.dialectic_memory dm on dm.id = rr.id
  order by rr.rrf_score desc;
end;
$$;
