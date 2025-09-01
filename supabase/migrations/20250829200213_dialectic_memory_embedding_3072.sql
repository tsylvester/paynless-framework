-- Switch dialectic_memory embeddings to 3072 dimensions and update RPC accordingly

-- Ensure pgvector extension exists
create extension if not exists vector with schema extensions;

-- Alter column type to extensions.vector(3072)
alter table public.dialectic_memory
  alter column embedding type extensions.vector(3072) using embedding::extensions.vector(3072);

-- Recreate match_dialectic_chunks with 3072-d query_embedding
create or replace function public.match_dialectic_chunks (
  query_embedding extensions.vector(3072),
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


