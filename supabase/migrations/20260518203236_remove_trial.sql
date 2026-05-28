-- Fix: removes 'trialing' from the active status check. 'trialing' is not a valid status in this system and was never written by any handler. The only valid active-subscription status is 'active'.

CREATE OR REPLACE FUNCTION public.current_plan_tier(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_ever_paid BOOLEAN;
  v_tier INTEGER;
BEGIN
  SELECT us.has_ever_paid
  INTO v_has_ever_paid
  FROM public.user_subscriptions us
  WHERE us.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_has_ever_paid IS NOT TRUE THEN
    RETURN 0;
  END IF;

  SELECT sp.tier_level
  INTO v_tier
  FROM public.user_subscriptions us
  INNER JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_tier;
  END IF;

  RETURN 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_plan_tier(UUID) TO service_role, authenticated;
