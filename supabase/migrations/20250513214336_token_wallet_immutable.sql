BEGIN;

-- Drop the existing broad service_role bypass policy for token_wallet_transactions
DROP POLICY IF EXISTS "Allow service_role to bypass RLS for wallet transactions" ON public.token_wallet_transactions;

-- Re-create a more restricted policy for service_role on token_wallet_transactions
-- This allows service_role to SELECT any transactions (e.g., for admin panels/auditing)
-- and INSERT (though actual inserts are typically done via the record_token_transaction function).
-- It explicitly disallows direct UPDATE and DELETE by service_role to ensure ledger immutability.
CREATE POLICY "Service role access for wallet transactions (Immutable)"
ON public.token_wallet_transactions
FOR SELECT -- Allow service_role to read all transactions
TO service_role
USING (true);

-- For INSERT, the record_token_transaction function is SECURITY DEFINER, so it handles inserts with elevated privileges.
-- A specific INSERT policy for service_role isn't strictly necessary if all inserts go via that function.
-- However, if service_role might need to insert directly for other reasons (e.g. bulk import scripts), it could be added:
-- CREATE POLICY "Service role insert access for wallet transactions"
-- ON public.token_wallet_transactions
-- FOR INSERT
-- TO service_role
-- WITH CHECK (true);

-- Explicitly disallow UPDATE for service_role to ensure immutability
CREATE POLICY "Disallow direct updates on wallet transactions by service_role (immutable ledger)"
ON public.token_wallet_transactions
FOR UPDATE
TO service_role
USING (false); -- effectively WITH CHECK (false) as well

-- Explicitly disallow DELETE for service_role to ensure immutability
CREATE POLICY "Disallow direct deletes on wallet transactions by service_role (immutable ledger)"
ON public.token_wallet_transactions
FOR DELETE
TO service_role
USING (false);

-- Existing policies for authenticated users (select own, select org admin, disallow direct DML) remain unchanged by this migration.

COMMIT;
