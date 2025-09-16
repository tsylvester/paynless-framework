import { assertEquals, assertExists } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { Database } from '../types_db.ts';
import { submitStageResponses } from './submitStageResponses.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';
import { logger } from "../_shared/logger.ts";
import type { SubmitStageResponsesPayload, DialecticStage } from './dialectic.interface.ts';

Deno.test("submitStageResponses - fails when overlays are missing for next stage", async () => {
  const testUser: User = { id: 'user-submit-red', app_metadata: {}, user_metadata: {}, aud: 'test', created_at: new Date().toISOString() };
  const projectId = 'project-submit-red';
  const sessionId = 'session-submit-red';
  const processTemplateId = 'proc-template-submit-red';
  const currentStage: DialecticStage = {
    id: 'stage-current',
    slug: 'thesis',
    display_name: 'Thesis',
    default_system_prompt_id: 'prompt-current',
    input_artifact_rules: {},
    created_at: new Date().toISOString(),
    description: null,
    expected_output_artifacts: {},
  };
  const nextStage: DialecticStage = {
    id: 'stage-next',
    slug: 'antithesis',
    display_name: 'Antithesis',
    default_system_prompt_id: 'prompt-next',
    input_artifact_rules: {},
    created_at: new Date().toISOString(),
    description: null,
    expected_output_artifacts: {},
  };

  const payload: SubmitStageResponsesPayload = {
    sessionId,
    projectId,
    stageSlug: currentStage.slug,
    currentIterationNumber: 1,
    responses: [],
  };

  const mockDb: MockSupabaseDataConfig = {
    genericMockResults: {
      dialectic_sessions: {
        select: { data: [{ id: sessionId, iteration_count: 1, project: { id: projectId, user_id: testUser.id, process_template_id: processTemplateId, initial_user_prompt: 'prompt', selected_domain_id: 'd-1', dialectic_domains: { id: 'd-1', name: 'General', description: null } }, stage: currentStage }] }
      },
      dialectic_stage_transitions: {
        select: { data: [{ source_stage_id: currentStage.id, target_stage: { ...nextStage, system_prompts: [{ id: nextStage.default_system_prompt_id!, prompt_text: 'Next stage prompt' }] } }] }
      },
      system_prompts: { select: { data: [{ id: nextStage.default_system_prompt_id!, prompt_text: 'Next stage prompt' }] } },
      // Critical: overlays query returns empty to trigger fail-fast path
      domain_specific_prompt_overlays: { select: { data: [] } },
      dialectic_process_templates: { select: { data: [{ id: processTemplateId, name: 'Proc', starting_stage_id: currentStage.id }] } },
      'ai_providers': { select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock' }], error: null } },
    },
  };

  const mockSupabase = createMockSupabaseClient(testUser.id, mockDb);
  const { error, status } = await submitStageResponses(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    testUser,
    { logger, downloadFromStorage: async () => ({ data: null, error: null }), fileManager: { uploadAndRegisterFile: async () => ({ record: null, error: null }) } as any, indexingService: { indexDocument: async () => ({ success: true, tokensUsed: 0 }) }, embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) } }
  );

  assertExists(error);
  assertEquals(error?.code, 'STAGE_CONFIG_MISSING_OVERLAYS');
  assertEquals(status, 500);
});


