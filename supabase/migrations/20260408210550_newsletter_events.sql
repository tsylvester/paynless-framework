-- Fix infinite recursion in user_profiles UPDATE RLS policy.
--
-- Migration 20260318211742 introduced a WITH CHECK clause that contained
-- subqueries against public.user_profiles from inside a policy defined on
-- public.user_profiles. PostgreSQL raises 42P17 (infinite recursion) for
-- any policy that re-enters RLS evaluation on its own table.
--
-- The column-immutability goal (prevent clients from writing to service-managed
-- newsletter columns) is moved to a BEFORE UPDATE trigger, which has direct
-- access to OLD.* and NEW.* with no RLS re-entry.

-- -----------------------------------------------------------------------------
-- 1. Fix the RLS policy: remove the self-referencing subqueries.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;

CREATE POLICY "Allow individual update access"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 2. Trigger function: guard service-managed newsletter columns.
--    Runs BEFORE UPDATE so it has access to OLD and NEW without touching RLS.
--    service_role bypasses RLS entirely and is allowed to write these columns.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_newsletter_service_columns()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Allow service_role to write service-managed columns freely.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For any other caller, reject changes to service-managed columns.
  IF NEW.subscribed_at    IS DISTINCT FROM OLD.subscribed_at    OR
     NEW.unsubscribed_at  IS DISTINCT FROM OLD.unsubscribed_at  OR
     NEW.signup_ref       IS DISTINCT FROM OLD.signup_ref       OR
     NEW.synced_to_kit_at IS DISTINCT FROM OLD.synced_to_kit_at
  THEN
    RAISE EXCEPTION
      'Columns subscribed_at, unsubscribed_at, signup_ref, and synced_to_kit_at '
      'are service-managed and cannot be modified directly.';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Attach the guard trigger.
--    Runs before handle_newsletter_subscription_change so the guard fires first.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_guard_newsletter_service_columns ON public.user_profiles;

CREATE TRIGGER trg_guard_newsletter_service_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_newsletter_service_columns();
