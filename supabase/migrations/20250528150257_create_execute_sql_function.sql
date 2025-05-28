CREATE OR REPLACE FUNCTION public.execute_sql(query TEXT)
RETURNS SETOF JSON -- Or JSONB, if you prefer to work with JSONB in your client
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY EXECUTE query;
END;
$$;

-- GRANT EXECUTE ON FUNCTION public.execute_sql(TEXT) TO service_role; -- service_role usually has this by default 