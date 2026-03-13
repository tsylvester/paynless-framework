-- Create github_connections table for storing GitHub App installation references
-- Stores each user's GitHub App installation reference, GitHub user ID, and GitHub username
-- No access tokens stored; tokens are generated on-demand using the GitHub App private key
-- One installation per user enforced via UNIQUE constraint on user_id

CREATE TABLE public.github_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    installation_id bigint NOT NULL,
    installation_target_type text NOT NULL CHECK (installation_target_type IN ('User', 'Organization')),
    installation_target_id bigint NOT NULL,
    github_user_id text NOT NULL,
    github_username text NOT NULL,
    permissions jsonb,
    suspended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT github_connections_user_id_key UNIQUE (user_id),
    CONSTRAINT github_connections_installation_id_key UNIQUE (installation_id)
);

COMMENT ON TABLE public.github_connections IS 'Stores GitHub App installation references for each user. One installation per user. No access tokens stored.';
COMMENT ON COLUMN public.github_connections.id IS 'Primary key UUID';
COMMENT ON COLUMN public.github_connections.user_id IS 'FK to auth.users; cascades on delete';
COMMENT ON COLUMN public.github_connections.installation_id IS 'GitHub App installation ID';
COMMENT ON COLUMN public.github_connections.installation_target_type IS 'User or Organization';
COMMENT ON COLUMN public.github_connections.installation_target_id IS 'GitHub account ID that installed the app';
COMMENT ON COLUMN public.github_connections.github_user_id IS 'GitHub user numeric ID (fetched from GitHub API after installation)';
COMMENT ON COLUMN public.github_connections.github_username IS 'GitHub username (fetched from GitHub API after installation)';
COMMENT ON COLUMN public.github_connections.permissions IS 'Snapshot of permissions granted at install time';
COMMENT ON COLUMN public.github_connections.suspended_at IS 'NULL if active; timestamp if user suspended the installation';
COMMENT ON COLUMN public.github_connections.created_at IS 'Row creation timestamp';
COMMENT ON COLUMN public.github_connections.updated_at IS 'Row last update timestamp';

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY github_connections_select_own
    ON public.github_connections
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY github_connections_delete_own
    ON public.github_connections
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
