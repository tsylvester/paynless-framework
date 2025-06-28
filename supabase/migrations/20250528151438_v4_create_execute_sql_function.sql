CREATE OR REPLACE FUNCTION public.execute_sql(query TEXT)
RETURNS SETOF JSON
LANGUAGE plpgsql
AS $$
DECLARE
    constructed_query TEXT;
BEGIN
    -- Construct the query that wraps the input query with row_to_json
    constructed_query := 'SELECT row_to_json(t) FROM (' || query || ') t';
    
    -- Execute the constructed query
    RETURN QUERY EXECUTE constructed_query;
END;
$$;

-- GRANT EXECUTE ON FUNCTION public.execute_sql(TEXT) TO service_role; -- service_role usually has this by default 
