-- =============================================================================
-- Migration: Newsletter Events Queue & User Profile Extensions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend user_profiles with newsletter tracking columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN subscribed_at    TIMESTAMPTZ,
  ADD COLUMN unsubscribed_at  TIMESTAMPTZ,
  ADD COLUMN signup_ref       TEXT,
  ADD COLUMN synced_to_kit_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 2. Restrict the UPDATE policy so clients cannot write service-managed columns
--    Drop the old permissive policy and replace with one that uses column checks.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;

CREATE POLICY "Allow individual update access"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Service-managed columns must not change via client updates.
    -- Compare NEW values to OLD values; if any differ the check fails.
    AND subscribed_at    IS NOT DISTINCT FROM (SELECT subscribed_at    FROM public.user_profiles WHERE id = auth.uid())
    AND unsubscribed_at  IS NOT DISTINCT FROM (SELECT unsubscribed_at  FROM public.user_profiles WHERE id = auth.uid())
    AND signup_ref       IS NOT DISTINCT FROM (SELECT signup_ref       FROM public.user_profiles WHERE id = auth.uid())
    AND synced_to_kit_at IS NOT DISTINCT FROM (SELECT synced_to_kit_at FROM public.user_profiles WHERE id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Create the newsletter_events queue table
-- -----------------------------------------------------------------------------
CREATE TABLE public.newsletter_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL CHECK (event_type IN ('subscribe', 'unsubscribe')),
  ref          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for the queue processor: unprocessed events in order
CREATE INDEX idx_newsletter_events_unprocessed
  ON public.newsletter_events (created_at ASC)
  WHERE processed_at IS NULL;

-- RLS: no direct client access — only service_role writes via trigger / edge functions
ALTER TABLE public.newsletter_events ENABLE ROW LEVEL SECURITY;

-- Explicitly deny authenticated and anon (no policies = no access)
-- service_role bypasses RLS by default, so it can still read/write.

-- -----------------------------------------------------------------------------
-- 4. Trigger function: fires BEFORE UPDATE on user_profiles
--    When is_subscribed_to_newsletter changes, enqueue an event and set timestamps.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_newsletter_subscription_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Only act when the subscription flag actually changes
  IF NEW.is_subscribed_to_newsletter IS DISTINCT FROM OLD.is_subscribed_to_newsletter THEN

    IF NEW.is_subscribed_to_newsletter = TRUE THEN
      -- Subscribing
      NEW.subscribed_at   := now();
      NEW.unsubscribed_at := NULL;

      INSERT INTO public.newsletter_events (user_id, event_type, ref)
      VALUES (NEW.id, 'subscribe', NEW.signup_ref);

    ELSE
      -- Unsubscribing
      NEW.unsubscribed_at := now();

      INSERT INTO public.newsletter_events (user_id, event_type)
      VALUES (NEW.id, 'unsubscribe');

    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Attach the trigger
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_newsletter_subscription_change
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_newsletter_subscription_change();
