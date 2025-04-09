-- Drop existing policies that only allow authenticated read
DROP POLICY IF EXISTS "Allow authenticated users to read active providers" ON public.ai_providers;
DROP POLICY IF EXISTS "Allow authenticated users to read active prompts" ON public.system_prompts;

-- Create new policies allowing public read access for active items

create policy "Allow public read access to active providers"
  on public.ai_providers for select
  to public  -- Grant to public role (includes anon and authenticated)
  using (is_active = true);

create policy "Allow public read access to active prompts"
  on public.system_prompts for select
  to public  -- Grant to public role (includes anon and authenticated)
  using (is_active = true);
