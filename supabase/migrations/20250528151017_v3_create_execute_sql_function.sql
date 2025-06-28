CREATE OR REPLACE FUNCTION public.execute_sql(query TEXT) -- Parameter name must match existing if replacing, or be consistent
RETURNS SETOF JSON -- Or JSONB, if you prefer
LANGUAGE plpgsql
AS $$
BEGIN
    -- Use format() to safely construct the query string for EXECUTE
    -- Ensure the parameter name used in format() matches the function signature (here, 'query')
    RETURN QUERY EXECUTE format('SELECT row_to_json(t) FROM (%s) t', query);
END;
$$;

-- GRANT EXECUTE ON FUNCTION public.execute_sql(TEXT) TO service_role; -- service_role usually has this by default 