import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import { posix, join } from "https://deno.land/std@0.218.2/path/mod.ts";

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  type MockPGRSTError,
  type IMockStorageDownloadResponse,
} from '../_shared/supabase.mock.ts';
import {
  type DialecticStage,
  type SubmitStageResponsesPayload,
  type DialecticProject,
  type DialecticProjectResource,
} from './dialectic.interface.ts';
import { createMockFileManagerService, type MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { UploadContext, FileManagerResponse, FileRecord } from "../_shared/types/file_manager.types.ts";
import type { Database } from '../types_db.ts';
import type { ServiceError } from '../_shared/types.ts';
import { downloadFromStorage } from '../_shared/supabase_storage_utils.ts';

// Import the specific action handler we are testing
import { submitStageResponses } from './submitStageResponses.ts';
import { logger } from "../_shared/logger.ts";

const MOCK_STORAGE_TEST_DOMAIN = {
  id: "storage-test-domain-id",
  name: "Storage Test Domain",
  description: "A domain for storage interaction testing."
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
  const MOCK_MODEL_ID = crypto.randomUUID();

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
      input_artifact_rules: { sources: [{ type: 'contribution', stage_slug: 'thesis' }, { type: 'feedback', stage_slug: 'thesis', required: false }] },
      created_at: new Date().toISOString(),
      description: null,
      expected_output_artifacts: {},
  };

  // Enhanced mockAntithesisStage for Test 5.3 to include system_prompts directly
  const mockAntithesisStageWithSystemPrompt = {
    ...mockAntithesisStage, // Spread the original mockAntithesisStage
    system_prompts: { id: testSystemPromptId, prompt_text: 'Mock system prompt for antithesis stage' }
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


  await t.step('5.1 Handles failure when uploading the consolidated user feedback file', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
      userStageFeedback: {
        content: "This is specific user stage feedback for test 5.1.",
        feedbackType: "TestFeedbackType_5_1",
        resourceDescription: { summary: "Resource description for test 5.1 feedback" }
      }
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId,
            iteration_count: 1,
            selected_model_ids: [MOCK_MODEL_ID],
            project: { 
              id: testProjectId, 
              user_id: testUserId,
              process_template_id: testProcessTemplateId,
              initial_prompt_resource_id: "mock-initial-prompt-resource-id",
              repo_url: "mock-repo-url",
              project_name: "Storage Test Project 5.1",
              selected_domain_id: MOCK_STORAGE_TEST_DOMAIN.id,
              selected_domain_overlay_id: "mock-selected-domain-overlay-id",
              dialectic_domains: {
                id: MOCK_STORAGE_TEST_DOMAIN.id,
                name: MOCK_STORAGE_TEST_DOMAIN.name,
                description: MOCK_STORAGE_TEST_DOMAIN.description
              }
            },
            stage: mockThesisStage
        }] } },
        dialectic_feedback: { insert: { data: [{id: 'fb-id'}] } },
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        },
        dialectic_project_resources: {
            select: { data: [{ storage_bucket: "mock-bucket", storage_path: "mock/path", file_name: "initial.md" }], error: null }
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(null, { message: 'Upload failed miserably' });
    
    const mockDependencies = {
        logger,
        downloadFromStorage: spy((): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({data: null, error: null})),
        fileManager: mockFileManager,
        indexingService: { indexDocument: () => Promise.resolve({ success: true, tokensUsed: 0 }) },
        embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) }
    };

    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);
    
    // Assert
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, "Failed to store user feedback.");
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "FileManager should have been called once and failed");
  });

  await t.step('5.2 Handles failure when uploading the rendered seed prompt for the next stage', async () => {
    // 5.2.1 Arrange
    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy(async (context: UploadContext) => {
      if (context.pathContext.fileType === 'seed_prompt') {
        return await Promise.resolve({
          record: null,
          error: { message: 'Simulated upload failure' },
        });
      }
      return await Promise.resolve({
        record: {
          id: 'fb-resource-id',
          project_id: testProjectId,
          user_id: testUserId,
          storage_bucket: 'test',
          storage_path: 'path',
          file_name: 'f',
          mime_type: 'm',
          size_bytes: 1,
          created_at: 'c',
          updated_at: 'u',
          resource_description: null,
        },
        error: null,
      });
    });

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: 'thesis',
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Response text" },
      ],
    };

    const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_sessions: {
                select: {
                    data: [{
                        id: testSessionId,
                        iteration_count: 1,
                        selected_model_ids: [MOCK_MODEL_ID],
                        project: {
                            id: testProjectId,
                            user_id: testUserId,
                            process_template_id: testProcessTemplateId,
                            initial_prompt_resource_id: "mock-initial-prompt-resource-id",
                            repo_url: "mock-repo-url",
                            project_name: "Storage Test Project 5.2",
                            selected_domain_id: MOCK_STORAGE_TEST_DOMAIN.id,
                            selected_domain_overlay_id: "mock-selected-domain-overlay-id",
                            dialectic_domains: {
                              id: MOCK_STORAGE_TEST_DOMAIN.id,
                              name: MOCK_STORAGE_TEST_DOMAIN.name,
                              description: MOCK_STORAGE_TEST_DOMAIN.description
                            }
                        },
                        stage: mockThesisStage,
                    }],
                },
                update: {
                    data: [{
                        id: testSessionId,
                        status: `pending_${mockAntithesisStage.slug}`,
                    }],
                },
            },
            ai_providers: {
              select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
            },
            dialectic_feedback: { insert: { data: [{id: 'fb-id'}] } },
            dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId, storage_bucket: 'test-bucket', storage_path: 'ai_contributions', file_name: 'contribution.md' }] } },
            dialectic_stage_transitions: { 
                select: { 
                    data: [{ 
                        target_stage: {
                            ...mockAntithesisStage,
                            system_prompts: { id: mockAntithesisStage.default_system_prompt_id, prompt_text: 'Next prompt' }
                        }
                    }] 
                } 
            },
            system_prompts: {
                select: { data: [{ prompt_text: 'Next prompt' }], error: null }
            },
            dialectic_process_templates: {
              select: { data: [mockProcessTemplate] }
            },
            dialectic_stages: {
                select: { data: [{ slug: 'thesis', display_name: 'Thesis' }], error: null }
            },
            dialectic_project_resources: {
                select: { data: [{ storage_bucket: "mock-bucket", storage_path: "mock/path", file_name: "initial.md" }], error: null }
            }
        }
    };
    const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new ArrayBuffer(0), error: null }));
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);

    // 5.2.2 Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, {
      logger,
      downloadFromStorage: mockDownloadFromStorage,
      fileManager: mockFileManager,
      indexingService: { indexDocument: () => Promise.resolve({ success: true, tokensUsed: 0 }) },
      embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) }
    });
    
    // 5.2.3 Assert
    assertEquals(status, 500, 'Expected status 500 on seed prompt upload failure');
    assertExists(error, 'Expected an error object to be returned');
    assertStringIncludes(error.message, "Failed to store seed prompt for next stage", "Error message for seed prompt upload failure did not match");
    assertEquals(data, undefined, "Expected data to be undefined as the function should have exited early.");
  });

  await t.step('5.3 Handles failure when downloading AI contribution content (for seed prompt context)', async () => {
    // 5.3.1 Arrange
    const testUserId5_3 = crypto.randomUUID();
    const testSessionId5_3 = crypto.randomUUID();
    const testProjectId5_3 = crypto.randomUUID();
    const testProcessTemplateId5_3 = crypto.randomUUID();
    const testContributionId5_3 = crypto.randomUUID();
    const testInitialPromptResourceId5_3 = 'initial-prompt-res-id-5.3';
    
    const initialPromptStoragePath5_3 = 'project_setups/initial_prompt_content_5_3.md';
    const contributionFileDirectory5_3 = 'ai_contributions/iteration_1_thesis_dir'; 
    const contributionFileName5_3 = 'ai_contribution_thesis_5_3.md';
    const expectedFailedContributionDownloadPath = posix.join(contributionFileDirectory5_3, contributionFileName5_3);

    const userFeedbackStoragePath5_3 = `projects/${testProjectId5_3}/sessions/${testSessionId5_3}/iteration_1/${mockThesisStage.slug}/user_feedback_${mockThesisStage.slug}.md`;

    const mockUserInstance5_3: User = { 
      id: testUserId5_3, 
      app_metadata: {}, 
      user_metadata: {}, 
      aud: 'test-aud', 
      created_at: new Date().toISOString() 
    };

    const mockPayload5_3: SubmitStageResponsesPayload = {
      sessionId: testSessionId5_3,
      projectId: testProjectId5_3,
      stageSlug: mockThesisStage.slug, // Current stage is thesis
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId5_3, responseText: "User response based on AI output that will fail download" }],
    };

    const mockDbConfig5_3: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === testSessionId5_3)) {
              return Promise.resolve({
                data: [{
                  id: testSessionId5_3,
                  iteration_count: 1,
                  selected_model_ids: [MOCK_MODEL_ID],
                  project: {
                    id: testProjectId5_3,
                    user_id: testUserId5_3,
                    process_template_id: testProcessTemplateId5_3,
                    initial_prompt_resource_id: testInitialPromptResourceId5_3,
                    repo_url: "mock-repo-url-5.3",
                    project_name: "Test Project 5.3",
                    selected_domain_id: MOCK_STORAGE_TEST_DOMAIN.id,
                    selected_domain_overlay_id: "mock-selected-domain-overlay-id",
                    dialectic_domains: { id: MOCK_STORAGE_TEST_DOMAIN.id, name: "Test Domain" },
                    process_template: { id: testProcessTemplateId5_3 }
                  },
                  stage: { ...mockThesisStage } // Current stage
                }], error: null, status: 200, count: 1
              });
            }
            return Promise.resolve({ data: null, error: new Error("Session not found in 5.3 mock"), status: 404, count: 0 });
          },
          update: () => Promise.resolve({ data: [{ id: testSessionId5_3 }], error: null, status: 200, count: 1 }) // Should not be reached if download fails
        },
        ai_providers: {
          select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
        dialectic_stage_transitions: {
          select: () => Promise.resolve({ // Transition from thesis to antithesis
            data: [{ target_stage: { ...mockAntithesisStage, system_prompts: { id: 'antithesis-sys-prompt-id', prompt_text: 'Antithesis system prompt' } } }],
            error: null, status: 200, count: 1
          })
        },
        dialectic_project_resources: { // For initial project prompt
          select: (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === testInitialPromptResourceId5_3)) {
              return Promise.resolve({ data: [{ storage_bucket: 'test-bucket', storage_path: 'project_setups', file_name: 'initial_prompt_content_5_3.md' }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: null, error: new Error("Initial prompt resource not found"), status: 404, count: 0 });
          }
        },
        dialectic_contributions: { // For AI contribution from current stage (thesis)
          select: (state) => {
            // Handle the initial contribution validation query
            if (
                state.selectColumns === 'id' &&
                state.filters.some(f => f.column === 'session_id' && f.value === testSessionId5_3) &&
                state.filters.some(f => f.column === 'stage' && f.value === mockThesisStage.slug) &&
                state.filters.some(f => f.column === 'iteration_number' && f.value === 1) &&
                !state.filters.some(f => f.column === 'is_latest_edit')
            ) {
                return Promise.resolve({
                    data: [{ id: testContributionId5_3 }],
                    error: null, status: 200, count: 1
                });
            }

            // Handle the PromptAssembler query for contribution content
            if (state.filters.some(f => f.column === 'session_id' && f.value === testSessionId5_3) &&
                state.filters.some(f => f.column === 'stage' && f.value === mockThesisStage.slug) &&
                state.filters.some(f => f.column === 'iteration_number' && f.value === 1) &&
                state.filters.some(f => f.column === 'is_latest_edit' && f.value === true)
            ) {
              return Promise.resolve({
                data: [{
                  id: testContributionId5_3,
                  model_name: "TestModel",
                  storage_path: contributionFileDirectory5_3,
                  storage_bucket: 'test-bucket',
                  file_name: contributionFileName5_3,
                }], error: null, status: 200, count: 1
              });
            }
            return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
          }
        },
        dialectic_stages: { // For PromptAssembler input rule processing
          select: (state) => {
            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(mockThesisStage.slug))) {
                return Promise.resolve({ data: [{ slug: mockThesisStage.slug, display_name: mockThesisStage.display_name}], error: null, status: 200, count: 1});
            }
             return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
          }
        },
        dialectic_user_stage_feedback: { // If PromptAssembler fetches feedback for current stage
            select: () => Promise.resolve({ 
                data: [{ 
                    storage_path: userFeedbackStoragePath5_3, 
                    storage_bucket: 'dialectic-contributions' 
                    // Other fields as needed
                }], 
                error: null, status: 200, count: 1
            }),
        }
      },
      storageMock: {
        downloadResult: (bucketId: string, path: string): Promise<IMockStorageDownloadResponse> => {
          const normalizedPath = path.replace(/\\/g, '/');
          // Define expected path for AI contribution download failure INSIDE the mock using pathPosix.join
          const currentExpectedFailedPathUsingPosix = posix.join(contributionFileDirectory5_3, contributionFileName5_3);

          // --- BEGIN DEBUG LOGS (can be removed after test passes) ---
          console.log(`[Test 5.3 Mock Storage Debug] Comparing paths for bucket: ${bucketId}`);
          console.log(`[Test 5.3 Mock Storage Debug]   Received Path: "${path}" (Normalized: "${normalizedPath}")`);
          console.log(`[Test 5.3 Mock Storage Debug]   Expected Fail Path (posix): "${currentExpectedFailedPathUsingPosix}"`);
          console.log(`[Test 5.3 Mock Storage Debug]   Is Match? ${normalizedPath === currentExpectedFailedPathUsingPosix}`);
          // --- END DEBUG LOGS ---

          if (bucketId === 'test-bucket' && normalizedPath === currentExpectedFailedPathUsingPosix) { 
            console.log(`[Test 5.3 Mock Storage] Intentionally failing download for AI contribution: ${bucketId}/${normalizedPath}`);
            return Promise.resolve({ data: null, error: new Error('Simulated download failure for AI contribution in test 5.3') });
          }
          if (bucketId === 'test-bucket' && normalizedPath === initialPromptStoragePath5_3) {
            console.log(`[Test 5.3 Mock Storage] Successfully downloading initial prompt: ${bucketId}/${normalizedPath}`);
            const contentBuffer = new TextEncoder().encode("Mock initial project prompt for 5.3").buffer;
            return Promise.resolve({ data: new Blob([new Uint8Array(contentBuffer)]), error: null });
          }
          if (bucketId === 'dialectic-contributions' && normalizedPath === userFeedbackStoragePath5_3) {
             console.log(`[Test 5.3 Mock Storage] Successfully downloading user feedback: ${bucketId}/${normalizedPath}`);
             const feedbackBuffer = new TextEncoder().encode("Mock user feedback content for 5.3").buffer;
            return Promise.resolve({ data: new Blob([new Uint8Array(feedbackBuffer)]), error: null });
          }
          console.warn(`[Test 5.3 Mock Storage] Unexpected download attempt in test 5.3: ${bucketId}/${normalizedPath}`);
          return Promise.resolve({ data: null, error: new Error(`Unexpected download path in test 5.3: ${normalizedPath}`) });
        }
      }
    };

    const { client: mockSupabaseClient5_3 } = createMockSupabaseClient(testUserId5_3, mockDbConfig5_3);
    const mockFileManager5_3 = createMockFileManagerService();
    // uploadAndRegisterFile for the *next stage's seed prompt* should not be called if assembly fails.

    // 5.3.2 Act
    const { data, error, status } = await submitStageResponses(
      mockPayload5_3,
      mockSupabaseClient5_3 as unknown as SupabaseClient<Database>,
      mockUserInstance5_3,
      { logger, fileManager: mockFileManager5_3, downloadFromStorage, indexingService: { indexDocument: () => Promise.resolve({ success: true, tokensUsed: 0 }) }, embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) } }
    );

    // 5.3.3 Assert
    assertEquals(status, 500, `Expected 500 but got ${status}. Error: ${error?.message}`);
    assertExists(error, "Expected an error object when AI contribution download fails.");
    assertStringIncludes(error.message, "Failed to assemble seed prompt for next stage: Failed to gather inputs for prompt assembly:", "Error message preamble for seed prompt prep did not match");
    assertStringIncludes(error.message, "Failed to download REQUIRED content for contribution", "Expected download failure details to be included in the error message");
    assertEquals(data, undefined, "Data should be undefined on failure.");
    assertEquals(mockFileManager5_3.uploadAndRegisterFile.calls.length, 0, "FileManager.uploadAndRegisterFile for next stage's seed prompt should not have been called.");
  });

  await t.step('5.4 Handles failure during fileManager.uploadAndRegisterFile for user feedback, database insertion is rolled back or not committed', async () => {
    // This test ensures that if file upload fails, subsequent DB operations like feedback record insertion might be affected (e.g., rolled back or not committed)
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
      userStageFeedback: { 
        content: "User feedback that will fail to save", 
        feedbackType: "TestFeedback_5_4",
        resourceDescription: { summary: "Feedback for 5.4" }
      }
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { 
            select: { data: [{ 
                id: testSessionId,
                iteration_count: 1,
                selected_model_ids: [MOCK_MODEL_ID],
                project: { 
                  id: testProjectId, 
                  user_id: testUserId,
                  process_template_id: testProcessTemplateId,
                  initial_prompt_resource_id: "mock-initial-prompt-resource-id",
                  repo_url: "mock-repo-url",
                  project_name: "Storage Test Project 5.4",
                  selected_domain_id: MOCK_STORAGE_TEST_DOMAIN.id,
                  selected_domain_overlay_id: "mock-selected-domain-overlay-id",
                  dialectic_domains: { 
                    id: MOCK_STORAGE_TEST_DOMAIN.id,
                    name: MOCK_STORAGE_TEST_DOMAIN.name,
                    description: MOCK_STORAGE_TEST_DOMAIN.description
                  }
                },
                stage: mockThesisStage
            }] },
            update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] } // Mock for session update to next stage
        },
        ai_providers: {
          select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
        // If feedback file upload fails, the dialectic_feedback insert via fileManager might not occur or might be part of a rolled-back transaction.
        // For this test, we assume the function continues and attempts other operations.
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
        dialectic_process_templates: { select: { data: [mockProcessTemplate] } },
        // The following mocks allow the function to proceed after the user feedback save fails
        dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }] } },
        system_prompts: { select: { data: [{ id: mockAntithesisStage.default_system_prompt_id, prompt_text: 'Next prompt for antithesis' }] } },
        dialectic_project_resources: {
            select: { data: [{ storage_bucket: "mock-bucket", storage_path: "mock/path", file_name: "initial.md" }], error: null }
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockFileManager = createMockFileManagerService();
    
    // Simulate fileManager.uploadAndRegisterFile failing for user_feedback
    mockFileManager.setUploadAndRegisterFileResponse(null, { message: "Simulated feedback upload failure" });

    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, {
      logger,
      downloadFromStorage: spy((): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({data: new ArrayBuffer(0), error: null})),
      fileManager: mockFileManager,
      indexingService: { indexDocument: () => Promise.resolve({ success: true, tokensUsed: 0 }) },
      embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) }
    });
    
    // Assert based on current function behavior (returns 500 on feedback save failure)
    assertEquals(status, 500, error ? `Expected 500 but got ${status} with error: ${error.message}`: 'Expected 500');
    assertExists(error, "Expected a top-level error when user feedback saving fails.");
    assertStringIncludes(error.message, "Failed to store user feedback", "Error message for user feedback save failure did not match");
    assertEquals(data, undefined, "Expected data to be undefined as the function should have exited early.");
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "Expected fileManager to be called only for feedback (which failed)");
  });

});
