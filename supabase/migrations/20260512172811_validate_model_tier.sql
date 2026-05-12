CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.validate_model_tier_access_for_user(
  p_user_id UUID,
  p_model_ids UUID[]
)
RETURNS TABLE(
  valid BOOLEAN,
  user_tier_level INTEGER,
  max_models_per_project INTEGER,
  over_model_limit BOOLEAN,
  disallowed_model_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
  WHERE us.user_id = p_user_id;

  IF v_user_tier IS NULL THEN
    RAISE WARNING '[validate_model_tier_access_for_user] No user_subscriptions row found for user_id %. Defaulting to tier 0 (free, most restrictive). This should not occur in normal operation - all users receive a subscription row on sign-up.', p_user_id;
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

REVOKE EXECUTE ON FUNCTION private.validate_model_tier_access_for_user(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_model_tier_access_for_user(UUID, UUID[]) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_model_tier_access(p_model_ids UUID[])
RETURNS TABLE(
  valid BOOLEAN,
  user_tier_level INTEGER,
  max_models_per_project INTEGER,
  over_model_limit BOOLEAN,
  disallowed_model_ids UUID[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM private.validate_model_tier_access_for_user(auth.uid(), p_model_ids);
$$;

GRANT EXECUTE ON FUNCTION public.validate_model_tier_access(UUID[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_model_tier_access(UUID[]) FROM PUBLIC, anon;
