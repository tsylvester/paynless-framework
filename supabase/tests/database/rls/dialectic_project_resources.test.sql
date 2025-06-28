-- Test RLS for dialectic_project_resources

BEGIN;

-- Plan the tests
SELECT plan(20); -- Adjusted: 2 anon, 6 owner, 1 other_user_select, 2 other_user_silent_ops, 2 other_user_verify, 7 service

-- Helper to get test_user_id
CREATE OR REPLACE FUNCTION get_test_user_id() RETURNS uuid AS $$
BEGIN
    RETURN current_setting('tests.test_user_id')::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'tests.test_user_id not set, returning NULL';
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Helper to get other_user_id
CREATE OR REPLACE FUNCTION get_other_user_id() RETURNS uuid AS $$
BEGIN
    RETURN current_setting('tests.other_user_id')::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'tests.other_user_id not set, returning NULL';
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Helper to get test_project_id
CREATE OR REPLACE FUNCTION get_test_project_id() RETURNS uuid AS $$
BEGIN
    RETURN current_setting('tests.test_project_id')::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'tests.test_project_id not set, returning NULL';
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- Set up a test user and a dialectic_project
CREATE OR REPLACE FUNCTION test_setup_user_and_project()
RETURNS void AS $$
DECLARE
    v_test_user_id uuid;
    v_test_project_id uuid;
BEGIN
    -- Create a test user in auth.users
    INSERT INTO auth.users (id, email, role, aud, encrypted_password)
    VALUES (gen_random_uuid(), 'testuser_resources@example.com', 'authenticated', 'authenticated', crypt('password123', gen_salt('bf')))
    RETURNING id INTO v_test_user_id;

    -- Store the user_id and project_id in settings for other tests to access
    PERFORM set_config('tests.test_user_id', v_test_user_id::text, false);

    -- Insert a dialectic_project owned by this user
    INSERT INTO public.dialectic_projects (id, user_id, project_name, initial_user_prompt)
    VALUES (gen_random_uuid(), v_test_user_id, 'Test Project for Resources', 'Initial prompt for resource test.')
    RETURNING id INTO v_test_project_id;

    PERFORM set_config('tests.test_project_id', v_test_project_id::text, false);
END;
$$ LANGUAGE plpgsql;

-- Create another test user for negative RLS tests
CREATE OR REPLACE FUNCTION test_setup_other_user()
RETURNS void AS $$
DECLARE
    v_other_user_id uuid;
BEGIN
    INSERT INTO auth.users (id, email, role, aud, encrypted_password)
    VALUES (gen_random_uuid(), 'otheruser_resources@example.com', 'authenticated', 'authenticated', crypt('password123', gen_salt('bf')))
    RETURNING id INTO v_other_user_id;
    PERFORM set_config('tests.other_user_id', v_other_user_id::text, false);
END;
$$ LANGUAGE plpgsql;

-- Run setup
SELECT test_setup_user_and_project();
SELECT test_setup_other_user();

-- Test as an unauthenticated user (anon)
SET ROLE anon;
SELECT is_empty(
    $$ SELECT * FROM public.dialectic_project_resources $$,
    'Anon user cannot SELECT from dialectic_project_resources'
); -- Test 1

SELECT throws_ok(
    $$ INSERT INTO public.dialectic_project_resources (project_id, user_id, file_name, storage_path, mime_type, size_bytes) VALUES (gen_random_uuid(), gen_random_uuid(), 'anon_file.txt', 'anon/anon_file.txt', 'text/plain', 100) $$,
    '42501', 
    'new row violates row-level security policy for table "dialectic_project_resources"',
    'Anon user cannot INSERT into dialectic_project_resources'
); -- Test 2

-- Test as the authenticated user (owner)
RESET ROLE;
SELECT set_config('role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', get_test_user_id()::text, 'role', 'authenticated')::text, false);

CREATE TEMP TABLE owner_resource_vars (resource_id uuid);

SELECT lives_ok(
    format(
        $$ INSERT INTO public.dialectic_project_resources (project_id, user_id, file_name, storage_path, mime_type, size_bytes, resource_description) VALUES (%L, %L, 'owner_file.txt', 'owner/owner_file.txt', 'text/plain', 120, 'Owner resource') RETURNING id $$,
        get_test_project_id(), get_test_user_id()
    ),
    'Owner can INSERT their own resource'
); -- Test 3

INSERT INTO owner_resource_vars (resource_id)
SELECT id FROM public.dialectic_project_resources
WHERE user_id = get_test_user_id() AND file_name = 'owner_file.txt' ORDER BY created_at DESC LIMIT 1;

