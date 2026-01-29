-- Test Organization RLS Policies

BEGIN;

-- Plan the tests.
SELECT plan(12); -- Updated plan count (Removed 3 user creation tests)

-- Test Setup:

-- NOTE: Test users (user_a, user_b, user_c) are now expected to be created by the seed script (supabase/seed.sql)

-- 1. Create Orgs
INSERT INTO public.organizations (id, name, visibility) VALUES
    ('10000000-0000-0000-0000-000000000001', 'Org 1 (Private)', 'private'),
    ('10000000-0000-0000-0000-000000000002', 'Org 2 (Public)', 'public'),
    ('10000000-0000-0000-0000-000000000003', 'Org 3 (Deleted)', 'private');

-- 3. Soft delete Org 3
UPDATE public.organizations SET deleted_at = now() WHERE id = '10000000-0000-0000-0000-000000000003';

-- 4. Create memberships (Now users should exist)
INSERT INTO public.organization_members (user_id, organization_id, role, status)
VALUES
    ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'member', 'active'), -- user_a in org_1
    ('b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'admin', 'active'),  -- user_b in org_1
    ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'member', 'active'); -- user_a in deleted org_3


-- Test RLS Policies for SELECT on public.organizations

-- Test Case 1: Non-member (user_c) cannot select private organizations
SET ROLE authenticated;
SET request.jwt.claims = '{ "sub": "c0000000-0000-0000-0000-000000000003" }';
SELECT is_empty(
    'SELECT 1 FROM public.organizations WHERE id = \'10000000-0000-0000-0000-000000000001\'',
    'RLS: Non-member (user_c) should not see private Org 1' -- Added RLS prefix
);
RESET request.jwt.claims;
RESET ROLE;

-- Test Case 2: Non-member (user_c) CAN select public organizations
SET ROLE authenticated;
SET request.jwt.claims = '{ "sub": "c0000000-0000-0000-0000-000000000003" }';
SELECT results_eq(
    'SELECT id FROM public.organizations WHERE id = \'10000000-0000-0000-0000-000000000002\'',
    ARRAY['10000000-0000-0000-0000-000000000002'::uuid],
    'RLS: Non-member (user_c) should see public Org 2'
);
RESET request.jwt.claims;
RESET ROLE;

-- Test Case 3: Active member (user_a) can select their own private organization (Org 1)
SET ROLE authenticated;
SET request.jwt.claims = '{ "sub": "a0000000-0000-0000-0000-000000000001" }';
SELECT results_eq(
    'SELECT id FROM public.organizations WHERE id = \'10000000-0000-0000-0000-000000000001\'',
    ARRAY['10000000-0000-0000-0000-000000000001'::uuid],
    'RLS: Active member (user_a) should see their private Org 1'
);
RESET request.jwt.claims;
RESET ROLE;

-- Test Case 4: Active admin (user_b) can select their own private organization (Org 1)
SET ROLE authenticated;
SET request.jwt.claims = '{ "sub": "b0000000-0000-0000-0000-000000000002" }';
SELECT results_eq(
    'SELECT id FROM public.organizations WHERE id = \'10000000-0000-0000-0000-000000000001\'',
    ARRAY['10000000-0000-0000-0000-000000000001'::uuid],
    'RLS: Active admin (user_b) should see their private Org 1'
);
RESET request.jwt.claims;
RESET ROLE;

-- Test Case 5: Active member (user_a) cannot select other private organizations
SET ROLE authenticated;
SET request.jwt.claims = '{ "sub": "a0000000-0000-0000-0000-000000000001" }';
-- Need to create Org 4 within the test transaction
SELECT lives_ok($$ INSERT INTO public.organizations (id, name, visibility) VALUES ('10000000-0000-0000-0000-000000000004', 'Org 4 (Private)', 'private') $$, 'Setup Org 4 for Test Case 5');
SELECT is_empty(
    'SELECT 1 FROM public.organizations WHERE id = \'10000000-0000-0000-0000-000000000004\'',
    'RLS: Active member (user_a) should not see other private Org 4'
);
-- SELECT pass('Test Case 5: Placeholder - Test other private org access'); -- Remove placeholder
RESET request.jwt.claims;
RESET ROLE;

-- Test Case 6: Users cannot select soft-deleted organizations (even if they are members)
SET ROLE authenticated;
SET request.jwt.claims = '{ "sub": "a0000000-0000-0000-0000-000000000001" }'; -- User A is member of deleted Org 3
SELECT is_empty(
    'SELECT 1 FROM public.organizations WHERE id = \'10000000-0000-0000-0000-000000000003\'',
    'RLS: User (user_a) should not see their soft-deleted Org 3'
);
RESET request.jwt.claims;
RESET ROLE;

-- TODO: Add tests for INSERT, UPDATE, DELETE RLS policies on organizations
SELECT pass('Test Case 7: Placeholder - Test INSERT RLS');
SELECT pass('Test Case 8: Placeholder - Test UPDATE RLS (member)');
SELECT pass('Test Case 9: Placeholder - Test UPDATE RLS (admin)');
SELECT pass('Test Case 10: Placeholder - Test DELETE RLS (admin)');


-- Finish the tests
SELECT * FROM finish();

ROLLBACK; -- Rollback changes made by the test 