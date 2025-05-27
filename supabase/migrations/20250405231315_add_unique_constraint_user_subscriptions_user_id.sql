-- Add a unique constraint to the user_id column in the user_subscriptions table.
-- This ensures that a user can only have one entry in this table, which is
-- necessary for the upsert operation in the checkout handler.
ALTER TABLE public.user_subscriptions
ADD CONSTRAINT user_subscriptions_user_id_unique UNIQUE (user_id);
