    -- Add the payment_transaction_id foreign key column to token_wallet_transactions
    ALTER TABLE public.token_wallet_transactions
    ADD COLUMN IF NOT EXISTS payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL;

    COMMENT ON COLUMN public.token_wallet_transactions.payment_transaction_id IS 'Link to the payment_transactions table if this ledger entry was created as a direct result of a payment.';

    -- Enable RLS and define basic policies for token_wallets
    ALTER TABLE public.token_wallets ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Allow authenticated user to select their own wallets"
    ON public.token_wallets FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
    -- TODO: Add policy for organization members to select org wallets.

    CREATE POLICY "Allow service_role to bypass RLS for wallets"
    ON public.token_wallets FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "Disallow direct inserts on wallets by users"
    ON public.token_wallets FOR INSERT
    TO authenticated
    WITH CHECK (false);

    CREATE POLICY "Disallow direct updates on wallets by users"
    ON public.token_wallets FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

    CREATE POLICY "Disallow direct deletes on wallets by users"
    ON public.token_wallets FOR DELETE
    TO authenticated
    USING (false);


    -- Enable RLS and define basic policies for token_wallet_transactions
    ALTER TABLE public.token_wallet_transactions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Allow authenticated users to select their own wallet transactions"
    ON public.token_wallet_transactions FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.token_wallets tw
        WHERE tw.wallet_id = token_wallet_transactions.wallet_id AND tw.user_id = auth.uid()
      )
    );
    -- TODO: Add policy for organization members to select transactions of org wallets.

    CREATE POLICY "Allow service_role to bypass RLS for wallet transactions"
    ON public.token_wallet_transactions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "Disallow direct inserts on wallet transactions by users"
    ON public.token_wallet_transactions FOR INSERT
    TO authenticated
    WITH CHECK (false);

    CREATE POLICY "Disallow direct updates on wallet transactions (immutable ledger)"
    ON public.token_wallet_transactions FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

    CREATE POLICY "Disallow direct deletes on wallet transactions (immutable ledger)"
    ON public.token_wallet_transactions FOR DELETE
    TO authenticated
    USING (false);


    -- Enable RLS and define basic policies for payment_transactions
    ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Allow authenticated users to select their own payment transactions"
    ON public.payment_transactions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
    -- TODO: Add policy for organization members/admins to select org payment transactions.

    CREATE POLICY "Allow service_role to bypass RLS for payment transactions"
    ON public.payment_transactions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "Disallow direct inserts on payment transactions by users"
    ON public.payment_transactions FOR INSERT
    TO authenticated
    WITH CHECK (false);

    CREATE POLICY "Disallow direct updates on payment transactions by users"
    ON public.payment_transactions FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

    CREATE POLICY "Disallow direct deletes on payment transactions by users"
    ON public.payment_transactions FOR DELETE
    TO authenticated
    USING (false);