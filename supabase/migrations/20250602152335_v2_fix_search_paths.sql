BEGIN;

-- Function: public.link_pending_invites_on_signup
-- Original file: supabase/migrations/20250520142853_fix_link_invites_on_signup_definition.sql
CREATE OR REPLACE FUNCTION public.link_pending_invites_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  invite_record RECORD;
BEGIN
  IF NEW.email IS NOT NULL THEN
    FOR invite_record IN
      SELECT id, organization_id, role_to_assign
      FROM public.invites
      WHERE invited_email = NEW.email
        AND invited_user_id IS NULL
        AND status = 'pending'
    LOOP
      UPDATE public.invites
      SET
        invited_user_id = NEW.id,
        status = 'accepted'
      WHERE id = invite_record.id;

      INSERT INTO public.organization_members (user_id, organization_id, role, status)
      VALUES (NEW.id, invite_record.organization_id, invite_record.role_to_assign, 'active')
      ON CONFLICT (user_id, organization_id) DO UPDATE 
      SET role = EXCLUDED.role, status = 'active';

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Function: public.grant_initial_free_tokens_to_user
-- Original file: supabase/migrations/20250520160954_fix_backfill_conditions.sql
CREATE OR REPLACE FUNCTION public.grant_initial_free_tokens_to_user(
    p_user_id uuid,
    p_free_plan_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    v_tokens_to_award NUMERIC;
    v_target_wallet_id uuid;
    v_system_user_id uuid;
BEGIN
    BEGIN
        SELECT system_user_id INTO v_system_user_id FROM _vars LIMIT 1;
        IF v_system_user_id IS NULL THEN
            RAISE EXCEPTION '[grant_initial_free_tokens_to_user] System user ID is not set in _vars. This table should be populated by the calling migration.';
        END IF;
    EXCEPTION
        WHEN undefined_table THEN 
            RAISE EXCEPTION '[grant_initial_free_tokens_to_user] _vars temp table not found. It must be created and populated with system_user_id by the calling migration.';
    END;

    SELECT tokens_to_award INTO v_tokens_to_award
    FROM public.subscription_plans
    WHERE id = p_free_plan_id AND name = 'Free';

    IF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Free plan ID % (user %) not found or has no tokens to award.', p_free_plan_id, p_user_id;
        RETURN;
    END IF;

    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = p_user_id AND organization_id IS NULL;

    IF v_target_wallet_id IS NULL THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Token wallet not found for user ID %.', p_user_id;
        RETURN;
    END IF;

    PERFORM public.record_token_transaction(
        p_wallet_id := v_target_wallet_id,
        p_transaction_type := 'CREDIT_INITIAL_FREE_ALLOCATION',
        p_input_amount_text := v_tokens_to_award::TEXT,
        p_recorded_by_user_id := v_system_user_id,
        p_idempotency_key := 'initial_free_' || p_user_id::text || '_' || p_free_plan_id::text,
        p_related_entity_id := p_free_plan_id::VARCHAR,
        p_related_entity_type := 'subscription_plans',
        p_notes := 'Initial token allocation for new free plan user.',
        p_payment_transaction_id := NULL
    );

    RAISE LOG '[grant_initial_free_tokens_to_user] Successfully called record_token_transaction for user % (tokens: %).', p_user_id, v_tokens_to_award;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Error awarding tokens to user %: %', p_user_id, SQLERRM;
END;
$$;

-- Function: public.perform_chat_rewind
-- Original file: supabase/migrations/20250525165910_improve_rewind_target_v2.sql
CREATE OR REPLACE FUNCTION public.perform_chat_rewind(
    p_chat_id UUID,
    p_rewind_from_message_id UUID,
    p_user_id UUID,
    p_new_user_message_content TEXT,
    p_new_user_message_ai_provider_id UUID,
    p_new_assistant_message_content TEXT,
    p_new_assistant_message_ai_provider_id UUID,
    p_new_user_message_system_prompt_id UUID DEFAULT NULL,
    p_new_assistant_message_token_usage JSONB DEFAULT NULL,
    p_new_assistant_message_system_prompt_id UUID DEFAULT NULL,
    p_new_assistant_message_error_type TEXT DEFAULT NULL 
)
RETURNS TABLE (
    new_user_message_id UUID,
    new_assistant_message_id UUID
)
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_rewind_point TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT created_at INTO v_rewind_point
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id;

    IF v_rewind_point IS NULL THEN
        RAISE EXCEPTION 'Rewind message with ID % not found.', p_rewind_from_message_id;
    END IF;

    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = p_rewind_from_message_id;

    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = (
        SELECT cm_user.id
        FROM public.chat_messages cm_user
        JOIN public.chat_messages cm_assistant ON cm_user.chat_id = cm_assistant.chat_id
        WHERE cm_assistant.id = p_rewind_from_message_id
          AND cm_user.role = 'user'
          AND cm_user.user_id = p_user_id
          AND cm_user.created_at < cm_assistant.created_at
          AND cm_user.is_active_in_thread = TRUE 
        ORDER BY cm_user.created_at DESC
        LIMIT 1
    );

    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id,
        is_active_in_thread,
        created_at,
        updated_at
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        'user', 
        p_new_user_message_content, 
        p_new_user_message_ai_provider_id, 
        p_new_user_message_system_prompt_id,
        TRUE, 
        v_rewind_point + INTERVAL '1 millisecond', 
        v_rewind_point + INTERVAL '1 millisecond'
    )
    RETURNING id INTO v_new_user_message_id;

    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id, 
        token_usage, 
        error_type,
        is_active_in_thread,
        created_at,
        updated_at,
        response_to_message_id
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        'assistant', 
        p_new_assistant_message_content, 
        p_new_assistant_message_ai_provider_id, 
        p_new_assistant_message_system_prompt_id, 
        p_new_assistant_message_token_usage, 
        p_new_assistant_message_error_type,
        TRUE, 
        v_rewind_point + INTERVAL '2 milliseconds',
        v_rewind_point + INTERVAL '2 milliseconds',
        v_new_user_message_id
    )
    RETURNING id INTO v_new_assistant_message_id;

    RETURN QUERY SELECT v_new_user_message_id, v_new_assistant_message_id;
