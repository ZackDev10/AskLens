-- db/migrations/02_hybrid_search.sql

create or replace function hybrid_search(
    query_text text,
    query_embedding vector(384), -- Matches the HuggingFace embedder dimension
    match_limit int default 5
) returns table (
    id uuid,
    document_id uuid,
    content text,
    page_number int,
    similarity float
)
language sql
as $$
with vector_search as (
    -- Semantic search using cosine distance (<=>)
    select
        id,
        row_number() over (order by embedding <=> query_embedding) as rank
    from chunks
    limit 100
),
keyword_search as (
    -- Full-text search using the 'simple' dictionary for multilingual support
    select
        id,
        row_number() over (order by ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) desc) as rank
    from chunks
    where fts @@ websearch_to_tsquery('simple', query_text)
    limit 100
)
select
    chunks.id,
    chunks.document_id,
    chunks.content,
    chunks.page_number,
    -- Reciprocal Rank Fusion (RRF) formula: 1 / (k + rank), where k=60 is standard
    coalesce(1.0 / (60 + vector_search.rank), 0.0) +
    coalesce(1.0 / (60 + keyword_search.rank), 0.0) as similarity
from chunks
left join vector_search on chunks.id = vector_search.id
left join keyword_search on chunks.id = keyword_search.id
where vector_search.id is not null or keyword_search.id is not null
order by similarity desc
limit match_limit;
$$;