CREATE OR REPLACE FUNCTION public.execute_sql(query TEXT)
RETURNS SETOF JSON -- Or JSONB, if you prefer
LANGUAGE plpgsql
AS $$
BEGIN
    -- Wrap the dynamic query and use row_to_json to ensure each row is a single JSON object
    RETURN QUERY EXECUTE 'SELECT row_to_json(t) FROM (' || query || ') t';
END;
$$;

-- GRANT EXECUTE ON FUNCTION public.execute_sql(TEXT) TO service_role; -- service_role usually has this by default 