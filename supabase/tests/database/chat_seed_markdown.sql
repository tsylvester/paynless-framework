-- Seed Script for Chat History and Messages with System Prompts and Markdown Content

DO $$
DECLARE
    -- Common UUIDs from existing seed
    user_uuid uuid := 'ced47c4d-1111-4da3-a128-92a2383d599c';
    org_uuid uuid := 'e8b782fb-e7d9-4274-8fda-1b6b415348a0';
    prompt_a_uuid uuid := 'd6e2a447-328b-437f-a658-8f05260cc110'; -- System Prompt ID 1
    prompt_b_uuid uuid := 'fba02898-2701-4503-b598-30a6659242bb'; -- System Prompt ID 2
    provider_uuid uuid := 'c4f38815-ab11-4290-9bb0-f731bc60ac6f'; -- AI Provider ID

    -- Generate UUIDs for chats
    chat1_id uuid := gen_random_uuid();
    chat2_id uuid := gen_random_uuid();
    chat3_id uuid := gen_random_uuid();
    chat4_id uuid := gen_random_uuid();
    chat5_id uuid := gen_random_uuid();
    chat6_id uuid := gen_random_uuid();

    -- Markdown Content Snippets (SQL escaped)
    markdown_snippet_1 text := '# Meeting Notes: AI Dialectic Project

## Attendees
- AI Model Alpha
- AI Model Beta
- User Observer

## Key Discussion Points
1. **Refining Synthesis Stage**: Model Alpha suggested a new algorithm.
2. *Improving Critique Quality*: Model Beta proposed a structured feedback template.
3. ~~Old Idea~~: Sticking to a single iteration cycle was deemed insufficient.

## Action Items
- [x] Review Model Alpha''s algorithm proposal.
- [ ] Draft feedback template (Model Beta).
- [ ] Schedule follow-up for next week.

## Code Snippet Example
```python
def synthesize(thesis, antithesis):
    # TODO: Implement advanced synthesis logic
    return f"{thesis} + {antithesis} = Tentative Synthesis"
```

> "The goal is to achieve a robust, well-reasoned output." - Project Lead

