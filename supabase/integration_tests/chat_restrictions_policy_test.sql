-- Manual Test Script for 'enforce_chat_update_restrictions' Trigger on 'chats' table

-- WARNING: This script modifies data. Run on a development/testing database.
--          Replace placeholders like <UserA_UUID>, <UserB_UUID>, etc. with actual UUIDs from your test users/orgs.
--          You need to manually set the role/claims between tests to simulate different users.

-- =================================
-- 1. SETUP TEST DATA (Run as admin/postgres)
-- =================================

-- Assume you have test users UserA and UserB, and an Organization OrgX already created.
-- Replace with actual UUIDs.
DO $$
DECLARE
    v_user_a_id UUID := '<UserA_UUID>'; -- Replace with actual User A UUID
    v_user_b_id UUID := '<UserB_UUID>'; -- Replace with actual User B UUID
    v_org_x_id UUID := '<OrgX_ID>';     -- Replace with actual Org X UUID
    v_personal_chat_id UUID;
    v_org_chat_id UUID;
BEGIN
    -- Create a personal chat for User A
    INSERT INTO public.chats (user_id, title, organization_id)
    VALUES (v_user_a_id, 'User A Personal Chat Test', NULL)
    RETURNING id INTO v_personal_chat_id;
    RAISE NOTICE 'Created Personal Chat ID: %', v_personal_chat_id;

    -- Create an organizational chat for Org X (initially owned by User A for simplicity)
    -- Assumes User A is an admin or member permitted to create chats in Org X (or RLS allows this specific INSERT)
    INSERT INTO public.chats (user_id, title, organization_id)
    VALUES (v_user_a_id, 'Org X Chat Test', v_org_x_id)
    RETURNING id INTO v_org_chat_id;
    RAISE NOTICE 'Created Org Chat ID: %', v_org_chat_id;

    -- Store IDs in temp table or note them down for later use in tests
    -- For simplicity, we'll reference them directly in the test statements below.
    -- Ensure the IDs generated above are used in the tests.
END $$;

-- =================================
-- 2. TEST ALLOWED UPDATES (No user_id/org_id change)
-- =================================

-- Test 2.1: User A updates title of their personal chat
-- EXPECTED: SUCCEED (RLS allows owner, Trigger allows title change)
-- RUN AS: User A (e.g., SET ROLE authenticated; SET request.jwt.claims = '{"sub": "<UserA_UUID>"}';)
DO $$
DECLARE
    v_personal_chat_id UUID := (SELECT id FROM public.chats WHERE title = 'User A Personal Chat Test' AND organization_id IS NULL AND user_id = '<UserA_UUID>' LIMIT 1);
BEGIN
    RAISE NOTICE 'Attempting to update title for Personal Chat ID: % as User A', v_personal_chat_id;
    UPDATE public.chats SET title = 'User A Personal Updated Title' WHERE id = v_personal_chat_id;
    RAISE NOTICE 'SUCCESS: User A updated personal chat title.';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'FAILURE: Updating personal chat title failed: %', SQLERRM;
END $$;
-- RESET ROLE; -- Important to reset role after test

-- Test 2.2: Org Admin updates title of org chat
-- EXPECTED: SUCCEED (RLS allows admin, Trigger allows title change)
-- RUN AS: An Admin of Org X (e.g., SET ROLE authenticated; SET request.jwt.claims = '{"sub": "<OrgAdmin_UUID>"}';)
DO $$
DECLARE
    v_org_chat_id UUID := (SELECT id FROM public.chats WHERE title = 'Org X Chat Test' AND organization_id = '<OrgX_ID>' LIMIT 1);
BEGIN
    RAISE NOTICE 'Attempting to update title for Org Chat ID: % as Org Admin', v_org_chat_id;
    UPDATE public.chats SET title = 'Org X Updated Title' WHERE id = v_org_chat_id;
    RAISE NOTICE 'SUCCESS: Org Admin updated org chat title.';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'FAILURE: Updating org chat title failed: %', SQLERRM;
END $$;
-- RESET ROLE; -- Important to reset role after test


-- =================================
-- 3. TEST DISALLOWED UPDATES (Trigger should prevent)
-- =================================

