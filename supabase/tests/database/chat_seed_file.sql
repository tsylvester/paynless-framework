-- Seed Script for Chat History and Messages with System Prompts

DO $$
DECLARE
    -- Common UUIDs
    user_uuid uuid := 'ced47c4d-1111-4da3-a128-92a2383d599c';
    org_uuid uuid := 'e8b782fb-e7d9-4274-8fda-1b6b415348a0';
    prompt_a_uuid uuid := 'd6e2a447-328b-437f-a658-8f05260cc110'; -- Provided System Prompt ID 1
    prompt_b_uuid uuid := 'fba02898-2701-4503-b598-30a6659242bb'; -- Provided System Prompt ID 2
    provider_uuid uuid := 'c4f38815-ab11-4290-9bb0-f731bc60ac6f'; -- Example AI Provider ID

    -- Generate UUIDs for chats to ensure they can be referenced for messages
    chat1_id uuid := gen_random_uuid();
    chat2_id uuid := gen_random_uuid();
    chat3_id uuid := gen_random_uuid();
    chat4_id uuid := gen_random_uuid();
    chat5_id uuid := gen_random_uuid();
    chat6_id uuid := gen_random_uuid(); -- If not already declared
BEGIN

    -- Seed Chat History: 5 chats with varying system_prompt_ids
    INSERT INTO chats (id, title, user_id, organization_id, system_prompt_id, created_at, updated_at) VALUES
        (chat1_id, 'Chat 1 Org History (Prompt A)', user_uuid, org_uuid, prompt_a_uuid, (NOW() - INTERVAL '5 days'), (NOW() - INTERVAL '5 days')),
        (chat2_id, 'Chat 2 Org History (Prompt B)', user_uuid, org_uuid, prompt_b_uuid, (NOW() - INTERVAL '4 days'), (NOW() - INTERVAL '4 days')),
        (chat3_id, 'Chat 3 Personal History (Prompt A)', user_uuid, NULL, prompt_a_uuid, (NOW() - INTERVAL '3 days'), (NOW() - INTERVAL '3 days')),
        (chat4_id, 'Chat 4 Org Detailed (Prompt B)', user_uuid, org_uuid, prompt_b_uuid, (NOW() - INTERVAL '2 days'), (NOW() - INTERVAL '2 days')),
        (chat5_id, 'Chat 5 Personal Detailed (Prompt A)', user_uuid, NULL, prompt_a_uuid, (NOW() - INTERVAL '1 day'), (NOW() - INTERVAL '1 day'));
        (chat6_id, 'Chat 6 Personal History (Prompt B)', user_uuid, NULL, prompt_b_uuid, (NOW() - INTERVAL '6 hours'), (NOW() - INTERVAL '6 hours'));

    -- Seed Chat Messages for EACH of the 5 chats

    -- Messages for Chat 1 (Org, Prompt A)
    INSERT INTO chat_messages (id, chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (gen_random_uuid(), chat1_id, user_uuid, 'user', 'User message for Org Chat 1 with Prompt A.', (NOW() - INTERVAL '5 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat1_id, NULL, 'assistant', 'Assistant response for Org Chat 1 with Prompt A.', (NOW() - INTERVAL '5 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}'::jsonb, TRUE);

    -- Messages for Chat 2 (Org, Prompt B)
    INSERT INTO chat_messages (id, chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (gen_random_uuid(), chat2_id, user_uuid, 'user', 'User query for Org Chat 2 using Prompt B.', (NOW() - INTERVAL '4 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat2_id, NULL, 'assistant', 'AI answer for Org Chat 2 using Prompt B.', (NOW() - INTERVAL '4 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"prompt_tokens": 12, "completion_tokens": 22, "total_tokens": 34}'::jsonb, TRUE);

    -- Messages for Chat 3 (Personal, Prompt A)
    INSERT INTO chat_messages (id, chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (gen_random_uuid(), chat3_id, user_uuid, 'user', 'Personal inquiry in Chat 3 with Prompt A.', (NOW() - INTERVAL '3 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat3_id, NULL, 'assistant', 'Helpful reply for Personal Chat 3 with Prompt A.', (NOW() - INTERVAL '3 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"prompt_tokens": 8, "completion_tokens": 18, "total_tokens": 26}'::jsonb, TRUE);

    -- Messages for Chat 4 (Org Detailed, Prompt B)
    INSERT INTO chat_messages (id, chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (gen_random_uuid(), chat4_id, user_uuid, 'user', 'Initial user message for detailed org chat 4 (Prompt B).', (NOW() - INTERVAL '2 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat4_id, NULL, 'assistant', 'Initial AI response for detailed org chat 4 (Prompt B).', (NOW() - INTERVAL '2 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}'::jsonb, TRUE),
    (gen_random_uuid(), chat4_id, user_uuid, 'user', 'Follow-up question for detailed org chat 4 (Prompt B).', (NOW() - INTERVAL '2 days' + INTERVAL '3 minutes'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat4_id, NULL, 'assistant', 'Another detailed answer for org chat 4 (Prompt B).', (NOW() - INTERVAL '2 days' + INTERVAL '4 minutes'), provider_uuid, NULL, '{"prompt_tokens": 15, "completion_tokens": 25, "total_tokens": 40}'::jsonb, TRUE);

    -- Messages for Chat 5 (Personal Detailed, Prompt A)
    INSERT INTO chat_messages (id, chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (gen_random_uuid(), chat5_id, user_uuid, 'user', 'First message in detailed personal chat 5 (Prompt A).', (NOW() - INTERVAL '1 day' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat5_id, NULL, 'assistant', 'First response in detailed personal chat 5 (Prompt A).', (NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"prompt_tokens": 5, "completion_tokens": 15, "total_tokens": 20}'::jsonb, TRUE),
    (gen_random_uuid(), chat5_id, user_uuid, 'user', 'Second message in detailed personal chat 5 (Prompt A).', (NOW() - INTERVAL '1 day' + INTERVAL '3 minutes'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat5_id, NULL, 'assistant', 'Second response in detailed personal chat 5 (Prompt A).', (NOW() - INTERVAL '1 day' + INTERVAL '4 minutes'), provider_uuid, NULL, '{"prompt_tokens": 7, "completion_tokens": 17, "total_tokens": 24}'::jsonb, TRUE);

    -- Messages for Chat 6 (Personal, Prompt B)
    INSERT INTO chat_messages (id, chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (gen_random_uuid(), chat6_id, user_uuid, 'user', 'User question in Personal Chat 6, expecting Prompt B logic.', (NOW() - INTERVAL '6 hours' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (gen_random_uuid(), chat6_id, NULL, 'assistant', 'Assistant answer reflecting Prompt B for Personal Chat 6.', (NOW() - INTERVAL '6 hours' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"prompt_tokens": 9, "completion_tokens": 19, "total_tokens": 28}'::jsonb, TRUE);

END $$;
