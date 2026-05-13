-- Replace the private/public two-function pattern with a single SECURITY INVOKER function.
--
-- The original design used a private SECURITY DEFINER helper to prevent p_user_id injection.
-- That parameter no longer exists: the public function uses auth.uid() exclusively.
-- user_subscriptions RLS (USING auth.uid() = user_id) makes elevated privilege unnecessary —
-- an authenticated caller cannot read another user's subscription row regardless of function body.

DROP FUNCTION IF EXISTS private.validate_model_tier_access_for_user(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.validate_model_tier_access(p_model_ids UUID[])
RETURNS TABLE(
  valid BOOLEAN,
  user_tier_level INTEGER,
  max_models_per_project INTEGER,
  over_model_limit BOOLEAN,
  disallowed_model_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_tier INTEGER;
  v_max_models INTEGER;
  v_disallowed UUID[];
  v_over_limit BOOLEAN;
  v_valid BOOLEAN;
BEGIN
  SELECT us.tier_level
  INTO v_user_tier
  FROM public.user_subscriptions us
  WHERE us.user_id = auth.uid();

  IF v_user_tier IS NULL THEN
    RAISE WARNING '[validate_model_tier_access] No user_subscriptions row found for auth.uid() %. Defaulting to tier 0 (free, most restrictive). This should not occur in normal operation — all users receive a subscription row on sign-up.', auth.uid();
    v_user_tier := 0;
  END IF;

  SELECT td.max_models_per_project
  INTO v_max_models
  FROM public.tier_definitions td
  WHERE td.level = v_user_tier;

  IF p_model_ids IS NULL OR array_length(p_model_ids, 1) IS NULL THEN
    RETURN QUERY
    SELECT true, v_user_tier, v_max_models, false, '{}'::UUID[];
    RETURN;
  END IF;

  SELECT array_agg(ap.id)
  INTO v_disallowed
  FROM public.ai_providers ap
  WHERE ap.id = ANY(p_model_ids)
    AND ap.min_plan_tier_level > v_user_tier;

  v_over_limit := v_max_models IS NOT NULL
    AND array_length(p_model_ids, 1) > v_max_models;

  v_valid := v_disallowed IS NULL AND NOT v_over_limit;

  RETURN QUERY
  SELECT
    v_valid,
    v_user_tier,
    v_max_models,
    v_over_limit,
    COALESCE(v_disallowed, '{}'::UUID[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_model_tier_access(UUID[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_model_tier_access(UUID[]) FROM PUBLIC, anon;