SELECT results_eq(
    format(
        $$ SELECT file_name FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    $$ VALUES ('owner_file.txt'::text) $$,
    'Owner can SELECT their own resource'
); -- Test 4

SELECT lives_ok(
    format(
        $$ UPDATE public.dialectic_project_resources SET resource_description = 'Updated owner resource' WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    'Owner can UPDATE their own resource'
); -- Test 5
SELECT results_eq(
    format(
        $$ SELECT resource_description FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    $$ VALUES ('Updated owner resource'::text) $$,
    'Resource description was updated by owner'
); -- Test 6

SELECT lives_ok(
    format(
        $$ DELETE FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    'Owner can DELETE their own resource'
); -- Test 7
SELECT is_empty(
    format(
        $$ SELECT * FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    'Owner resource was deleted'
); -- Test 8

INSERT INTO public.dialectic_project_resources (id, project_id, user_id, file_name, storage_path, mime_type, size_bytes)
VALUES ((SELECT resource_id FROM owner_resource_vars LIMIT 1), get_test_project_id(), get_test_user_id(), 'owner_file_for_other.txt', 'owner/other_test.txt', 'text/plain', 150);


-- Test as another authenticated user (non-owner)
SELECT set_config('role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', get_other_user_id()::text, 'role', 'authenticated')::text, false);

SELECT is_empty(
    format(
        $$ SELECT * FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) $$ 
    ),
    'Other user cannot SELECT owner''s resource'
); -- Test 9

SELECT set_config('role', 'authenticated', false); 
SELECT set_config('request.jwt.claims', json_build_object('sub', get_other_user_id()::text, 'role', 'authenticated')::text, false);
SELECT lives_ok(
    format(
        $$ UPDATE public.dialectic_project_resources SET resource_description = 'Attempted update by other' WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) $$
    ),
    'Other user UPDATE attempt runs without error (RLS makes 0 rows targetable)'
); -- Test 10

SELECT set_config('role', 'authenticated', false); 
SELECT set_config('request.jwt.claims', json_build_object('sub', get_other_user_id()::text, 'role', 'authenticated')::text, false);
SELECT lives_ok(
    format(
        $$ DELETE FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) $$
    ),
    'Other user DELETE attempt runs without error (RLS makes 0 rows targetable)'
); -- Test 11

-- Verify resource was not actually updated or deleted by other user
RESET ROLE;
SELECT set_config('role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', get_test_user_id()::text, 'role', 'authenticated')::text, false); 

SELECT results_ne(
    format(
        $$ SELECT resource_description FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    $$ VALUES ('Attempted update by other'::text) $$,
    'Resource description was NOT updated by other user'
); -- Test 12

SELECT isnt_empty(
    format(
        $$ SELECT * FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM owner_resource_vars LIMIT 1) AND user_id = %L $$,
        get_test_user_id()
    ),
    'Resource was NOT deleted by other user'
); -- Test 13


-- Test as service_role
RESET ROLE;
SELECT set_config('role', 'service_role', false);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);

CREATE TEMP TABLE service_target_resource (resource_id uuid);
INSERT INTO service_target_resource (resource_id)
SELECT id FROM public.dialectic_project_resources
WHERE user_id = get_test_user_id() AND file_name = 'owner_file_for_other.txt' LIMIT 1;

SELECT isnt_empty(
    format(
        $$ SELECT * FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM service_target_resource LIMIT 1) $$ 
    ),
    'Service role can SELECT any resource'
); -- Test 14

CREATE TEMP TABLE service_inserted_vars (service_resource_id uuid);
INSERT INTO service_inserted_vars (service_resource_id) VALUES (gen_random_uuid());

SELECT lives_ok(
    format(
        $$ INSERT INTO public.dialectic_project_resources (id, project_id, user_id, file_name, storage_path, mime_type, size_bytes) VALUES ((SELECT service_resource_id FROM service_inserted_vars LIMIT 1), %L, %L, 'service_file.txt', 'service/service_file.txt', 'text/plain', 200) $$,
        get_test_project_id(), get_other_user_id()
    ),
    'Service role can INSERT a resource for any user'
); -- Test 15

SELECT lives_ok(
    format(
        $$ UPDATE public.dialectic_project_resources SET resource_description = 'Updated by service' WHERE id = (SELECT resource_id FROM service_target_resource LIMIT 1) $$
    ),
    'Service role can UPDATE any resource'
); -- Test 16
SELECT results_eq(
    format(
        $$ SELECT resource_description FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM service_target_resource LIMIT 1) $$
    ),
    $$ VALUES ('Updated by service'::text) $$,
    'Resource description was updated by service_role'
); -- Test 17

SELECT lives_ok(
    format(
        $$ DELETE FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM service_target_resource LIMIT 1) $$
    ),
    'Service role can DELETE owner''s resource'
); -- Test 18
SELECT lives_ok(
    format(
        $$ DELETE FROM public.dialectic_project_resources WHERE id = (SELECT service_resource_id FROM service_inserted_vars LIMIT 1) $$
    ),
    'Service role can DELETE its own inserted resource'
); -- Test 19

SELECT is_empty(
    format(
        $$ SELECT * FROM public.dialectic_project_resources WHERE id = (SELECT resource_id FROM service_target_resource LIMIT 1) OR id = (SELECT service_resource_id FROM service_inserted_vars LIMIT 1) $$
    ),
    'Resources deleted by service_role are gone'
); -- Test 20

RESET ROLE;

DROP TABLE IF EXISTS owner_resource_vars;
DROP TABLE IF EXISTS service_target_resource;
DROP TABLE IF EXISTS service_inserted_vars;

SELECT * FROM finish();

ROLLBACK; 