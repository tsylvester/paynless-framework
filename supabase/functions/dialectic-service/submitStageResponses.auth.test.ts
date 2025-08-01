import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from '../_shared/supabase.mock.ts';
import {
  type DialecticStage,
  type SubmitStageResponsesPayload,
  type DialecticProject,
  type DialecticProjectResource,
} from './dialectic.interface.ts';
import { createMockFileManagerService, MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { UploadContext, FileManagerResponse } from "../_shared/types/file_manager.types.ts";
import type { Database } from '../types_db.ts';
import type { ServiceError } from '../_shared/types.ts';

// Import the specific action handler we are testing
import { submitStageResponses } from './submitStageResponses.ts';
import { logger } from "../_shared/logger.ts";

const MOCK_AUTH_TEST_DOMAIN = {
  id: "auth-test-domain-id",
  name: "Auth Test Domain",
  description: "A domain for auth testing."
};

Deno.test('submitStageResponses', async (t) => {
  const testUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const testContributionId1 = crypto.randomUUID();
  const testContributionId2 = crypto.randomUUID();
  const testSystemPromptId = crypto.randomUUID();
  const testProcessTemplateId = crypto.randomUUID();
  const testThesisStageId = crypto.randomUUID();
  const testAntithesisStageId = crypto.randomUUID();
  const testParalysisStageId = crypto.randomUUID();
  const mockUser: User = { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() };

  const mockProcessTemplate = {
    id: testProcessTemplateId,
    name: 'Test Template',
    description: 'A test template',
    created_at: new Date().toISOString(),
    starting_stage_id: testThesisStageId,
  };

  const mockThesisStage: DialecticStage = {
      id: testThesisStageId,
      slug: 'thesis',
      display_name: 'Thesis',
      default_system_prompt_id: 'prompt-id-thesis',
      input_artifact_rules: {},
      created_at: new Date().toISOString(),
      description: null,
      expected_output_artifacts: {},
  };

  const mockAntithesisStage: DialecticStage = {
      id: testAntithesisStageId,
      slug: 'antithesis',
      display_name: 'Antithesis',
      default_system_prompt_id: testSystemPromptId, // This is the one we'll fetch
      input_artifact_rules: { sources: [{ type: 'contribution', stage_slug: 'thesis' }, { type: 'feedback', stage_slug: 'thesis'}] },
      created_at: new Date().toISOString(),
      description: null,
      expected_output_artifacts: {},
  };

  const mockParalysisStage: DialecticStage = {
    id: testParalysisStageId,
    slug: 'paralysis',
    display_name: 'Paralysis',
    default_system_prompt_id: testSystemPromptId,
    input_artifact_rules: {},
    created_at: new Date().toISOString(),
    description: null,
    expected_output_artifacts: {},
  };

  await t.step('2.1 Fails if the user is not authenticated', async () => {
    // 2.1.1 Arrange
    const mockPayload: SubmitStageResponsesPayload = { 
      sessionId: crypto.randomUUID(), 
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1, 
      responses: [{ originalContributionId: 'id', responseText: 'text'}] 
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});

    // 2.1.2 Act
    const { status, error, data } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as any,
      null, // No user
      { logger, downloadFromStorage: spy((_client, _bucket, _path) => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService(), indexingService: { indexDocument: () => Promise.resolve({ success: true }) }, embeddingClient: { createEmbedding: () => Promise.resolve([]) } },
    );
    
    // 2.1.3 Assert
    assertEquals(status, 401);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, 'User not authenticated');
  });

  await t.step('2.2 Fails if the user does not own the project', async () => {
    // 2.2.1 Arrange
    const otherUserId = crypto.randomUUID();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: 'text' }]
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId,
            iteration_count: 1, // Added for consistency
            project: { 
              id: testProjectId, 
              user_id: otherUserId, // Different user
              process_template_id: testProcessTemplateId, 
              initial_prompt_resource_id: "mock-initial-prompt-resource-id", 
              repo_url: "mock-repo-url",
              project_name: "Auth Test Project", // Added for consistency
              selected_domain_id: MOCK_AUTH_TEST_DOMAIN.id, // Added for robustness
              selected_domain_overlay_id: "mock-overlay-auth", // Added for robustness
              dialectic_domains: { // Added for robustness
                id: MOCK_AUTH_TEST_DOMAIN.id,
                name: MOCK_AUTH_TEST_DOMAIN.name,
                description: MOCK_AUTH_TEST_DOMAIN.description
              }
            },
            stage: mockThesisStage
        }] } },
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        },
        dialectic_contributions: {
          select: { data: [{ id: testContributionId1 }] }
        }
      }
    });

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService(), indexingService: { indexDocument: () => Promise.resolve({ success: true }) }, embeddingClient: { createEmbedding: () => Promise.resolve([]) } });
    
    assertEquals(status, 403);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error?.message ?? '', "Unauthorized to submit to this project."); // Corrected assertion message
  });

});