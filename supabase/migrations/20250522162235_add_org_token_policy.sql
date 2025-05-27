-- Create the ENUM type for token usage policy
CREATE TYPE public.org_token_usage_policy_enum AS ENUM (
    'member_tokens',
    'organization_tokens'
);

-- Add the new column to the organizations table
ALTER TABLE public.organizations
ADD COLUMN token_usage_policy public.org_token_usage_policy_enum 
    NOT NULL 
    DEFAULT 'member_tokens';

-- Optional: Add a comment to the new column for clarity
COMMENT ON COLUMN public.organizations.token_usage_policy IS 
    'Defines which wallet is used for chats created under this organization\''s context. \''member_tokens\'' means the chatting member\''s personal tokens are used. \''organization_tokens\'' means the organization\''s own wallet/tokens are used.';
