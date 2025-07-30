import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy, type Spy, stub } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  type MockPGRSTError,
  type MockQueryBuilderState,
} from '../_shared/supabase.mock.ts';
import {
  type DialecticStage,
  type SubmitStageResponsesPayload,
  type SubmitStageResponsesResponse,
  type SubmitStageResponsesDependencies,
  type DialecticProject,
  type DialecticProjectResource,
} from './dialectic.interface.ts';
import { createMockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { UploadContext, FileManagerResponse, PathContext } from "../_shared/types/file_manager.types.ts";
import type { Database } from '../types_db.ts';
import type { ServiceError } from '../_shared/types.ts';

// Import the specific action handler we are testing
import { submitStageResponses } from './submitStageResponses.ts';
import { logger } from "../_shared/logger.ts";
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';
import { Logger } from "https://deno.land/std@0.218.2/log/mod.ts";

const MOCK_DB_TEST_DOMAIN = {
  id: "db-test-domain-id",
  name: "Database Test Domain",
  description: "A domain for database interaction testing."
};

const MOCK_INITIAL_PROMPT_RESOURCE_ID = "mock-initial-prompt-resource-id";
const MOCK_INITIAL_PROMPT_BUCKET = "mock-project-resources-bucket";
const MOCK_INITIAL_PROMPT_PATH = "prompts/initial_project_prompt.md";
const MOCK_INITIAL_PROMPT_CONTENT = "This is the mock initial project prompt content for database tests.";
const STORAGE_BUCKET_CONTENT_STR = Deno.env.get('SB_CONTENT_STORAGE_BUCKET') || 'dialectic-content-bucket';

const MOCK_USER_ID = '783a085e-b7a6-4cef-b937-e5f867b1a037';
const MOCK_USER: User = { id: MOCK_USER_ID, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() };
const MOCK_PROJECT_ID = '767ef5cd-16b1-438b-9ac3-8fe8d263c5cb';
const MOCK_PROCESS_TEMPLATE_ID = 'bb1115db-0918-4bbd-a400-b200f280c3e8';
const MOCK_CONTRIBUTIONS_BUCKET = 'dialectic-contributions';

  const mockThesisStage: DialecticStage = {
    id: '97fa6f30-3674-4f32-bdb4-dff963423bbf',
      slug: 'thesis',
      display_name: 'Thesis',
      default_system_prompt_id: 'prompt-id-thesis',
      input_artifact_rules: {},
      created_at: new Date().toISOString(),
      description: null,
      expected_output_artifacts: {},
  };

// Helper function to create consistent test session data
function createTestSessionData(sessionId: string, projectId: string, projectName: string, repoUrl = 'mock-repo-url', overlayId = 'mock-overlay-id') {
  return {
    id: sessionId,
    iteration_count: 1,
    project: {
      id: projectId,
      user_id: MOCK_USER_ID,
      process_template_id: MOCK_PROCESS_TEMPLATE_ID,
      process_template: { id: MOCK_PROCESS_TEMPLATE_ID, max_iterations: 3 },
      initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID,
      initial_prompt_context: { type: 'resource_id', value: MOCK_INITIAL_PROMPT_RESOURCE_ID },
      repo_url: repoUrl,
      project_name: projectName,
      selected_domain_id: MOCK_DB_TEST_DOMAIN.id,
      selected_domain_overlay_id: overlayId,
      dialectic_domains: MOCK_DB_TEST_DOMAIN
    },
    stage: mockThesisStage,
  };
}

// Helper to create mock stage transition data
function mockStageTransitionData(
  targetStageId: string, 
  systemPromptId = 'fe6ec604-3cc1-41e5-ad75-8044247476c4',
  systemPromptText = 'Mock system prompt text'
) {
  return {
    target_stage: {
      id: targetStageId,
      slug: 'antithesis',
      display_name: 'Antithesis',
      default_system_prompt_id: systemPromptId,
      input_artifact_rules: { 
        sources: [
          { type: 'contribution', stage_slug: 'thesis', required: false },
          { type: 'feedback', stage_slug: 'thesis', required: true }
        ] 
      },
                        system_prompts: { 
        id: systemPromptId,
        prompt_text: systemPromptText
      },
      domain_specific_prompt_overlays: []
    }
  };
}

// Mock Logger
const mockLogger = new Logger('testLogger', 'DEBUG', {
  handlers: [], // No handlers means logs are discarded
});

Deno.test('submitStageResponses - All Scenarios', async (t) => {

  await t.step('3.7 Fails if an originalContributionId in a response is not found or not linked to the session', async () => {
    const testSessionId = '9dd2dd4f-60f4-4b6e-9d72-d2e54540c64f';
    const NON_EXISTENT_CONTRIB_ID = 'non-existent-contrib-id-3.7';
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: MOCK_PROJECT_ID,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: NON_EXISTENT_CONTRIB_ID, responseText: 'A response to a non-existent contribution.' }]
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'dialectic_sessions': { 
          select: { data: [createTestSessionData(testSessionId, MOCK_PROJECT_ID, 'DB Test Project 3.7', 'mock-repo-url-3.7')], error: null }
        },
        'dialectic_contributions': {
          select: { data: [], error: null } // Simulate that the contribution ID does not exist for this session
        },
      }
    };

    const { client: mockSupabaseClient } = createMockSupabaseClient(MOCK_USER_ID, mockDbConfig);
    const downloadFromStorageSpy = spy(async (_client: SupabaseClient, bucket: string, path: string) => {
      const buffer = await new Blob([`any other content for 3.7`]).arrayBuffer();
      return { data: buffer, error: null };
    });

    const mockDependencies: SubmitStageResponsesDependencies = {
        logger: mockLogger,
        fileManager: createMockFileManagerService(),
        downloadFromStorage: downloadFromStorageSpy,
    };

    const { error, status } = await submitStageResponses(mockPayload, mockSupabaseClient as unknown as SupabaseClient<Database>, MOCK_USER, mockDependencies);
    assertEquals(status, 400, `Test 3.7 failed.`);
    assertStringIncludes(error!.message, `Contribution with ID ${NON_EXISTENT_CONTRIB_ID} not found`);
  });

  await t.step('4.4 Handles failure when fetching context/previous contributions for prompt assembly', async () => {
    const testSessionId = 'e3c87449-b7e2-4549-992f-1c8ce247c9ab';
    const testContributionId = 'd921fcf5-3933-412e-b594-22fd8842579c';
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: MOCK_PROJECT_ID,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId, responseText: 'Some feedback' }],
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'dialectic_sessions': { 
          select: { data: [createTestSessionData(testSessionId, MOCK_PROJECT_ID, 'DB Test Project 4.4', 'mock-repo-url-4.4')], error: null }
        },
        'dialectic_stage_transitions': { 
          select: { data: [mockStageTransitionData('34961bdc-35ec-4f91-821d-7c73f5f76c0f')], error: null }
        },
        'dialectic_project_resources': {
          select: { data: null, error: new Error("Simulated DB error") }
        },
        'dialectic_contributions': {
           select: (state) => {
             if (state.selectColumns?.includes('id, storage_path, file_name, storage_bucket, model_name')) { // Prompt assembler fetch
                return Promise.resolve({ data: [{id: testContributionId, storage_path: 'path', file_name: 'file', storage_bucket: 'bucket', model_name: 'model'}], error: null, count: 1, status: 200, statusText: 'OK' });
             }
             return Promise.resolve({ data: [{id: testContributionId}], error: null, count: 1, status: 200, statusText: 'OK' }); // Validation fetch
            }
        }
      }
    };
    
    const { client: mockSupabaseClient } = createMockSupabaseClient(MOCK_USER_ID, mockDbConfig);
    const mockDependencies: SubmitStageResponsesDependencies = {
        logger: mockLogger,
        fileManager: createMockFileManagerService(),
        downloadFromStorage: spy(async () => ({ data: new ArrayBuffer(0), error: null })),
    };

    const { error, status } = await submitStageResponses(mockPayload, mockSupabaseClient as unknown as SupabaseClient<Database>, MOCK_USER, mockDependencies);

    assertEquals(status, 500, `Test 4.4 failed.`);
    assertStringIncludes(error!.message, `Could not find prompt resource details for ID ${MOCK_INITIAL_PROMPT_RESOURCE_ID}`);
  });

  await t.step('6.1 Successfully processes a typical payload with user feedback and advances to the next stage', async () => {
    const testSessionId = '4d0a27ef-87ac-4a62-ab0e-42913e7c7920';
    const testContributionId1 = 'd921fcf5-3933-412e-b594-22fd8842579c';
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: MOCK_PROJECT_ID,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{
        originalContributionId: testContributionId1,
        responseText: "This is a great starting point, but let's refine the core argument."
      }],
      userStageFeedback: { content: "Overall, the initial thesis is strong but could be more focused.", feedbackType: 'general' }
    };

    const downloadFromStorageSpy = spy(async (_client: SupabaseClient, bucket: string, path: string) => {
        const content = `Mocked download content for ${path} in test 6.1`;
        const buffer = await new Blob([content]).arrayBuffer();
        return await Promise.resolve({ data: buffer, error: null });
    });

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'dialectic_project_resources': { select: { data: [{ storage_bucket: "mock-bucket", storage_path: "mock/path", file_name: "initial.md" }], error: null }},
        'dialectic_sessions': {
          select: { data: [createTestSessionData(testSessionId, MOCK_PROJECT_ID, 'DB Test Project 6.1')], error: null },
          update: { data: [{ id: testSessionId, status: 'pending_antithesis', current_stage_id: '94cd4fee-b44c-465d-bad0-38e8e2116b5b' }], error: null }
        },
        'dialectic_stage_transitions': { 
          select: { data: [mockStageTransitionData('94cd4fee-b44c-465d-bad0-38e8e2116b5b')], error: null }
        },
        'system_prompts': {
          select: { data: [{ prompt_text: 'Mock system prompt text' }], error: null }
        },
        'dialectic_contributions': {
          select: { data: [
            { id: testContributionId1, storage_path: 'path/to/thesis1.md', file_name: 'thesis1.md', storage_bucket: MOCK_CONTRIBUTIONS_BUCKET, model_name: 'test-model-1' },
          ], error: null }
        },
        'dialectic_stages': {
          select: { data: [{ slug: 'thesis', display_name: 'Thesis'}], error: null }
        },
        'dialectic_feedback': {
          select: { data: [{
            storage_bucket: MOCK_CONTRIBUTIONS_BUCKET,
            storage_path: 'mock/path/to/feedback.md',
            file_name: 'user_feedback_thesis.md'
          }], error: null }
        },
      }
    };

    const { client: mockSupabaseClient } = createMockSupabaseClient(MOCK_USER_ID, mockDbConfig);
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'mock-feedback-id',
        user_id: MOCK_USER_ID,
        session_id: testSessionId,
        storage_path: 'mock/path/to/feedback.md',
        file_name: 'user_feedback_thesis.md',
        storage_bucket: MOCK_CONTRIBUTIONS_BUCKET,
        created_at: new Date().toISOString(),
        feedback_type: 'general',
        project_id: MOCK_PROJECT_ID,
        iteration_number: 1,
        mime_type: 'text/markdown',
        resource_description: null,
        size_bytes: 100,
        stage_slug: mockThesisStage.slug,
        updated_at: new Date().toISOString()
    }, null);

    const mockDependencies: SubmitStageResponsesDependencies = {
      logger: mockLogger,
      fileManager: mockFileManager,
      downloadFromStorage: downloadFromStorageSpy,
    };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabaseClient as unknown as SupabaseClient<Database>, MOCK_USER, mockDependencies);

    assertEquals(status, 200, `Test 6.1 failed. Error: ${error?.message}`);

    assertEquals(data!.updatedSession.status, 'pending_antithesis');
    assertExists(data!.nextStageSeedPromptPath);

    const uploadCalls = mockFileManager.uploadAndRegisterFileSpy.calls;
    assert(uploadCalls.some((call: any) => {
      const context: UploadContext = call.args[0];
      return context.pathContext.originalFileName && context.pathContext.originalFileName.includes('user_feedback_thesis.md');
    }), 'Expected user feedback file to be saved.');
  });

  await t.step('6.4 Handles case where no AI contributions (context) are found for current stage', async () => {
    const testSessionId = 'e5e88c7e-c79c-433a-b3f9-15cc31396c49';
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: MOCK_PROJECT_ID,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: []
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'dialectic_project_resources': { select: { data: [{ storage_bucket: "mock-bucket", storage_path: "mock/path", file_name: "initial.md" }], error: null }},
        'dialectic_sessions': { 
          select: { data: [createTestSessionData(testSessionId, MOCK_PROJECT_ID, 'DB Test Project 6.4', 'mock-repo-url-6.4')], error: null },
          update: { data: [{ id: testSessionId, status: 'pending_antithesis', current_stage_id: 'c6aaf630-e80e-4423-9452-b6d02385c2ce' }], error: null }
        },
        'dialectic_stage_transitions': {
          select: {
            data: [{
              target_stage: {
                id: 'c6aaf630-e80e-4423-9452-b6d02385c2ce',
                slug: 'antithesis',
                display_name: 'Antithesis',
                default_system_prompt_id: 'fe6ec604-3cc1-41e5-ad75-8044247476c4',
                input_artifact_rules: {
                  sources: [
                    { type: 'contribution', stage_slug: 'thesis', required: false },
                    { type: 'feedback', stage_slug: 'thesis', required: false }
                  ]
                },
                system_prompts: {
                  id: 'fe6ec604-3cc1-41e5-ad75-8044247476c4',
                  prompt_text: 'Mock system prompt text'
                },
                domain_specific_prompt_overlays: []
              }
            }],
            error: null
          }
        },
        'system_prompts': {
          select: { data: [{ prompt_text: 'Mock system prompt text' }], error: null }
        },
        'dialectic_contributions': {
          select: { data: [], error: null }
        },
        'dialectic_stages': {
          select: { data: [{ slug: 'thesis', display_name: 'Thesis'}], error: null }
        },
      }
    };
    const { client: mockSupabaseClient } = createMockSupabaseClient(MOCK_USER_ID, mockDbConfig);
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'mock-seed-prompt-file-id',
        user_id: MOCK_USER_ID,
        session_id: testSessionId,
        storage_path: 'mock/path/to/seed_prompt.md',
        file_name: 'seed_prompt.md',
        storage_bucket: MOCK_CONTRIBUTIONS_BUCKET,
        created_at: new Date().toISOString(),
        feedback_type: 'general',
        project_id: MOCK_PROJECT_ID,
        iteration_number: 1,
        mime_type: 'text/markdown',
        resource_description: null,
        size_bytes: 100,
        stage_slug: mockThesisStage.slug,
        updated_at: new Date().toISOString()
    }, null);

    const downloadSpy = spy(async (_client: SupabaseClient, bucket: string, path: string): Promise<{ data: ArrayBuffer | null, error: Error | null }> => {
        let content: string | ArrayBuffer = 'default mock content';
        if (path.endsWith('user_feedback_thesis.md')) {
             content = 'mock user feedback'; // Provide non-empty content
        } else if (path.includes(MOCK_INITIAL_PROMPT_PATH)) {
            content = MOCK_INITIAL_PROMPT_CONTENT;
        } else {
           content = `Mock content for path: ${path}`;
        }
        
        const blob = new Blob([content]);
        const buffer = await blob.arrayBuffer();
        return await Promise.resolve({ data: buffer, error: null });
    });

    const mockDependencies: SubmitStageResponsesDependencies = {
        logger: mockLogger,
        fileManager: mockFileManager,
        downloadFromStorage: downloadSpy,
    };

    const { data, status, error } = await submitStageResponses(mockPayload, mockSupabaseClient as unknown as SupabaseClient<Database>, MOCK_USER, mockDependencies);

    assertEquals(status, 200, `Test 6.4 failed. Error: ${error?.message}`);
    assertEquals(data!.updatedSession.status, 'pending_antithesis');
    assertExists(data!.nextStageSeedPromptPath, "Seed prompt file ID should exist");
  });
});