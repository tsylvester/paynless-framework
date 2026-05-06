CREATE OR REPLACE FUNCTION public.complete_checkout_payment(
  p_user_id UUID,
  p_is_subscription_mode BOOLEAN,
  p_payment_transaction_id UUID,
  p_gateway_transaction_id TEXT,
  p_plan_id UUID DEFAULT NULL,
  p_subscription_status TEXT DEFAULT NULL,
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT NULL,
  p_target_wallet_id UUID DEFAULT NULL,
  p_tokens_to_award NUMERIC DEFAULT 0,
  p_token_idempotency_key TEXT DEFAULT NULL,
  p_token_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  status TEXT,
  tier_level INTEGER,
  token_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_transaction_id UUID;
  v_tier_level INTEGER;
  v_payment_status TEXT;
  v_status TEXT;
  v_existing_status TEXT;
  v_existing_gateway_transaction_id TEXT;
  v_existing_token_transaction_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_payment_transaction_id IS NULL THEN
    RAISE EXCEPTION 'p_payment_transaction_id is required';
  END IF;

  IF p_gateway_transaction_id IS NULL OR p_gateway_transaction_id = '' THEN
    RAISE EXCEPTION 'p_gateway_transaction_id is required';
  END IF;

  IF p_tokens_to_award < 0 THEN
    RAISE EXCEPTION 'p_tokens_to_award cannot be negative';
  END IF;

  IF p_is_subscription_mode THEN
    IF p_plan_id IS NULL THEN
      RAISE EXCEPTION 'p_plan_id is required when p_is_subscription_mode is true';
    END IF;
    IF p_subscription_status IS NULL OR p_subscription_status = '' THEN
      RAISE EXCEPTION 'p_subscription_status is required when p_is_subscription_mode is true';
    END IF;
    IF p_stripe_customer_id IS NULL OR p_stripe_customer_id = '' THEN
      RAISE EXCEPTION 'p_stripe_customer_id is required when p_is_subscription_mode is true';
    END IF;
    IF p_stripe_subscription_id IS NULL OR p_stripe_subscription_id = '' THEN
      RAISE EXCEPTION 'p_stripe_subscription_id is required when p_is_subscription_mode is true';
    END IF;

    INSERT INTO public.user_subscriptions (
      user_id,
      plan_id,
      status,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      updated_at
    )
    VALUES (
      p_user_id,
      p_plan_id,
      p_subscription_status,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_period_start,
      p_period_end,
      COALESCE(p_cancel_at_period_end, false),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = now();
  END IF;

  SELECT
    pt.status,
    pt.gateway_transaction_id
  INTO
    v_existing_status,
    v_existing_gateway_transaction_id
  FROM public.payment_transactions pt
  WHERE pt.id = p_payment_transaction_id
    AND pt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_transactions row not found for id % and user_id %', p_payment_transaction_id, p_user_id;
  END IF;

  IF v_existing_status = 'COMPLETED' THEN
    IF v_existing_gateway_transaction_id IS NOT NULL
       AND v_existing_gateway_transaction_id IS DISTINCT FROM p_gateway_transaction_id THEN
      RAISE EXCEPTION
        'payment_transactions % is already COMPLETED with gateway_transaction_id %, got %',
        p_payment_transaction_id,
        v_existing_gateway_transaction_id,
        p_gateway_transaction_id;
    END IF;

    SELECT twt.transaction_id
    INTO v_token_transaction_id
    FROM public.token_wallet_transactions twt
    WHERE twt.payment_transaction_id = p_payment_transaction_id
      AND twt.transaction_type = 'CREDIT_PURCHASE'
    ORDER BY twt.timestamp DESC
    LIMIT 1;

    v_tier_level := public.current_plan_tier(p_user_id);

    RETURN QUERY
    SELECT
      'ALREADY_COMPLETED'::TEXT,
      v_tier_level,
      v_token_transaction_id;
    RETURN;
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'COMPLETED',
    gateway_transaction_id = p_gateway_transaction_id,
    updated_at = now()
  WHERE id = p_payment_transaction_id
    AND user_id = p_user_id
  RETURNING status INTO v_payment_status;

  IF p_tokens_to_award > 0 THEN
    IF p_target_wallet_id IS NULL THEN
      RAISE EXCEPTION 'p_target_wallet_id is required when p_tokens_to_award > 0';
    END IF;
    IF p_token_idempotency_key IS NULL OR p_token_idempotency_key = '' THEN
      RAISE EXCEPTION 'p_token_idempotency_key is required when p_tokens_to_award > 0';
    END IF;

    SELECT twt.transaction_id
    INTO v_existing_token_transaction_id
    FROM public.token_wallet_transactions twt
    WHERE twt.payment_transaction_id = p_payment_transaction_id
      AND twt.transaction_type = 'CREDIT_PURCHASE'
    ORDER BY twt.timestamp DESC
    LIMIT 1;

    IF v_existing_token_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION
        'duplicate token award prevented: payment_transaction_id % already has CREDIT_PURCHASE transaction %',
        p_payment_transaction_id,
        v_existing_token_transaction_id;
    END IF;

    SELECT rtt.transaction_id
    INTO v_token_transaction_id
    FROM public.record_token_transaction(
      p_target_wallet_id,
      'CREDIT_PURCHASE',
      p_tokens_to_award::TEXT,
      p_user_id,
      p_token_idempotency_key,
      p_payment_transaction_id::TEXT,
      'payment_transactions',
      p_token_notes,
      p_payment_transaction_id
    ) AS rtt
    LIMIT 1;

    v_status := 'COMPLETED_WITH_TOKEN_AWARD';
  ELSE
    v_status := 'COMPLETED_NO_TOKEN_AWARD';
  END IF;

  v_tier_level := public.refresh_user_tier(p_user_id, true);

  RETURN QUERY
  SELECT
    COALESCE(v_status, v_payment_status, 'COMPLETED'),
    v_tier_level,
    v_token_transaction_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.complete_checkout_payment(
  UUID,
  BOOLEAN,
  UUID,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  UUID,
  NUMERIC,
  TEXT,
  TEXT
) IS 'Atomically finalizes checkout: optional subscription upsert, payment completion, optional token credit, and tier refresh.';

GRANT EXECUTE ON FUNCTION public.complete_checkout_payment(
  UUID,
  BOOLEAN,
  UUID,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  UUID,
  NUMERIC,
  TEXT,
  TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_checkout_payment(
  UUID,
  BOOLEAN,
  UUID,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  UUID,
  NUMERIC,
  TEXT,
  TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.complete_checkout_payment(
  UUID,
  BOOLEAN,
  UUID,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  UUID,
  NUMERIC,
  TEXT,
  TEXT
) FROM anon;

REVOKE ALL ON FUNCTION public.complete_checkout_payment(
  UUID,
  BOOLEAN,
  UUID,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  UUID,
  NUMERIC,
  TEXT,
  TEXT
) FROM authenticated;

CREATE OR REPLACE FUNCTION public.complete_invoice_payment(
  p_user_id UUID,
  p_target_wallet_id UUID,
  p_gateway_transaction_id TEXT,
  p_tokens_to_award NUMERIC,
  p_amount_fiat INTEGER,
  p_currency TEXT,
  p_metadata JSONB,
  p_token_idempotency_key TEXT DEFAULT NULL,
  p_token_notes TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  payment_transaction_id UUID,
  tier_level INTEGER,
  token_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_tier_level INTEGER;
  v_token_transaction_id UUID;
  v_existing_status TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_target_wallet_id IS NULL THEN
    RAISE EXCEPTION 'p_target_wallet_id is required';
  END IF;

  IF p_gateway_transaction_id IS NULL OR p_gateway_transaction_id = '' THEN
    RAISE EXCEPTION 'p_gateway_transaction_id is required';
  END IF;

  IF p_tokens_to_award < 0 THEN
    RAISE EXCEPTION 'p_tokens_to_award cannot be negative';
  END IF;

  SELECT
    pt.id,
    pt.status
  INTO
    v_payment_id,
    v_existing_status
  FROM public.payment_transactions pt
  WHERE pt.payment_gateway_id = 'stripe'
    AND pt.gateway_transaction_id = p_gateway_transaction_id
    AND pt.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_status = 'COMPLETED' THEN
      SELECT twt.transaction_id
      INTO v_token_transaction_id
      FROM public.token_wallet_transactions twt
      WHERE twt.payment_transaction_id = v_payment_id
        AND twt.transaction_type = 'CREDIT_PURCHASE'
      ORDER BY twt.timestamp DESC
      LIMIT 1;

      v_tier_level := public.current_plan_tier(p_user_id);

      RETURN QUERY
      SELECT
        v_payment_id,
        v_tier_level,
        v_token_transaction_id;
      RETURN;
    END IF;

    UPDATE public.payment_transactions
    SET
      status = 'PROCESSING',
      target_wallet_id = p_target_wallet_id,
      tokens_to_award = p_tokens_to_award,
      amount_requested_fiat = p_amount_fiat,
      currency_requested_fiat = p_currency,
      metadata_json = p_metadata,
      updated_at = now()
    WHERE id = v_payment_id;
  ELSE
    INSERT INTO public.payment_transactions (
      user_id,
      organization_id,
      target_wallet_id,
      payment_gateway_id,
      gateway_transaction_id,
      status,
      tokens_to_award,
      amount_requested_fiat,
      currency_requested_fiat,
      metadata_json
    )
    VALUES (
      p_user_id,
      NULL,
      p_target_wallet_id,
      'stripe',
      p_gateway_transaction_id,
      'PROCESSING_RENEWAL',
      p_tokens_to_award,
      p_amount_fiat,
      p_currency,
      p_metadata
    )
    RETURNING id INTO v_payment_id;
  END IF;

  IF p_tokens_to_award > 0 THEN
    IF p_token_idempotency_key IS NULL OR p_token_idempotency_key = '' THEN
      RAISE EXCEPTION 'p_token_idempotency_key is required when p_tokens_to_award > 0';
    END IF;

    SELECT twt.transaction_id
    INTO v_token_transaction_id
    FROM public.token_wallet_transactions twt
    WHERE twt.payment_transaction_id = v_payment_id
      AND twt.transaction_type = 'CREDIT_PURCHASE'
    ORDER BY twt.timestamp DESC
    LIMIT 1;

    IF v_token_transaction_id IS NULL THEN
      SELECT rtt.transaction_id
      INTO v_token_transaction_id
      FROM public.record_token_transaction(
        p_target_wallet_id,
        'CREDIT_PURCHASE',
        p_tokens_to_award::TEXT,
        p_user_id,
        p_token_idempotency_key,
        v_payment_id::TEXT,
        'payment_transactions',
        p_token_notes,
        v_payment_id
      ) AS rtt
      LIMIT 1;
    END IF;
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE id = v_payment_id;

  IF p_stripe_subscription_id IS NOT NULL THEN
    UPDATE public.user_subscriptions
    SET
      status = 'active',
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      updated_at = now()
    WHERE stripe_subscription_id = p_stripe_subscription_id;
  END IF;

  v_tier_level := public.refresh_user_tier(p_user_id, true);

  RETURN QUERY
  SELECT
    v_payment_id,
    v_tier_level,
    v_token_transaction_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.complete_invoice_payment(
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) IS 'Atomically processes invoice payment: insert processing renewal payment, optional token award, complete payment, optional subscription period update, and tier refresh.';

GRANT EXECUTE ON FUNCTION public.complete_invoice_payment(
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_invoice_payment(
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.complete_invoice_payment(
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM anon;

REVOKE ALL ON FUNCTION public.complete_invoice_payment(
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_subscription_with_tier(
  p_stripe_subscription_id TEXT,
  p_status TEXT,
  p_plan_id UUID DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT NULL,
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_set_ratchet BOOLEAN DEFAULT false
)
RETURNS TABLE (
  user_id UUID,
  tier_level INTEGER,
  rows_updated INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tier_level INTEGER;
  v_rows_updated INTEGER;
BEGIN
  IF p_stripe_subscription_id IS NULL OR p_stripe_subscription_id = '' THEN
    RAISE EXCEPTION 'p_stripe_subscription_id is required';
  END IF;

  IF p_status IS NULL OR p_status = '' THEN
    RAISE EXCEPTION 'p_status is required';
  END IF;

  UPDATE public.user_subscriptions
  SET
    status = p_status,
    plan_id = p_plan_id,
    current_period_start = p_period_start,
    current_period_end = p_period_end,
    cancel_at_period_end = p_cancel_at_period_end,
    stripe_customer_id = p_stripe_customer_id,
    updated_at = now()
  WHERE stripe_subscription_id = p_stripe_subscription_id
  RETURNING public.user_subscriptions.user_id INTO v_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 OR v_user_id IS NULL THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::INTEGER, COALESCE(v_rows_updated, 0);
    RETURN;
  END IF;

  v_tier_level := public.refresh_user_tier(v_user_id, p_set_ratchet);

  RETURN QUERY
  SELECT v_user_id, v_tier_level, v_rows_updated;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.update_subscription_with_tier(
  TEXT,
  TEXT,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  TEXT,
  BOOLEAN
) IS 'Atomically updates subscription lifecycle fields by stripe_subscription_id and refreshes tier with optional has_ever_paid ratchet.';

GRANT EXECUTE ON FUNCTION public.update_subscription_with_tier(
  TEXT,
  TEXT,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  TEXT,
  BOOLEAN
) TO service_role;

REVOKE ALL ON FUNCTION public.update_subscription_with_tier(
  TEXT,
  TEXT,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  TEXT,
  BOOLEAN
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_subscription_with_tier(
  TEXT,
  TEXT,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  TEXT,
  BOOLEAN
) FROM anon;

REVOKE ALL ON FUNCTION public.update_subscription_with_tier(
  TEXT,
  TEXT,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  BOOLEAN,
  TEXT,
  BOOLEAN
) FROM authenticated;
