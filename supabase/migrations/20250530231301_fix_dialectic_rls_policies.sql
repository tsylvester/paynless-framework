-- Migration to fix RLS policies for dialectic_projects and dialectic_session_models

BEGIN;

-- 1. Fix RLS for dialectic_projects
-- Dropping policies originally defined in 20250528191135_add_user_domain_overlay_to_dialectic_projects.sql.
-- These might have been manually altered to apply to PUBLIC role, or there's a discrepancy.
DROP POLICY IF EXISTS "Users can manage their own dialectic projects" ON public.dialectic_projects;
DROP POLICY IF EXISTS "Users can read their own dialectic projects (alternative for select)" ON public.dialectic_projects;

-- Create new consolidated policy for AUTHENTICATED users to manage their own projects
CREATE POLICY "auth_users_manage_own_dialectic_projects"
ON public.dialectic_projects
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Fix RLS for dialectic_session_models
-- Dropping policies originally defined in 20250529143234_create_dialectic_session_models.sql.
-- These might have been manually altered to target PUBLIC role, or there's a discrepancy.
DROP POLICY IF EXISTS "Allow authenticated users to read session models for their projects" ON public.dialectic_session_models;
DROP POLICY IF EXISTS "Allow service_role to manage all session models" ON public.dialectic_session_models;

-- Create new SELECT policy for AUTHENTICATED users to read session models for projects they own
CREATE POLICY "auth_users_read_session_models_for_owned_projects"
ON public.dialectic_session_models
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_models.session_id AND dp.user_id = auth.uid()
  )
);

-- Create new ALL policy for SERVICE_ROLE to manage all session models
CREATE POLICY "service_role_manage_all_dialectic_session_models"
ON public.dialectic_session_models
FOR ALL
TO service_role -- Applied directly to service_role
USING (true)
WITH CHECK (true);

COMMIT;
