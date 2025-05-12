-- Add the updated_at column, allowing NULL initially for backfilling
ALTER TABLE public.chat_messages
ADD COLUMN updated_at TIMESTAMPTZ;

-- Backfill existing rows: set updated_at to created_at
UPDATE public.chat_messages
SET updated_at = created_at
WHERE updated_at IS NULL; -- Only update rows where it's not already set (idempotency)

-- Now that rows are backfilled, add the NOT NULL constraint and a default
ALTER TABLE public.chat_messages
ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.chat_messages
ALTER COLUMN updated_at SET DEFAULT now();

-- Create a function to automatically update updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger to call the function before any update on chat_messages
-- Drop trigger first if it exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_update_chat_messages_updated_at ON public.chat_messages;

CREATE TRIGGER trigger_update_chat_messages_updated_at
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Optional: Add an index on updated_at if frequent queries/sorting are expected
-- CREATE INDEX IF NOT EXISTS idx_chat_messages_updated_at ON public.chat_messages(updated_at);
-- Decided against adding this index now to keep focus, can be added later if needed.