-- Test 3.1: User A tries to change user_id of their personal chat
-- EXPECTED: FAIL (Trigger prevents user_id change)
-- RUN AS: User A
DO $$
DECLARE
    v_personal_chat_id UUID := (SELECT id FROM public.chats WHERE title LIKE 'User A Personal Updated Title%' AND organization_id IS NULL AND user_id = '<UserA_UUID>' LIMIT 1);
    v_user_b_id UUID := '<UserB_UUID>';
BEGIN
    RAISE NOTICE 'Attempting to change user_id for Personal Chat ID: % as User A', v_personal_chat_id;
    UPDATE public.chats SET user_id = v_user_b_id WHERE id = v_personal_chat_id;
    RAISE NOTICE 'FAILURE: Trigger did not prevent user_id change!'; -- Should not reach here
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'SUCCESS: Trigger prevented user_id change: %', SQLERRM; -- Expected path
END $$;
-- RESET ROLE;

-- Test 3.2: User A tries to change organization_id of their personal chat
-- EXPECTED: FAIL (Trigger prevents organization_id change)
-- RUN AS: User A
DO $$
DECLARE
    v_personal_chat_id UUID := (SELECT id FROM public.chats WHERE title LIKE 'User A Personal Updated Title%' AND organization_id IS NULL AND user_id = '<UserA_UUID>' LIMIT 1);
    v_org_x_id UUID := '<OrgX_ID>';
BEGIN
    RAISE NOTICE 'Attempting to change organization_id for Personal Chat ID: % as User A', v_personal_chat_id;
    UPDATE public.chats SET organization_id = v_org_x_id WHERE id = v_personal_chat_id;
    RAISE NOTICE 'FAILURE: Trigger did not prevent organization_id change!'; -- Should not reach here
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'SUCCESS: Trigger prevented organization_id change: %', SQLERRM; -- Expected path
END $$;
-- RESET ROLE;

-- Test 3.3: Org Admin tries to change user_id of an org chat
-- EXPECTED: FAIL (Trigger prevents user_id change)
-- RUN AS: An Admin of Org X
DO $$
DECLARE
    v_org_chat_id UUID := (SELECT id FROM public.chats WHERE title LIKE 'Org X Updated Title%' AND organization_id = '<OrgX_ID>' LIMIT 1);
    v_user_b_id UUID := '<UserB_UUID>';
BEGIN
    RAISE NOTICE 'Attempting to change user_id for Org Chat ID: % as Org Admin', v_org_chat_id;
    UPDATE public.chats SET user_id = v_user_b_id WHERE id = v_org_chat_id;
    RAISE NOTICE 'FAILURE: Trigger did not prevent user_id change!'; -- Should not reach here
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'SUCCESS: Trigger prevented user_id change: %', SQLERRM; -- Expected path
END $$;
-- RESET ROLE;

-- Test 3.4: Org Admin tries to change organization_id of an org chat
-- EXPECTED: FAIL (Trigger prevents organization_id change)
-- RUN AS: An Admin of Org X
DO $$
DECLARE
    v_org_chat_id UUID := (SELECT id FROM public.chats WHERE title LIKE 'Org X Updated Title%' AND organization_id = '<OrgX_ID>' LIMIT 1);
BEGIN
    RAISE NOTICE 'Attempting to change organization_id for Org Chat ID: % as Org Admin', v_org_chat_id;
    UPDATE public.chats SET organization_id = NULL WHERE id = v_org_chat_id;
    RAISE NOTICE 'FAILURE: Trigger did not prevent organization_id change!'; -- Should not reach here
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'SUCCESS: Trigger prevented organization_id change: %', SQLERRM; -- Expected path
END $$;
-- RESET ROLE;


-- =================================
-- 4. CLEANUP (Run as admin/postgres)
-- =================================
DO $$
DECLARE
    v_user_a_id UUID := '<UserA_UUID>';
    v_org_x_id UUID := '<OrgX_ID>';
BEGIN
    RAISE NOTICE 'Cleaning up test chats...';
    DELETE FROM public.chats WHERE user_id = v_user_a_id AND title LIKE 'User A Personal%';
    DELETE FROM public.chats WHERE organization_id = v_org_x_id AND title LIKE 'Org X %';
    RAISE NOTICE 'Cleanup complete.';
END $$;
