-- Migration file: YYYYMMDDHHMMSS_create_subscription_transactions.sql

CREATE TABLE public.subscription_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Stripe Event Details for Idempotency and Context
    stripe_event_id text UNIQUE NOT NULL, -- Ensures each event is processed only once
    event_type text NOT NULL,             -- e.g., 'checkout.session.completed', 'invoice.paid'
    status text NOT NULL DEFAULT 'processing', -- e.g., 'processing', 'succeeded', 'failed', 'skipped'

    -- Stripe Object IDs (nullable as they depend on event type)
    stripe_checkout_session_id text,
    stripe_subscription_id text,
    stripe_customer_id text,             -- Useful for linking events
    stripe_invoice_id text,
    stripe_payment_intent_id text,

    -- Financial Details (nullable)
    amount integer,                      -- Amount in smallest currency unit (e.g., cents)
    currency text,

    -- Store the relevant part of the event payload for debugging/auditing if needed
    -- Be mindful of PII and storage size if enabling this.
    -- event_payload jsonb,

    -- Foreign key to user_subscriptions (optional, but helpful)
    -- Link to the subscription this event affected, if applicable.
    -- Might be null initially until the user_subscription is created/updated.
    user_subscription_id uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX idx_subscription_transactions_user_id ON public.subscription_transactions(user_id);
CREATE INDEX idx_subscription_transactions_stripe_event_id ON public.subscription_transactions(stripe_event_id);
CREATE INDEX idx_subscription_transactions_stripe_subscription_id ON public.subscription_transactions(stripe_subscription_id);
CREATE INDEX idx_subscription_transactions_event_type ON public.subscription_transactions(event_type);

-- Optional: Add comment for clarity
COMMENT ON COLUMN public.subscription_transactions.stripe_event_id IS 'Unique Stripe event ID used for idempotency.';
COMMENT ON COLUMN public.subscription_transactions.status IS 'Processing status of the webhook event handler.';

-- Enable Row Level Security (Important!)
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Policies: Define who can access this data. Typically, only service roles
-- need access on the backend. No frontend access should be needed.
-- Example (Restrictive - only service_role can do anything):
CREATE POLICY "Allow service_role access"
ON public.subscription_transactions
FOR ALL
USING (false)  -- No one can SELECT unless explicitly allowed below (or bypasses RLS)
WITH CHECK (false); -- No one can INSERT/UPDATE/DELETE unless explicitly allowed (or bypasses RLS)

-- If you needed admins (or specific users) to *read* transactions, you'd add specific SELECT policies.
-- Example Admin Read Access (if you have an 'admin' role in user_profiles):
-- CREATE POLICY "Allow admin read access"
-- ON public.subscription_transactions
-- FOR SELECT
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.user_profiles
--     WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
--   )
-- );

