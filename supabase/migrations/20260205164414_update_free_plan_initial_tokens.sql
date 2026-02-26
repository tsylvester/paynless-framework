-- Migration: Update initial token amount for Free plan from 100000 to 1000000
-- This affects new user signups via the handle_new_user trigger

UPDATE public.subscription_plans
SET tokens_to_award = 1000000
WHERE name = 'Free';