For more details, see the [project wiki](https://example.com/wiki).
---
Thank you!';

    markdown_snippet_2 text := 'Here''s a summary of model performance:

| Model    | Task A Accuracy | Task B Latency |
|----------|-----------------|----------------|
| OptiPrime| 92.5%           | 120ms          |
| Cortexia | 89.1%           | 95ms           |
| Synapse  | **94.2%**       | *150ms*        |

Key takeaways:
* Synapse excels in accuracy for Task A.
* Cortexia has the best latency for Task B.
* OptiPrime offers a balanced performance.

Check out this `inline_code_example()`.';

    markdown_snippet_3 text := '## Quick Update
The `main_pipeline.py` script has been updated.
> Please pull the latest changes.

Remember to run `pip install -r requirements.txt`.
Also, a horizontal rule:
---';

    markdown_snippet_4 text := '### Task Breakdown:
- [x] Initial setup complete.
- [ ] Stage 1 modeling (in progress).
    - [ ] Sub-task A
    - [x] Sub-task B (verified)
- [ ] Stage 2 analysis.

This is **bold** and this is _italic_.
Here''s a link: [Paynless](https://paynless.io)';

BEGIN

    -- Clear existing data
    DELETE FROM chat_messages;
    DELETE FROM chats;

    -- Seed Chat History: 6 chats with varying system_prompt_ids
    INSERT INTO chats (id, title, user_id, organization_id, system_prompt_id, created_at, updated_at) VALUES
        (chat1_id, 'Org Chat (Prompt A) - Markdown', user_uuid, org_uuid, prompt_a_uuid, (NOW() - INTERVAL '5 days'), (NOW() - INTERVAL '5 days')),
        (chat2_id, 'Org Chat (Prompt B) - Tables & Lists', user_uuid, org_uuid, prompt_b_uuid, (NOW() - INTERVAL '4 days'), (NOW() - INTERVAL '4 days')),
        (chat3_id, 'Personal Chat (Prompt A) - Updates', user_uuid, NULL, prompt_a_uuid, (NOW() - INTERVAL '3 days'), (NOW() - INTERVAL '3 days')),
        (chat4_id, 'Org Chat (No Prompt) - Task Lists', user_uuid, org_uuid, NULL, (NOW() - INTERVAL '2 days'), (NOW() - INTERVAL '2 days')),
        (chat5_id, 'Personal Chat (Prompt B) - Comprehensive', user_uuid, NULL, prompt_b_uuid, (NOW() - INTERVAL '1 day'), (NOW() - INTERVAL '1 day')),
        (chat6_id, 'Personal Chat (No Prompt) - Mixed Simple', user_uuid, NULL, NULL, (NOW() - INTERVAL '6 hours'), (NOW() - INTERVAL '6 hours'));

    -- Seed Chat Messages for EACH of the 6 chats

    -- Messages for Chat 1 (Org, Prompt A, Markdown Snippet 1)
    INSERT INTO chat_messages (chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (chat1_id, user_uuid, 'user', 'Can you give me the meeting notes for the AI Dialectic project?', (NOW() - INTERVAL '5 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (chat1_id, NULL, 'assistant', markdown_snippet_1, (NOW() - INTERVAL '5 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"promptTokens": 15, "completionTokens": 250, "totalTokens": 265}'::jsonb, TRUE);

    -- Messages for Chat 2 (Org, Prompt B, Markdown Snippet 2)
    INSERT INTO chat_messages (chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (chat2_id, user_uuid, 'user', 'Provide a performance summary of the models.', (NOW() - INTERVAL '4 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (chat2_id, NULL, 'assistant', markdown_snippet_2, (NOW() - INTERVAL '4 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"promptTokens": 12, "completionTokens": 180, "totalTokens": 192}'::jsonb, TRUE);

    -- Messages for Chat 3 (Personal, Prompt A, Markdown Snippet 3)
    INSERT INTO chat_messages (chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (chat3_id, user_uuid, 'user', 'Any quick updates on the pipeline?', (NOW() - INTERVAL '3 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (chat3_id, NULL, 'assistant', markdown_snippet_3, (NOW() - INTERVAL '3 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"promptTokens": 8, "completionTokens": 90, "totalTokens": 98}'::jsonb, TRUE);

    -- Messages for Chat 4 (Org, No Prompt, Markdown Snippet 4)
    INSERT INTO chat_messages (chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (chat4_id, user_uuid, 'user', 'What''s the current task breakdown?', (NOW() - INTERVAL '2 days' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (chat4_id, NULL, 'assistant', markdown_snippet_4, (NOW() - INTERVAL '2 days' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"promptTokens": 10, "completionTokens": 150, "totalTokens": 160}'::jsonb, TRUE),
    (chat4_id, user_uuid, 'user', 'Thanks! Looks good.', (NOW() - INTERVAL '2 days' + INTERVAL '3 minutes'), NULL, NULL, NULL, TRUE);

    -- Messages for Chat 5 (Personal, Prompt B, Markdown Snippet 1 - reused for variety)
    INSERT INTO chat_messages (chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (chat5_id, user_uuid, 'user', 'Could I get a comprehensive update again, similar to the meeting notes format?', (NOW() - INTERVAL '1 day' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (chat5_id, NULL, 'assistant', markdown_snippet_1, (NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"promptTokens": 20, "completionTokens": 255, "totalTokens": 275}'::jsonb, TRUE);

    -- Messages for Chat 6 (Personal, No Prompt, Simple Markdown)
    INSERT INTO chat_messages (chat_id, user_id, role, content, created_at, ai_provider_id, system_prompt_id, token_usage, is_active_in_thread) VALUES
    (chat6_id, user_uuid, 'user', 'Tell me about **bold** and *italic* text.', (NOW() - INTERVAL '6 hours' + INTERVAL '1 minute'), NULL, NULL, NULL, TRUE),
    (chat6_id, NULL, 'assistant', 'Certainly! **Bold text** is used for emphasis, and *italic text* (or _italic text_) is often used for highlighting or foreign words. You can also have `inline code`.', (NOW() - INTERVAL '6 hours' + INTERVAL '2 minutes'), provider_uuid, NULL, '{"promptTokens": 9, "completionTokens": 60, "totalTokens": 69}'::jsonb, TRUE);

END $$;