END;
$$;

-- Function: public.record_token_transaction
-- Original file: supabase/migrations/20250527011550_force_idempotency_key.sql
CREATE OR REPLACE FUNCTION public.record_token_transaction(
    p_wallet_id UUID,
    p_transaction_type VARCHAR,
    p_input_amount_text TEXT,
    p_recorded_by_user_id UUID,
    p_idempotency_key TEXT,
    p_related_entity_id VARCHAR DEFAULT NULL,
    p_related_entity_type VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_payment_transaction_id UUID DEFAULT NULL
)
RETURNS TABLE (
    transaction_id UUID,
    wallet_id UUID,
    transaction_type VARCHAR,
    amount NUMERIC,
    balance_after_txn NUMERIC,
    recorded_by_user_id UUID,
    idempotency_key TEXT,
    related_entity_id VARCHAR,
    related_entity_type VARCHAR,
    notes TEXT,
    "timestamp" TIMESTAMPTZ,
    payment_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_transaction_amount NUMERIC;
    v_new_balance NUMERIC;
    v_is_credit BOOLEAN;
    v_existing_transaction public.token_wallet_transactions%ROWTYPE;
BEGIN
    IF p_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Wallet ID cannot be null';
    END IF;
    IF p_transaction_type IS NULL OR p_transaction_type = '' THEN
        RAISE EXCEPTION 'Transaction type cannot be empty';
    END IF;
    IF p_input_amount_text IS NULL OR p_input_amount_text = '' THEN
        RAISE EXCEPTION 'Transaction amount cannot be empty';
    END IF;
    IF p_recorded_by_user_id IS NULL THEN
        RAISE EXCEPTION 'Recorded by User ID cannot be null';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'Idempotency key cannot be empty';
    END IF;

    BEGIN
        v_transaction_amount := p_input_amount_text::NUMERIC;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid numeric value for transaction amount: %', p_input_amount_text;
        WHEN others THEN
            RAISE EXCEPTION 'Error parsing transaction amount: %', SQLERRM;
    END;

    IF v_transaction_amount <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be positive. Input was: %', p_input_amount_text;
    END IF;

    SELECT * INTO v_existing_transaction
    FROM public.token_wallet_transactions twt
    WHERE twt.wallet_id = p_wallet_id AND twt.idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing_transaction.transaction_type = p_transaction_type AND
           v_existing_transaction.amount = v_transaction_amount AND
           v_existing_transaction.recorded_by_user_id = p_recorded_by_user_id AND
           (v_existing_transaction.related_entity_id IS NOT DISTINCT FROM p_related_entity_id) AND
           (v_existing_transaction.related_entity_type IS NOT DISTINCT FROM p_related_entity_type) AND
           (v_existing_transaction.payment_transaction_id IS NOT DISTINCT FROM p_payment_transaction_id)
        THEN
            RETURN QUERY SELECT
                twt.transaction_id, twt.wallet_id, twt.transaction_type::VARCHAR, twt.amount,
                twt.balance_after_txn, twt.recorded_by_user_id, twt.idempotency_key,
                twt.related_entity_id::VARCHAR, twt.related_entity_type::VARCHAR, twt.notes,
                twt.timestamp, twt.payment_transaction_id
            FROM public.token_wallet_transactions twt
            WHERE twt.transaction_id = v_existing_transaction.transaction_id;
            RETURN;
        ELSE
            RAISE EXCEPTION 'Idempotency key % collision for wallet %. Recorded params: type=%, amt=%, user=%. New params: type=%, amt=%, user=%',
                            p_idempotency_key, p_wallet_id,
                            v_existing_transaction.transaction_type, v_existing_transaction.amount, v_existing_transaction.recorded_by_user_id,
                            p_transaction_type, v_transaction_amount, p_recorded_by_user_id;
        END IF;
    END IF;

    IF upper(p_transaction_type) LIKE 'CREDIT%' THEN
        v_is_credit := TRUE;
    ELSIF upper(p_transaction_type) LIKE 'DEBIT%' THEN
        v_is_credit := FALSE;
    ELSIF upper(p_transaction_type) LIKE 'ADJUSTMENT_STAFF_GRANT%' THEN
        v_is_credit := TRUE;
    ELSIF upper(p_transaction_type) LIKE 'ADJUSTMENT_STAFF_REVOKE%' THEN
        v_is_credit := FALSE;
    ELSE
        RAISE EXCEPTION 'Unknown transaction type prefix for credit/debit determination: %', p_transaction_type;
    END IF;

    SELECT balance INTO v_current_balance FROM public.token_wallets
    WHERE public.token_wallets.wallet_id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    IF v_is_credit THEN
        v_new_balance := v_current_balance + v_transaction_amount;
    ELSE
        v_new_balance := v_current_balance - v_transaction_amount;
        IF v_new_balance < 0 THEN
            RAISE EXCEPTION 'Insufficient funds in wallet % for debit of %. Current balance: %',
                            p_wallet_id, v_transaction_amount, v_current_balance;
        END IF;
    END IF;

    UPDATE public.token_wallets
    SET balance = v_new_balance, updated_at = now()
    WHERE public.token_wallets.wallet_id = p_wallet_id;

    INSERT INTO public.token_wallet_transactions (
        wallet_id, idempotency_key, transaction_type, amount, balance_after_txn,
        recorded_by_user_id, related_entity_id, related_entity_type, notes, payment_transaction_id, timestamp
    )
    VALUES (
        p_wallet_id, p_idempotency_key, p_transaction_type, v_transaction_amount, v_new_balance,
        p_recorded_by_user_id, p_related_entity_id, p_related_entity_type, p_notes, p_payment_transaction_id, now()
    )
    RETURNING
        public.token_wallet_transactions.transaction_id,
        public.token_wallet_transactions.wallet_id,
        public.token_wallet_transactions.transaction_type,
        public.token_wallet_transactions.amount,
        public.token_wallet_transactions.balance_after_txn,
        public.token_wallet_transactions.recorded_by_user_id,
        public.token_wallet_transactions.idempotency_key,
        public.token_wallet_transactions.related_entity_id,
        public.token_wallet_transactions.related_entity_type,
        public.token_wallet_transactions.notes,
        public.token_wallet_transactions.timestamp,
        public.token_wallet_transactions.payment_transaction_id
    INTO
        transaction_id, wallet_id, transaction_type, amount, balance_after_txn,
        recorded_by_user_id, idempotency_key, related_entity_id, related_entity_type,
        notes, "timestamp", payment_transaction_id;

    RETURN NEXT;
END;
$$;

-- Function: public.execute_sql
-- Original file: supabase/migrations/20250528151438_v4_create_execute_sql_function.sql
CREATE OR REPLACE FUNCTION public.execute_sql(query TEXT)
RETURNS SETOF JSON
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    constructed_query TEXT;
BEGIN
    constructed_query := 'SELECT row_to_json(t) FROM (' || query || ') t';
    
    RETURN QUERY EXECUTE constructed_query;
END;
$$;

-- Function: public.begin_transaction
-- Original file: supabase/migrations/20250529172526_add_generic_transaction_rpc.sql
CREATE OR REPLACE FUNCTION public.begin_transaction()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
    RETURN 'Transaction block conceptually started. Client must manage actual transaction lifecycle.';
END;
$$;

-- Function: public.rollback_transaction
-- Original file: supabase/migrations/20250529172526_add_generic_transaction_rpc.sql
CREATE OR REPLACE FUNCTION public.rollback_transaction()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
    RETURN 'Transaction block conceptually rolled back. Client must manage actual transaction lifecycle.';
END;
$$;

-- Function: public.update_updated_at_column
-- Original file: supabase/migrations/20250531183251_fix_dialectic_project_resources.sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE 'plpgsql'
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMIT;
